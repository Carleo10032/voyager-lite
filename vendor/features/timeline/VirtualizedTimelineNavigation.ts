/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
import type { TimelineNavigationMarker } from './TimelineNavigation';
import {
  isRenderedTarget,
  readScrollOffset,
  scrollElementToAnchor,
  scrollToEstimatedCenter,
  elementCenterDestination,
} from './scrollMotion';

type Dispose = () => void;

const ACTIVE_ANCHOR = 0.5;
const NAVIGATION_ACTIVE_LOCK_MS = 900;
const PENDING_NAVIGATION_TIMEOUT_MS = 8000;
const PENDING_NAVIGATION_HOP_MS = 80;
const VEIL_HOP_MS = 60;
const VEIL_QUIET_MS = 350;
const VEIL_MAX_MS = 2200;
const CURTAIN_DISTANCE_VIEWPORTS = 1.5;
const SETTLED_READS = 3;
const PROBE_SETTLE_MS = 320;
const LOADING_DELAY_MS = 200;
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
const LAYOUT_STYLE_RE = /(?:height|transform|top|display|padding|margin)/i;
const OWN_UI_SELECTOR =
  '.gv-navigation-veil, .gv-navigation-loading, [data-gv-turn-navigator], [data-gv-thread-anchor-layer]';

type NavigationMarker = TimelineNavigationMarker;

export interface LiveTargetResolution {
  readonly element: HTMLElement;
  readonly mounted: boolean;
}

export interface VirtualizedNavigationConfig {
  readonly resolveLiveTarget?: (hostTurnId: string) => LiveTargetResolution | null;
  readonly onCurtainChange?: (active: boolean) => void;
}

function isMirrorAnchor(element: HTMLElement): boolean {
  return typeof element.getAttribute === 'function' && element.getAttribute('data-gv-thread-anchor') !== null;
}

function isLayoutMutation(record: MutationRecord): boolean {
  const target =
    record.target && (record.target as Element).nodeType === 1
      ? (record.target as Element)
      : (record.target?.parentElement ?? null);
  if (typeof target?.closest === 'function' && target.closest(OWN_UI_SELECTOR)) return false;
  if (record.type === 'childList') {
    for (const node of Array.from(record.addedNodes ?? [])) {
      if (node.nodeType === 1 && !(typeof (node as Element).closest === 'function' && (node as Element).closest(OWN_UI_SELECTOR)))
        return true;
    }
    for (const node of Array.from(record.removedNodes ?? [])) {
      if (node.nodeType === 1 && !(typeof (node as Element).closest === 'function' && (node as Element).closest(OWN_UI_SELECTOR)))
        return true;
    }
    return false;
  }
  if (record.type === 'attributes' && record.attributeName === 'style' && target) {
    return LAYOUT_STYLE_RE.test(target.getAttribute?.('style') ?? '');
  }
  return false;
}

/** Owns scroll geometry, active selection and timed homing for the current marker list. */
export class VirtualizedTimelineNavigation {
  private destroyed = false;
  private readonly lifetime = new AbortController();
  private readonly timers = new Set<number>();

  private on(
    target: EventTarget,
    name: string,
    listener: (event: Event) => void,
    options: AddEventListenerOptions = {},
  ): Dispose {
    target.addEventListener(name, listener, { ...options, signal: this.lifetime.signal });
    return () => target.removeEventListener(name, listener);
  }

