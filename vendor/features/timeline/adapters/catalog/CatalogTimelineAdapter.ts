import type {
  TimelineAdapter,
  TimelineTimestampOwner,
  TimelineTurnSource,
  TimelineTurnSnapshot,
} from '../../TimelineAdapter';
import type { TimelineMarker } from '../../types';
import { createCatalogTimelineStoragePolicy } from './CatalogTimelineStorage';
import { CatalogTurnOwnership } from './CatalogTurnOwnership';
import type { CatalogTimelineConfig } from './config';
import type { CatalogSendTimestamps } from './sendTimestamps';
import { turnSummary, userTurnDisplayOverride, userTurnSummary } from './turnHash';
import { hostTurnId } from './hostTurnId';
import { type Marker, type MountedTurn, mergeMountedTurns, rememberedMarkers } from './turnMerge';
import { mountedOwnershipTurns } from './turnOwnership';
import { renderedCheck, togglesVisibility } from './turnVisibility';

/** Site selectors and virtualized DOM identity; every visual surface belongs to the shared engine. */
export class CatalogTimelineAdapter implements TimelineAdapter {
  readonly route: { siteId: string; url: string };
  readonly mount: { anchor: () => HTMLElement; position: 'left' | 'right' };
  readonly storage;
  readonly turns: CatalogTimelineTurnSource;
  constructor(
    config: CatalogTimelineConfig,
    ownership: CatalogTurnOwnership,
    private readonly sendTimes: CatalogSendTimestamps | null = null,
  ) {
    this.route = { siteId: config.siteId, url: location.href.split('#')[0] };
    this.mount = { anchor: () => document.body, position: config.position };
    this.storage = createCatalogTimelineStoragePolicy(config, ownership, this.route.url);
    this.turns = new CatalogTimelineTurnSource(config, ownership);
  }
  viewport(element: HTMLElement): HTMLElement {
    return this.turns.viewport(element);
  }
  timestamps(): TimelineTimestampOwner | null {
    return this.sendTimes?.ownerFor(this.route.url) ?? null;
  }
}

const THREAD_ANCHOR_ATTR = 'data-gv-thread-anchor';
const THREAD_ANCHOR_LAYER_ATTR = 'data-gv-thread-anchor-layer';
const THREAD_ANCHOR_SELECTOR = `div[${THREAD_ANCHOR_ATTR}]`;