  private timer(run: () => void, ms: number): Dispose {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) run();
    }, ms);
    this.timers.add(id);
    return () => {
      window.clearTimeout(id);
      this.timers.delete(id);
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.lifetime.abort();
    this.clearPendingNavigation();
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    this.scrollTarget = null;
  }

  private markerCenters: number[] = [];
  private measuringPass = 0;
  private activeTurnId: string | null = null;
  private navigationActiveLockUntil = 0;
  private pendingNavigationId: string | null = null;
  private pendingNavigationUntil = 0;
  private stopPendingNavigationTimer: Dispose | null = null;
  private stopUserScrollListeners: Dispose[] = [];
  private pendingNavigationLo = 0;
  private pendingNavigationHi = 0;
  private pendingNavigationProbed = false;
  private pendingScrollHeight = 0;
  private pendingProbeAt = 0;
  private pendingProbeSignature: string | null = null;
  private pendingProbeStableReads = 0;
  private pendingOffset: number | null = null;
  private pendingDestination: number | null = null;
  private pendingStableReads = 0;
  private pendingStartedAt = 0;
  private pendingLastActivityAt = 0;
  private pendingLastHeight = 0;
  private pendingActivityObserver: MutationObserver | null = null;
  private stopThreadMessageListener: Dispose | null = null;
  private curtainActive = false;
  private curtainUntil = 0;
  private lastHandledHash: string | null = null;
  private scrollTarget: HTMLElement | Window | null = null;
  private stopScrollListener: Dispose | null = null;

  constructor(
    private readonly getViewport: () => HTMLElement | null,
    private readonly getMarkers: () => readonly NavigationMarker[],
    private readonly onActiveChange: (turnId: string | null, previousTurnId: string | null) => void,
    private readonly onPendingChange: (turnId: string | null) => void = () => {},
    private readonly config: VirtualizedNavigationConfig = {},
  ) {}

  private get markers(): readonly NavigationMarker[] {
    return this.getMarkers();
  }

  private get disposed(): boolean {
    return this.destroyed;
  }

  get activeId(): string | null {
    return this.activeTurnId;
  }

  /** Establish the coordinate frame before marker merging reads any centers. */
  prepare(element: HTMLElement): void {
    this.setScrollTarget(this.getScrollTarget(element));
  }

  /** Route resets retain the scroll target, measuring epoch and navigation lock. */
  reset(): void {
    this.markerCenters = [];
    this.activeTurnId = null;
    this.clearPendingNavigation();
    this.lastHandledHash = null;
  }

  refreshActive(): void {
    if (this.activeTurnId && this.markers.some((marker) => marker.id === this.activeTurnId)) {
      this.onActiveChange(this.activeTurnId, this.activeTurnId);
      return;
    }
    this.updateActiveFromScroll();
  }

  private setActiveTurn(turnId: string | null): void {
    if (this.activeTurnId === turnId) return;
    const previousTurnId = this.activeTurnId;
    this.activeTurnId = turnId;
    this.onActiveChange(turnId, previousTurnId);
  }

  private updateActiveFromScroll = (): void => {
    if (!this.markers.length) {
      this.setActiveTurn(null);
      return;
    }
    if (Date.now() < this.navigationActiveLockUntil) return;
    if (this.isAtScrollBottom()) {
      this.setActiveTurn(this.markers[this.markers.length - 1]?.id ?? null);
      return;
    }
    const ref = this.getScrollTop() + this.getViewportHeight() * ACTIVE_ANCHOR;
    let low = 0;
    let high = this.markerCenters.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.markerCenters[mid] <= ref) low = mid + 1;
      else high = mid;
    }
    const previous = Math.max(0, low - 1);
    const next = Math.min(this.markerCenters.length - 1, low);
    const index =
      Math.abs(this.markerCenters[next] - ref) < Math.abs(this.markerCenters[previous] - ref)
        ? next
        : previous;
    this.setActiveTurn(this.markers[index]?.id ?? null);
  };

  private setScrollTarget(target: HTMLElement | Window | null): void {
    if (this.scrollTarget === target) return;
    void this.stopScrollListener?.();
    this.stopScrollListener = null;
    this.scrollTarget = target;
    if (target && !this.disposed) {
      this.stopScrollListener = this.on(target, 'scroll', this.updateActiveFromScroll, {
        passive: true,
      });
    }
  }

  private findMarker(turnId: string): NavigationMarker | undefined {
    return (
      this.markers.find((item) => item.id === turnId) ??
      this.markers.find((item) => item.hash === turnId.split('~')[0].split('-').pop())
    );
  }

  private resolveNavigationTarget(marker: NavigationMarker): LiveTargetResolution | null {
    if (marker.hostTurnId && this.config.resolveLiveTarget) {
      const live = this.config.resolveLiveTarget(marker.hostTurnId);
      if (live && isRenderedTarget(live.element)) return live;
    }
    if (isRenderedTarget(marker.element)) {
      return { element: marker.element, mounted: !isMirrorAnchor(marker.element) };
    }
    return null;
  }

  private readonly onThreadMessage = (event: Event): void => {
    if (this.disposed || !this.pendingNavigationId) return;
    const message = event as MessageEvent;
    if (message.source !== window) return;
    if (typeof location !== 'undefined' && message.origin !== location.origin) return;
    if (message.data?.__gvType !== 'gv-thread-updated') return;
    this.pendingLastActivityAt = Date.now();
  };

  private setCurtain(active: boolean): void {
    if (!this.config.onCurtainChange) return;
    if (active && !this.disposed) {
      this.curtainActive = true;
      this.curtainUntil = Date.now() + VEIL_MAX_MS;
      this.config.onCurtainChange(true);
      this.startVeilActivityWatch();
      return;
    }
    this.pendingActivityObserver?.disconnect();
    this.pendingActivityObserver = null;
    void this.stopThreadMessageListener?.();
    this.stopThreadMessageListener = null;
    if (!this.curtainActive) return;
    this.curtainActive = false;
    this.curtainUntil = 0;
    this.config.onCurtainChange(false);
  }

  /** Track host DOM/layout activity inside the scroller so the veil waits until loading finishes. */
  private startVeilActivityWatch(): void {
    this.pendingActivityObserver?.disconnect();
    this.pendingActivityObserver = null;
    void this.stopThreadMessageListener?.();
    this.stopThreadMessageListener = null;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.stopThreadMessageListener = this.on(window, 'message', this.onThreadMessage);
    }
    if (typeof MutationObserver !== 'function') return;
    const root =
      this.scrollTarget && this.scrollTarget !== window
        ? (this.scrollTarget as HTMLElement)
        : document.body;
    if (!root) return;
    try {
      const observer = new MutationObserver((records) => {
        if (records.some(isLayoutMutation)) this.pendingLastActivityAt = Date.now();
      });
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });
      this.pendingActivityObserver = observer;
    } catch {
      this.pendingActivityObserver = null;
    }
  }

  private hasLoadingVisibleImages(): boolean {
    const root =
      this.scrollTarget && this.scrollTarget !== window
        ? (this.scrollTarget as HTMLElement)
        : document.body;
    if (!root || typeof root.querySelectorAll !== 'function') return false;
    const top = this.getViewportTop();
    const bottom = top + this.getViewportHeight();
    for (const img of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
      if (img.complete) continue;
      const rect = img.getBoundingClientRect();
      if (rect.bottom >= top && rect.top <= bottom) return true;
    }
    return false;
  }

  navigateTo(turnId: string): void {
    if (this.disposed) return;
    const marker = this.findMarker(turnId);
    if (!marker) return;
    this.navigationActiveLockUntil = Date.now() + NAVIGATION_ACTIVE_LOCK_MS;
    this.setActiveTurn(marker.id);
    const resolved = this.resolveNavigationTarget(marker);
    const viewportHeight = this.getViewportHeight();
    const shouldCover =
      !!this.config.onCurtainChange &&
      (!resolved ||
        !resolved.mounted ||
        Math.abs(
          this.centerOf(resolved.element) - (this.getScrollTop() + viewportHeight * ACTIVE_ANCHOR),
        ) >
          viewportHeight * CURTAIN_DISTANCE_VIEWPORTS);
    if (resolved) {
      this.beginPendingNavigation(marker);
      if (shouldCover) this.setCurtain(true);
      this.pendingNavigationProbed = true;
      scrollElementToAnchor(
        this.getScrollTarget(resolved.element), resolved.element,
        this.getScrollTop(), viewportHeight, 'instant',
      );
      this.schedulePendingNavigationHop(shouldCover ? VEIL_HOP_MS : PENDING_NAVIGATION_HOP_MS);
      return;
    }
    // Virtualized out: the remembered offset is only an estimate (host
    // re-measures content as it mounts), so home in iteratively instead of
    // trusting a single jump.
    this.beginPendingNavigation(marker);
    if (shouldCover) this.setCurtain(true);
    this.homePendingNavigation();
  }

  private beginPendingNavigation(marker: NavigationMarker): void {
    this.clearPendingNavigation();
    this.pendingNavigationId = marker.id;
    this.pendingOffset = null;
    this.pendingDestination = null;
    this.pendingStableReads = 0;
    const now = Date.now();
    this.pendingStartedAt = now;
    this.pendingLastActivityAt = now;
    this.pendingLastHeight = this.getScrollHeight();
    this.pendingNavigationUntil = now + PENDING_NAVIGATION_TIMEOUT_MS;
    this.pendingNavigationLo = 0;
    this.pendingNavigationHi = Math.max(
      this.getScrollHeight(),
      (marker.center ?? 0) + this.getViewportHeight(),
    );
    this.pendingNavigationProbed = false;
    this.pendingScrollHeight = this.getScrollHeight();
    this.pendingProbeSignature = null;
    this.pendingProbeStableReads = 0;
    this.pendingProbeAt = now;
    if (this.disposed) return;
    const onKeyDown = (event: Event): void => {
      if (SCROLL_KEYS.has((event as KeyboardEvent).key)) this.cancelPendingNavigationOnUserScroll();
    };
    this.stopUserScrollListeners = [
      this.on(window, 'wheel', this.cancelPendingNavigationOnUserScroll, { passive: true }),
      this.on(window, 'touchmove', this.cancelPendingNavigationOnUserScroll, {
        passive: true,
      }),
      this.on(window, 'keydown', onKeyDown, { passive: true }),
    ];
  }

  private clearPendingNavigation(): void {
    this.pendingNavigationId = null;
    this.setCurtain(false);
    this.onPendingChange(null);
    void this.stopPendingNavigationTimer?.();
    this.stopPendingNavigationTimer = null;
    for (const stop of this.stopUserScrollListeners.splice(0)) void stop();
  }

  private cancelPendingNavigationOnUserScroll = (): void => {
    this.finishPendingNavigation(false);
  };

  private finishPendingNavigation(arrived: boolean): void {
    this.clearPendingNavigation();
    if (!arrived) {
      this.navigationActiveLockUntil = 0;
      this.measure();
      const reference = this.getScrollTop() + this.getViewportHeight() * ACTIVE_ANCHOR;
      const mounted = this.markers.filter((marker) => isRenderedTarget(marker.element));
      const nearest = mounted.reduce<NavigationMarker | undefined>((best, marker) =>
        !best || Math.abs(this.centerOf(marker.element) - reference) <
          Math.abs(this.centerOf(best.element) - reference) ? marker : best, undefined);
      this.setActiveTurn(nearest?.id ?? null);
    }
  }

  /**
   * One homing step toward a virtualized-out turn: bisect on the target's
   * position (bounds tightened from which side of the mounted window the turn
   * sits on), scroll in the selected mode, and let the host mount content at the landing
   * point. Once the turn's element is back in the DOM, aim precisely.
   */
  private homePendingNavigation = (): void => {
    this.stopPendingNavigationTimer = null;
    if (!this.pendingNavigationId || this.disposed) return;
    if (Date.now() > this.pendingNavigationUntil) {
      this.finishPendingNavigation(false);
      return;
    }
    const marker = this.markers.find((item) => item.id === this.pendingNavigationId);
    if (!marker) {
      this.finishPendingNavigation(false);
      return;
    }
    const now = Date.now();
    this.navigationActiveLockUntil = now + NAVIGATION_ACTIVE_LOCK_MS;
    const resolved = this.resolveNavigationTarget(marker);
    if (resolved && this.curtainActive) {
      const target = this.getScrollTarget(resolved.element);
      const offset = this.getScrollTop();
      const scrollHeight = this.getScrollHeight();
      const destination = Math.min(
        Math.max(0, scrollHeight - this.getViewportHeight()),
        elementCenterDestination(target, resolved.element),
      );
      const diff = destination - offset;
      const layoutMoved =
        this.pendingDestination === null ||
        Math.abs(destination - this.pendingDestination) > 2 ||
        Math.abs(scrollHeight - this.pendingLastHeight) > 2;
      if (layoutMoved || Math.abs(diff) > 2) this.pendingLastActivityAt = now;
      this.pendingOffset = offset;
      this.pendingDestination = destination;
      this.pendingLastHeight = scrollHeight;
      if (Math.abs(diff) > 2) {
        scrollElementToAnchor(target, resolved.element, offset, this.getViewportHeight(), 'instant');
      }
      const settled =
        resolved.mounted &&
        Math.abs(diff) <= 2 &&
        now - this.pendingLastActivityAt >= VEIL_QUIET_MS &&
        !this.hasLoadingVisibleImages();
      if (settled || now >= this.curtainUntil) {
        this.clearPendingNavigation();
        return;
      }
      this.schedulePendingNavigationHop(VEIL_HOP_MS);
      return;
    }
    if (this.curtainActive && now >= this.curtainUntil) {
      this.setCurtain(false);
    }
    if (resolved) {
      const target = this.getScrollTarget(resolved.element);
      // Once readable, stop chasing exact centering as the host reflows.
      const rect = resolved.element.getBoundingClientRect();
      const viewportTop = this.getViewportTop();
      const viewportBottom = viewportTop + this.getViewportHeight();
      const readable = rect.height <= this.getViewportHeight()
        ? rect.top >= viewportTop && rect.bottom <= viewportBottom
        : rect.top <= viewportTop && rect.bottom >= viewportBottom;
      if (readable) {
        this.clearPendingNavigation();
        return;
      }
      const offset = this.getScrollTop();
      const destination = Math.min(
        Math.max(0, this.getScrollHeight() - this.getViewportHeight()),
        elementCenterDestination(target, resolved.element),
      );
      if (Math.abs(destination - offset) > 3 && now - this.pendingStartedAt >= LOADING_DELAY_MS)
        this.onPendingChange(marker.id);
      // Wait for both the scroll and the target's document position to settle.
      // A mounted bubble can move when preceding replies finish rendering.
      const stable = this.pendingOffset !== null && this.pendingDestination !== null &&
        Math.abs(offset - this.pendingOffset) <= 1 && Math.abs(destination - this.pendingDestination) <= 1;
      this.pendingStableReads = stable ? this.pendingStableReads + 1 : 0;
      this.pendingOffset = offset;
      this.pendingDestination = destination;
      if (this.pendingStableReads < SETTLED_READS) {
        this.schedulePendingNavigationHop();
        return;
      }
      if (Math.abs(destination - offset) <= 3) {
        this.clearPendingNavigation();
        return;
      }
      this.pendingStableReads = 0;
      scrollElementToAnchor(target, resolved.element, offset, this.getViewportHeight(), 'instant');
      this.schedulePendingNavigationHop();
      return;
    }
    if (!this.curtainActive && now - this.pendingStartedAt >= LOADING_DELAY_MS)
      this.onPendingChange(marker.id);
    // A scroll starts an asynchronous host render. Until that render settles,
    // the old mounted window says nothing about which side of the target we
    // landed on. Repeated 80ms jumps can prevent it from mounting at all.
    if (this.pendingNavigationProbed) {
      const signature = JSON.stringify([
        this.getScrollTop(), this.getScrollHeight(),
        this.markers.filter((item) => isRenderedTarget(item.element)).map((item) =>
          [item.id, this.centerOf(item.element)]),
      ]);
      this.pendingProbeStableReads = signature === this.pendingProbeSignature
        ? this.pendingProbeStableReads + 1 : 0;
      this.pendingProbeSignature = signature;
      if (now - this.pendingProbeAt < PROBE_SETTLE_MS ||
          this.pendingProbeStableReads < SETTLED_READS) {
        this.schedulePendingNavigationHop();
        return;
      }
    }
    // Reacquire an unmounted target by marker identity, not its stale DOM box.
    this.pendingOffset = null;
    this.pendingDestination = null;
    this.pendingStableReads = 0;
    // Virtualizers replace estimated reply heights when a window mounts.
    // Bounds measured in the previous layout no longer bracket the target.
    const scrollHeight = this.getScrollHeight();
    const layoutChanged = Math.abs(scrollHeight - this.pendingScrollHeight) > 1;
    if (layoutChanged) {
      this.pendingNavigationLo = 0;
      this.pendingNavigationHi = scrollHeight;
      this.pendingScrollHeight = scrollHeight;
    }
    // After a probe, an unchanged mounted window also rules out the viewport
    // we just searched. Bubble positions alone repeat a midpoint forever
    // inside a reply that is much taller than the viewport. The initial
    // viewport and a reflowed viewport are not search results in this frame.
    const canBoundViewport = this.pendingNavigationProbed && !layoutChanged;
    const reference = this.getScrollTop() + this.getViewportHeight() * ACTIVE_ANCHOR;
    const mountedIndexes = this.markers.reduce<number[]>((acc, item, index) => {
      if (isRenderedTarget(item.element)) acc.push(index);
      return acc;
    }, []);
    if (mountedIndexes.length) {
      // Offscreen bubbles still bracket a long reply. Requiring a bubble in
      // the viewport deadlocks navigation when the reader scrolls into that reply.
      const targetIndex = this.markers.indexOf(marker);
      const firstMounted = mountedIndexes[0];
      const lastMounted = mountedIndexes[mountedIndexes.length - 1];
      if (targetIndex < firstMounted) {
        this.pendingNavigationHi = Math.min(
          this.pendingNavigationHi,
          this.centerOf(this.markers[firstMounted].element),
          canBoundViewport ? reference : Infinity,
        );
      } else if (targetIndex > lastMounted) {
        this.pendingNavigationLo = Math.max(
          this.pendingNavigationLo,
          this.centerOf(this.markers[lastMounted].element),
          canBoundViewport ? reference : 0,
        );
      } else {
        // Inside a virtualization gap: bracket the target between its nearest
        // mounted neighbours. (A truly deleted turn collapses the bracket and
        // ends the search below.)
        let beforeIndex = -1;
        let afterIndex = -1;
        for (const index of mountedIndexes) {
          if (index < targetIndex) beforeIndex = index;
          else if (index > targetIndex) {
            afterIndex = index;
            break;
          }
        }
        if (beforeIndex >= 0) {
          this.pendingNavigationLo = Math.max(
            this.pendingNavigationLo,
            this.centerOf(this.markers[beforeIndex].element),
          );
        }
        if (afterIndex >= 0) {
          this.pendingNavigationHi = Math.min(
            this.pendingNavigationHi,
            this.centerOf(this.markers[afterIndex].element),
          );
        }
      }
    }
    if (this.pendingNavigationHi - this.pendingNavigationLo < 1) {
      this.finishPendingNavigation(false);
      return;
    }
    const staleCenterUsable =
      !this.pendingNavigationProbed &&
      (marker.center ?? 0) > this.pendingNavigationLo &&
      (marker.center ?? 0) < this.pendingNavigationHi;
    const probe = staleCenterUsable
      ? (marker.center ?? 0)
      : (this.pendingNavigationLo + this.pendingNavigationHi) / 2;
    this.pendingNavigationProbed = true;
    this.pendingProbeAt = now;
    this.pendingProbeSignature = null;
    this.pendingProbeStableReads = 0;
    scrollToEstimatedCenter(this.scrollTarget, probe, this.getViewportHeight(), 'instant');
    this.schedulePendingNavigationHop();
  };

  private schedulePendingNavigationHop(delay = PENDING_NAVIGATION_HOP_MS): void {
    if (this.stopPendingNavigationTimer !== null || this.disposed) return;
    this.stopPendingNavigationTimer = this.timer(
      this.homePendingNavigation,
      delay,
    );
  }

  handleHash = (): void => {
    const hash = location.hash;
    if (!hash.startsWith('#gv-turn-') || hash === this.lastHandledHash) return;
    const turnId = decodeURIComponent(hash.slice('#gv-turn-'.length));
    if (!turnId) return;
    const marker = this.findMarker(turnId);
    // Not discovered yet (virtualized out and never mounted): leave the hash
    // unconsumed so later refreshes retry once the turn appears.
    if (!marker) return;
    this.lastHandledHash = hash;
    this.navigateTo(marker.id);
  };

  private getScrollTarget(_element: HTMLElement): HTMLElement | Window {
    const viewport = this.getViewport();
    return viewport && viewport !== document.documentElement && viewport !== document.body
      ? viewport
      : window;
  }

  measure(): void {
    const scrollTop = this.getScrollTop();
    const viewportTop = this.getViewportTop();
    const pass = ++this.measuringPass;
    const centers: number[] = [];
    for (const marker of this.markers) {
      if (isRenderedTarget(marker.element)) {
        marker.center = this.centerOf(marker.element, scrollTop, viewportTop);
        marker.measuredAt = pass;
      }
      // Keep the array monotonic for the active-turn binary search: stale
      // centers of virtualized-out turns can lag behind re-measured neighbours.
      const previous = centers[centers.length - 1];
      centers.push(
        previous !== undefined && (marker.center ?? 0) < previous ? previous : (marker.center ?? 0),
      );
    }
    this.markerCenters = centers;
  }

  centerOf(
    element: HTMLElement,
    scrollTop = this.getScrollTop(),
    viewportTop = this.getViewportTop(),
  ): number {
    const rect = element.getBoundingClientRect();
    return scrollTop + rect.top - viewportTop + rect.height / 2;
  }

  private getViewportTop(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).getBoundingClientRect().top
      : 0;
  }

  /** Offset from the conversation's start, also on a `column-reverse` scroller. */
  private getScrollTop(): number {
    return readScrollOffset(this.scrollTarget);
  }

  private getViewportHeight(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).clientHeight
      : window.innerHeight || document.documentElement.clientHeight || 0;
  }

  private getScrollHeight(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).scrollHeight
      : (document.scrollingElement || document.documentElement).scrollHeight;
  }

  private isAtScrollBottom(): boolean {
    const viewportHeight = this.getViewportHeight();
    const scrollHeight = this.getScrollHeight();
    return (
      scrollHeight > viewportHeight && this.getScrollTop() + viewportHeight >= scrollHeight - 2
    );
  }
}