class CatalogTimelineTurnSource implements TimelineTurnSource {
  readonly navigation = 'virtualized';
  get root(): HTMLElement | null {
    return document.body;
  }
  private activeScope(): HTMLElement | null {
    if (this.config.activePageSelector && typeof document.querySelector === 'function') {
      const active = document.querySelector<HTMLElement>(this.config.activePageSelector);
      if (active) return active.querySelector<HTMLElement>('main') ?? active;
      const attrMatch = this.config.activePageSelector.match(/^\[([^\]=]+)/);
      if (attrMatch && document.querySelector(`[${attrMatch[1]}]`)) return null;
    }
    return this.root;
  }
  private mirroredAnchors(
    scope: HTMLElement,
    isRendered: (element: Element) => boolean,
  ): HTMLElement[] {
    if (!this.config.threadMirror || typeof scope.querySelectorAll !== 'function') return [];
    const routeId =
      typeof location !== 'undefined'
        ? (location.pathname.match(/(?:^|\/)c\/([^/?#]+)/)?.[1] ?? null)
        : null;
    const layers = Array.from(scope.querySelectorAll<HTMLElement>(`[${THREAD_ANCHOR_LAYER_ATTR}]`));
    for (const layer of layers) {
      if (!isRendered(layer)) continue;
      const owner = layer.getAttribute('data-gv-thread-conversation');
      if (routeId && owner && owner !== routeId) continue;
      const anchors = Array.from(
        layer.querySelectorAll<HTMLElement>(THREAD_ANCHOR_SELECTOR),
      ).filter(isRendered);
      if (anchors.length > 0) return anchors;
    }
    return [];
  }
  get anchor(): HTMLElement | null {
    const scope = this.activeScope();
    if (!scope) return this.root;
    const isRendered = renderedCheck();
    return (
      Array.from(scope.querySelectorAll<HTMLElement>(this.config.turnSelector)).find(isRendered) ??
      this.mirroredAnchors(scope, isRendered)[0] ??
      scope
    );
  }
  count(): number {
    const scope = this.activeScope();
    if (!scope) return 0;
    if (this.config.threadMirror) {
      const anchors = this.mirroredAnchors(scope, renderedCheck());
      if (anchors.length > 0) return anchors.length;
    }
    return scope.querySelectorAll(this.config.turnSelector).length;
  }
  resolveLiveTarget(turnKey: string): { element: HTMLElement; mounted: boolean } | null {
    if (!turnKey) return null;
    const scope = this.activeScope();
    if (!scope || typeof scope.querySelectorAll !== 'function') return null;
    const isRendered = renderedCheck();
    for (const element of scope.querySelectorAll<HTMLElement>(this.config.turnSelector)) {
      if (isRendered(element) && hostTurnId(this.config.siteId, element) === turnKey) {
        return { element, mounted: true };
      }
    }
    if (!this.config.threadMirror) return null;
    const anchor = this.mirroredAnchors(scope, isRendered).find(
      (candidate) => candidate.getAttribute(THREAD_ANCHOR_ATTR) === turnKey,
    );
    return anchor ? { element: anchor, mounted: false } : null;
  }
  refresh(): boolean {
    return !!this.root;
  }
  async initialize(signal: AbortSignal): Promise<boolean> {
    return !signal.aborted && this.refresh();
  }
  observe(callback: MutationCallback): MutationObserver {
    this.detachListeners();
    if (this.config.siteId === 'chatgpt') document.addEventListener('submit', this.onEditSubmit, true);
    if (this.config.siteId === 'claude') document.addEventListener('click', this.onClaudeEditClick, true);
    const observer = new MutationObserver((records, owner) => {
      if (this.shouldRefresh(records)) callback(records, owner);
    });
    if (
      this.config.threadMirror &&
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      this.onMirrorUpdated = () => callback([], observer);
      window.addEventListener('message', this.onThreadMessage);
    }
    if (this.root)
      observer.observe(this.root, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['style', 'hidden'],
      });
    return observer;
  }
  private known: Marker[] = [];
  private onMirrorUpdated: (() => void) | null = null;
  private readonly onThreadMessage = (event: MessageEvent): void => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.__gvType === 'gv-thread-updated') this.onMirrorUpdated?.();
  };
  private detachListeners(): void {
    document.removeEventListener('submit', this.onEditSubmit, true);
    document.removeEventListener('click', this.onClaudeEditClick, true);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('message', this.onThreadMessage);
    }
    this.onMirrorUpdated = null;
  }
  private readonly onClaudeEditClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('button');
    if (!button || button.hasAttribute('disabled')) return;
    if (button.matches('[data-testid="user-message-previous-version"], [data-testid="user-message-next-version"]')) {
      const id = hostTurnId('claude', button);
      const index = this.known.findIndex((marker) => marker.hostTurnId === id);
      if (id && index >= 0) this.known = this.known.slice(0, index);
      return;
    }
    const editor = button?.closest('[data-testid="message-edit-box"]');
    if (!editor) return;
    const buttons = editor.querySelectorAll('button[data-cds="Button"]');
    if (buttons.length < 2 || buttons[buttons.length - 1] !== button) return;
    const id = editor.getAttribute('data-message-uuid');
    const index = this.known.findIndex((marker) => marker.hostTurnId === id);
    if (id && index >= 0) this.known = this.known.slice(0, index);
  };
  private readonly onEditSubmit = (event: Event): void => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.querySelector('[contenteditable="true"]')) return;
    const id = hostTurnId('chatgpt', form);
    if (!id) return;
    const index = this.known.findIndex((marker) => marker.hostTurnId === id);
    // Editing creates a new conversation branch, invalidating this turn and its descendants.
    if (index >= 0) this.known = this.known.slice(0, index);
  };
  private readonly originalStamps = new Map<HTMLElement, string | null>();

  constructor(
    private readonly config: CatalogTimelineConfig,
    private readonly ownership: CatalogTurnOwnership,
  ) {}
  viewport(element: HTMLElement): HTMLElement {
    if (this.config.scrollContainerSelector) {
      try {
        if (typeof element.closest === 'function') {
          const closest = element.closest<HTMLElement>(this.config.scrollContainerSelector);
          if (closest) return closest;
        }
        const scope = this.activeScope();
        if (scope && typeof scope.querySelectorAll === 'function') {
          const isRendered = renderedCheck();
          const scoped = Array.from(
            scope.querySelectorAll<HTMLElement>(this.config.scrollContainerSelector),
          ).filter(isRendered);
          const containing = scoped.find((candidate) => candidate.contains(element));
          if (containing) return containing;
          if ((element === this.root || element === scope) && scoped[0]) return scoped[0];
        }
        if (typeof document.querySelectorAll === 'function') {
          const configured = Array.from(
            document.querySelectorAll<HTMLElement>(this.config.scrollContainerSelector),
          ).find((candidate) => candidate.contains(element));
          if (configured) return configured;
        }
      } catch {
        /* Fall back to the nearest scroll ancestor for stale catalog selectors. */
      }
    }
    for (
      let parent = element.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (
        /(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY) &&
        parent.scrollHeight > parent.clientHeight
      )
        return parent;
    }
    return document.scrollingElement instanceof HTMLElement
      ? document.scrollingElement
      : document.documentElement;
  }

  read(previous: TimelineMarker[]): TimelineTurnSnapshot {
    const scope = this.activeScope();
    if (!scope) return { markers: [], mountedCount: 0 };
    const isRendered = renderedCheck();
    const selector = this.config.turnSelector;
    const domElements = Array.from(scope.querySelectorAll<HTMLElement>(selector)).filter(isRendered);
    const anchors = this.mirroredAnchors(scope, isRendered);
    let mounted: MountedTurn[];
    if (anchors.length > 0) {
      const mountedByKey = new Map<string, HTMLElement>();
      for (const element of domElements) {
        const key = hostTurnId(this.config.siteId, element);
        if (key && !mountedByKey.has(key)) mountedByKey.set(key, element);
      }
      mounted = anchors.map((anchor) => {
        const key = anchor.getAttribute(THREAD_ANCHOR_ATTR) || undefined;
        const bubble = key ? mountedByKey.get(key) : undefined;
        const element = bubble ?? anchor;
        const summary = userTurnSummary(element);
        return {
          element,
          summary,
          attachmentPlaceholder:
            summary === '【附件】' &&
            (bubble ? !turnSummary(bubble) : !(anchor.getAttribute('data-gv-text') ?? '').trim()),
          displaySummary: userTurnDisplayOverride(this.config.siteId, element),
          hostTurnId: key,
        };
      });
    } else {
      mounted = domElements.map((element) => {
        const summary = userTurnSummary(element);
        return {
          element,
          summary,
          attachmentPlaceholder:
            summary === '【附件】' &&
            (element.matches('[data-cds="UserMessage"]') || !turnSummary(element)),
          displaySummary: userTurnDisplayOverride(this.config.siteId, element),
          hostTurnId: hostTurnId(this.config.siteId, element),
        };
      });
    }
    for (const turn of mounted)
      if (!this.originalStamps.has(turn.element))
        this.originalStamps.set(turn.element, turn.element.getAttribute('data-gv-turn-id'));
    const viewport = this.viewport(mounted[0]?.element ?? scope);
    const viewportTop =
      viewport === document.documentElement || viewport === document.body
        ? 0
        : viewport.getBoundingClientRect().top;
    const offset =
      viewport === document.documentElement || viewport === document.body
        ? window.scrollY
        : viewport.scrollTop;
    const viewportStyle = getComputedStyle(viewport);
    const reverse =
      viewportStyle.flexDirection === 'column-reverse' && /flex/.test(viewportStyle.display);
    const scrollTop = reverse
      ? Math.max(0, viewport.scrollHeight - viewport.clientHeight + offset)
      : offset;
    const old = new Map(previous.map((marker) => [marker.id, marker]));
    // Shared navigation remeasures returned markers; carry its frame back into the merge owner.
    for (const marker of this.known) {
      const measured = old.get(marker.id);
      if (measured?.center !== undefined) marker.center = measured.center;
      if (measured?.measuredAt !== undefined) marker.measuredAt = measured.measuredAt;
    }
    const centerOf = (element: HTMLElement): number => {
      const rect = element.getBoundingClientRect();
      return scrollTop + rect.top - viewportTop + rect.height / 2;
    };
    this.known = mergeMountedTurns(rememberedMarkers(this.known, mounted), mounted, centerOf);
    const pass =
      this.known.reduce((latest, marker) => Math.max(latest, marker.measuredAt ?? 0), 0) + 1;
    for (const marker of this.known) {
      if (!marker.element.isConnected) continue;
      marker.center = centerOf(marker.element);
      marker.measuredAt = pass;
    }
    this.ownership.observe(mountedOwnershipTurns(mounted));
    const realMounted = mounted.filter((turn) => turn.element.getAttribute(THREAD_ANCHOR_ATTR) === null);
    const assistantByElement = this.assistantSummaries(realMounted, scope);
    const markers = this.known.map((marker, index) => ({
      id: marker.id,
      element: marker.element,
      summary: marker.summary,
      attachmentPlaceholder: marker.attachmentPlaceholder,
      displaySummary: marker.displaySummary,
      assistantSummary:
        assistantByElement.get(marker.element) ?? old.get(marker.id)?.assistantSummary ?? '',
      baseN: this.known.length === 1 ? 0.5 : index / Math.max(1, this.known.length - 1),
      starred: false,
      hostTurnId: marker.hostTurnId,
      hash: marker.hash,
      center: marker.center,
      measuredAt: marker.measuredAt,
    }));
    return { markers, mountedCount: mounted.length };
  }

  private assistantSummaries(
    mounted: readonly MountedTurn[],
    container: HTMLElement,
  ): Map<HTMLElement, string> {
    const result = new Map<HTMLElement, string>();
    if (!this.config.assistantTurnSelector) return result;
    const replies = Array.from(
      container.querySelectorAll<HTMLElement>(this.config.assistantTurnSelector),
    ).filter(renderedCheck());
    mounted.forEach(({ element }, index) => {
      const next = mounted[index + 1]?.element;
      const reply = replies.find(
        (candidate) =>
          !!(element.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          (!next || !!(candidate.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)),
      );
      if (reply) result.set(element, turnSummary(reply));
    });
    return result;
  }

  shouldRefresh(records: MutationRecord[]): boolean {
    const selectors = [
      this.config.turnSelector,
      this.config.assistantTurnSelector,
      this.config.threadMirror ? `[${THREAD_ANCHOR_LAYER_ATTR}], ${THREAD_ANCHOR_SELECTOR}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const elementOf = (node: Node): Element | null =>
      node instanceof Element ? node : node.parentElement;
    const touches = (node: Node): boolean => {
      const element = elementOf(node);
      return !!(element?.closest(selectors) || element?.querySelector(selectors));
    };
    return records.some((record) => {
      if (
        elementOf(record.target)?.closest(
          '[data-gv-turn-navigator], .timeline-preview-panel, .timeline-preview-toggle, .timeline-tooltip, .gv-navigation-veil, .gv-navigation-loading',
        )
      )
        return false;
      if (record.type === 'attributes') return togglesVisibility(record) && touches(record.target);
      return (
        !!elementOf(record.target)?.closest(selectors) ||
        [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(touches)
      );
    });
  }

  stop(): void {
    this.detachListeners();
    for (const [element, original] of this.originalStamps) {
      if (original === null) element.removeAttribute('data-gv-turn-id');
      else element.setAttribute('data-gv-turn-id', original);
    }
    this.originalStamps.clear();
    this.known = [];
  }
}
