/* Adapted from TanChuping/chatgpt-voyager v1.9.4 (e02c0311, GPL-3.0). See UPSTREAM.md. */
/**
 * Page-world (MAIN) thread mirror for ChatGPT's virtualized conversation list.
 *
 * Read-only towards React: reads the virtualizer's turn records (`rows` or
 * `entries`) and layout ref (`{ turnKeys, topOffsetsPx, heightsPx }`) and
 * mirrors lightweight, invisible anchors into the list's relative container so
 * the isolated-world timeline sees all loaded turns with exact scroll offsets.
 *
 * Must never import shared chunks or reference `chrome.*` APIs.
 */

type Dict = Record<string, unknown>;

const THREAD_ANCHOR_ATTR = 'data-gv-thread-anchor';
const LAYER_ATTR = 'data-gv-thread-anchor-layer';
const TURN_KEY_SELECTOR = '[data-turn-key]';
/** List ~5, owner/loading state ~30 on the November 2026 layout; bounded ancestor walk. */
const MAX_CLIMB = 64;
/** Provider stack reaches 314+ ancestors; never traverse an unbounded tree. */
const MAX_ROOT_CLIMB = 512;
const MAX_HOOKS = 120;
const MAX_TEXT = 4000;
/** Anchor box height representing the user prompt at the top of each exchange. */
const PROMPT_ANCHOR_MAX_HEIGHT = 48;
/** Safety net for thread swaps that produce no mutation we observe. */
const POLL_MS = 1500;
/** Coalesces bursts of mutations / scroll events into one sync. */
const SYNC_DELAY_MS = 32;

interface ThreadLayout {
  turnKeys: string[];
  topOffsetsPx: number[];
  heightsPx: number[];
}

interface ThreadList {
  entries: unknown[];
  layout: ThreadLayout;
  container: HTMLElement;
  conversationId: string | null;
}

interface MirrorTurn {
  key: string;
  top: number;
  height: number;
  text: string;
  attachments: string[];
}

function asDict(v: unknown): Dict | null {
  return v !== null && typeof v === 'object' ? (v as Dict) : null;
}

function fiberOf(node: Element): Dict | null {
  for (const k in node) {
    if (k.startsWith('__reactFiber$')) return asDict((node as unknown as Dict)[k]);
  }
  return null;
}

function isLayout(v: unknown): v is ThreadLayout {
  const d = asDict(v);
  return (
    !!d &&
    Array.isArray(d.turnKeys) &&
    Array.isArray(d.topOffsetsPx) &&
    Array.isArray(d.heightsPx) &&
    d.turnKeys.length > 0 &&
    d.turnKeys.length === d.topOffsetsPx.length
  );
}

/** The layout lives in a `useRef` on the list component: `{ current: layout }`. */
function readLayout(fiber: Dict): ThreadLayout | null {
  let hook = asDict(fiber.memoizedState);
  for (let i = 0; hook && i < MAX_HOOKS; i++) {
    const state = asDict(hook.memoizedState);
    if (state && 'current' in state && isLayout(state.current)) return state.current;
    hook = asDict(hook.next);
  }
  return null;
}

/** First host (DOM) node rendered by a component: the list's relative container. */
function hostNodeOf(fiber: Dict): HTMLElement | null {
  let node = asDict(fiber.child);
  for (let i = 0; node && i < 10; i++) {
    if (node.tag === 5 && node.stateNode instanceof HTMLElement) return node.stateNode;
    node = asDict(node.child);
  }
  return null;
}

function activeRoot(): HTMLElement | null {
  const active = document.querySelector<HTMLElement>('[data-app-shell-active-page="true"]');
  if (active) return active.querySelector<HTMLElement>('main') ?? active;
  if (document.querySelector('[data-app-shell-active-page]')) return null;
  for (const main of document.querySelectorAll<HTMLElement>('main')) {
    let visible = true;
    for (let node: HTMLElement | null = main; node; node = node.parentElement) {
      if (
        node.hidden ||
        node.hasAttribute('inert') ||
        node.getAttribute('aria-hidden') === 'true' ||
        getComputedStyle(node).display === 'none'
      ) {
        visible = false;
        break;
      }
    }
    if (visible) return main;
  }
  return document.querySelector('main') ? null : document.body;
}

function routeConversationId(): string | null {
  return location.pathname.match(/(?:^|\/)c\/([^/?#]+)/)?.[1] ?? null;
}

/** A DOM fiber may point into the previous React tree after a commit. */
function committedFiberOf(row: Element): Dict | null {
  const fiber = fiberOf(row);
  let root = fiber;
  for (let i = 0; root && i < MAX_ROOT_CLIMB; i++) {
    const parent = asDict(root.return);
    if (!parent) break;
    root = parent;
  }
  if (asDict(root?.return)) return null;
  const current = asDict(asDict(root?.stateNode)?.current);
  return current && current !== root ? asDict(fiber?.alternate) : fiber;
}

export function findThreadList(): ThreadList | null {
  const root = activeRoot();
  const row = root?.querySelector(TURN_KEY_SELECTOR);
  if (!row) return null;
  let fiber = committedFiberOf(row);
  let found: ThreadList | null = null;
  let conversationId: string | null = null;
  let resolvedScrollOwner: string | null = null;
  const routeId = routeConversationId();
  let expected = routeId;
  try {
    if (expected) expected = decodeURIComponent(expected);
  } catch {
    /* malformed route segments fail ownership checks */
  }
  for (let i = 0; fiber && i < MAX_CLIMB; i++) {
    const props = asDict(fiber.memoizedProps);
    if (
      props?.isConversationLoading === true ||
      (expected &&
        typeof props?.scrollStateConversationId === 'string' &&
        props.scrollStateConversationId !== expected)
    ) {
      return null;
    }
    if (typeof props?.conversationId === 'string') conversationId ??= props.conversationId;
    if (
      typeof props?.scrollStateConversationId === 'string' &&
      props.conversationId === conversationId
    ) {
      resolvedScrollOwner = props.scrollStateConversationId;
    }
    // Generic virtualizer exposes turn records as `rows`; parent still exposes `entries`.
    const entries = Array.isArray(props?.rows)
      ? props.rows
      : Array.isArray(props?.entries)
        ? props.entries
        : null;
    if (!found && entries) {
      const layout = readLayout(fiber);
      const container = layout ? hostNodeOf(fiber) : null;
      if (
        layout &&
        container?.contains(row) &&
        layout.turnKeys.includes(row.getAttribute('data-turn-key') ?? '')
      ) {
        found = { entries, layout, container, conversationId: null };
      }
    }
    fiber = asDict(fiber.return);
  }
  if (!found) return null;
  if (conversationId && expected && conversationId !== expected) {
    if (!conversationId.startsWith('local-chatgpt:') || resolvedScrollOwner !== expected) {
      return null;
    }
  }
  if (root?.closest('[data-app-shell-active-page]') && expected && !conversationId) return null;
  found.conversationId = routeId ?? conversationId;
  return found;
}

function attachmentNames(item: Dict): string[] {
  const names: string[] = [];
  for (const field of ['attachments', 'chatGptFileAttachments', 'chatGptImageAttachments']) {
    const list = item[field];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const a = asDict(raw);
      if (!a) continue;
      const name = [a.name, a.label, a.fileName, a.filename, a.title].find(
        (v): v is string => typeof v === 'string' && v.trim().length > 0,
      );
      if (name && !names.includes(name.trim())) names.push(name.trim());
    }
  }
  return names;
}

/** The user message item of an exchange; `items` also holds reasoning / answer groups. */
function userItemOf(entry: unknown, key: string): Dict | null {
  const items = asDict(asDict(entry)?.turn)?.items;
  if (!Array.isArray(items)) return null;
  let fallback: Dict | null = null;
  for (const raw of items) {
    const item = asDict(raw);
    if (!item || typeof item.message !== 'string' || typeof item.messageId !== 'string') continue;
    if (item.messageId === key || item.serverMessageId === key) return item;
    fallback ??= item;
  }
  return fallback;
}

function indexEntriesByKey(entries: readonly unknown[]): Map<string, unknown> {
  const byKey = new Map<string, unknown>();
  for (const raw of entries) {
    const entry = asDict(raw);
    if (!entry) continue;
    for (const candidate of [entry.turnKey, entry.key, entry.id]) {
      if (typeof candidate === 'string' && candidate && !byKey.has(candidate)) {
        byKey.set(candidate, raw);
      }
    }
    const items = asDict(entry.turn)?.items;
    if (!Array.isArray(items)) continue;
    for (const rawItem of items) {
      const item = asDict(rawItem);
      if (!item || typeof item.message !== 'string') continue;
      for (const id of [item.messageId, item.serverMessageId]) {
        if (typeof id === 'string' && id && !byKey.has(id)) byKey.set(id, raw);
      }
    }
  }
  return byKey;
}

function entryMatchesKey(entry: unknown, key: string): boolean {
  const d = asDict(entry);
  if (!d) return false;
  for (const candidate of [d.turnKey, d.key, d.id]) {
    if (candidate === key) return true;
  }
  const items = asDict(d.turn)?.items;
  if (!Array.isArray(items)) return false;
  for (const rawItem of items) {
    const item = asDict(rawItem);
    if (!item || typeof item.message !== 'string') continue;
    if (item.messageId === key || item.serverMessageId === key) return true;
  }
  return false;
}

export function readTurns(list: ThreadList): MirrorTurn[] {
  const { layout, entries } = list;
  let byKey: Map<string, unknown> | null = null;
  const turns: MirrorTurn[] = [];
  for (let i = 0; i < layout.turnKeys.length; i++) {
    const key = layout.turnKeys[i];
    const top = Number(layout.topOffsetsPx[i]);
    if (typeof key !== 'string' || !key || !Number.isFinite(top)) continue;
    let entry: unknown = entryMatchesKey(entries[i], key) ? entries[i] : undefined;
    if (entry === undefined) {
      byKey ??= indexEntriesByKey(entries);
      entry = byKey.get(key);
    }
    const item = entry !== undefined ? userItemOf(entry, key) : null;
    turns.push({
      key,
      top,
      height: Math.max(1, Number(layout.heightsPx[i]) || 1),
      text: item ? String(item.message).slice(0, MAX_TEXT) : '',
      attachments: item ? attachmentNames(item) : [],
    });
  }
  return turns;
}

function ensureLayer(container: HTMLElement): HTMLElement {
  let layer = container.querySelector<HTMLElement>(`:scope > [${LAYER_ATTR}]`);
  if (layer) return layer;
  layer = document.createElement('div');
  layer.setAttribute(LAYER_ATTR, '');
  layer.setAttribute('aria-hidden', 'true');
  // Opacity 0 (not visibility: hidden) so isRenderedTarget/checkVisibility treats
  // mirrored anchors as active layout targets while keeping them completely invisible.
  layer.style.cssText =
    'position:absolute;top:0;left:0;width:0;height:100%;pointer-events:none;opacity:0;user-select:none;overflow:visible;';
  container.appendChild(layer);
  return layer;
}

function setAttr(el: HTMLElement, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function writeAnchors(container: HTMLElement, turns: MirrorTurn[]): void {
  const layer = ensureLayer(container);
  const existing = new Map<string, HTMLElement>();
  for (const el of Array.from(layer.children) as HTMLElement[]) {
    const key = el.getAttribute(THREAD_ANCHOR_ATTR);
    if (key && !existing.has(key)) existing.set(key, el);
    else el.remove();
  }
  let previous: HTMLElement | null = null;
  for (const turn of turns) {
    let anchor = existing.get(turn.key);
    existing.delete(turn.key);
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.setAttribute(THREAD_ANCHOR_ATTR, turn.key);
      anchor.style.position = 'absolute';
      anchor.style.left = '0';
      anchor.style.width = '1px';
      anchor.style.pointerEvents = 'none';
    }
    const expectedNext: ChildNode | null = previous ? previous.nextSibling : layer.firstChild;
    if (expectedNext !== anchor) layer.insertBefore(anchor, expectedNext);
    const top = `${Math.round(turn.top)}px`;
    // Keep anchor height sized to the user prompt at the top of the exchange so
    // centered jumps target the prompt instead of the middle of a long reply.
    const height = `${Math.min(PROMPT_ANCHOR_MAX_HEIGHT, Math.max(1, Math.round(turn.height)))}px`;
    if (anchor.style.top !== top) anchor.style.top = top;
    if (anchor.style.height !== height) anchor.style.height = height;
    setAttr(anchor, 'data-gv-row-height', String(Math.round(turn.height)));
    setAttr(anchor, 'data-gv-text', turn.text);
    setAttr(
      anchor,
      'data-gv-attachments',
      turn.attachments.length ? JSON.stringify(turn.attachments) : null,
    );
    previous = anchor;
  }
  for (const stale of existing.values()) stale.remove();
}

let lastInputs: unknown[] = [];
let lastLayoutSig = '';
let lastPublishedRoot: HTMLElement | null = null;
let lastPublishedConversation: string | null = null;
let lastPublishedReady = false;
let observedContainer: HTMLElement | null = null;
let containerResizeObserver: ResizeObserver | null = null;

function layoutSignature(layout: ThreadLayout): string {
  const n = layout.turnKeys.length;
  let sig = `${n}|`;
  for (let i = 0; i < n; i++) {
    sig += `${layout.turnKeys[i]}:${Math.round(Number(layout.topOffsetsPx[i]) || 0)}:${Math.round(Number(layout.heightsPx[i]) || 0)};`;
  }
  return sig;
}

function observeContainerResize(container: HTMLElement, onResize: () => void): void {
  if (typeof ResizeObserver === 'undefined' || observedContainer === container) return;
  containerResizeObserver?.disconnect();
  observedContainer = container;
  try {
    containerResizeObserver = new ResizeObserver(onResize);
    containerResizeObserver.observe(container);
  } catch {
    containerResizeObserver = null;
    observedContainer = null;
  }
}

let scheduleMirror: (() => void) | null = null;
let flushMirror: (() => void) | null = null;

function publishThread(
  root: HTMLElement | null,
  conversationId: string | null,
  ready: boolean,
  changed = false,
): void {
  if (root) {
    setAttr(root, 'data-gv-thread-conversation', conversationId);
    setAttr(root, 'data-gv-thread-status', ready ? 'ready' : 'pending');
  }
  if (
    !changed &&
    root === lastPublishedRoot &&
    conversationId === lastPublishedConversation &&
    ready === lastPublishedReady
  ) {
    return;
  }
  lastPublishedRoot = root;
  lastPublishedConversation = conversationId;
  lastPublishedReady = ready;
  window.postMessage({ __gvType: 'gv-thread-updated', conversationId, ready }, location.origin);
}

/** One mirror pass; returns the number of exchanges mirrored. */
export function syncThreadMirror(): number {
  const root = activeRoot();
  const expected = routeConversationId();
  const list = findThreadList();
  if (!list) {
    if (
      !root?.querySelector(TURN_KEY_SELECTOR) &&
      root?.getAttribute('data-gv-thread-conversation') === expected &&
      root.getAttribute('data-gv-thread-status') === 'ready'
    ) {
      return root.querySelectorAll(`[${THREAD_ANCHOR_ATTR}]`).length;
    }
    root?.querySelectorAll(`[${LAYER_ATTR}]`).forEach((layer) => layer.remove());
    lastInputs = [];
    lastLayoutSig = '';
    publishThread(root, expected, false);
    return 0;
  }
  const { layout, entries, container } = list;
  if (flushMirror) observeContainerResize(container, flushMirror);
  const sig = layoutSignature(layout);
  const inputs = [
    root,
    list.conversationId,
    container,
    entries,
    entries.length,
    layout.turnKeys,
    layout.topOffsetsPx,
    layout.heightsPx,
  ];
  const layerPresent = !!container.querySelector(`:scope > [${LAYER_ATTR}]`);
  if (layerPresent && sig === lastLayoutSig && inputs.every((v, i) => v === lastInputs[i])) {
    publishThread(root, list.conversationId, true);
    return layout.turnKeys.length;
  }
  const turns = readTurns(list);
  if (!turns.length) {
    root?.querySelectorAll(`[${LAYER_ATTR}]`).forEach((layer) => layer.remove());
    lastInputs = [];
    lastLayoutSig = '';
    publishThread(root, expected, false);
    return 0;
  }
  writeAnchors(container, turns);
  setAttr(ensureLayer(container), 'data-gv-thread-conversation', list.conversationId);
  lastInputs = inputs;
  lastLayoutSig = sig;
  publishThread(root, list.conversationId, true, true);
  return turns.length;
}

function clearMirrorState(): void {
  containerResizeObserver?.disconnect();
  containerResizeObserver = null;
  observedContainer = null;
  lastInputs = [];
  lastLayoutSig = '';
  document.querySelectorAll(`[${LAYER_ATTR}]`).forEach((layer) => layer.remove());
  const root = activeRoot();
  publishThread(root, routeConversationId(), false);
}

export interface ThreadMirrorHandle {
  setEnabled(enabled: boolean): void;
  destroy(): void;
}

export function installThreadMirror(): ThreadMirrorHandle | null {
  const scope = window as unknown as Dict;
  if (scope.__voyagerLiteThreadMirrorInstalled) return null;
  scope.__voyagerLiteThreadMirrorInstalled = true;

  let enabled = true;
  let running = false;
  let destroyed = false;
  let scheduledTimer: number | null = null;
  let pollTimer: number | null = null;

  const cancelScheduled = (): void => {
    if (scheduledTimer !== null) {
      window.clearTimeout(scheduledTimer);
      scheduledTimer = null;
    }
  };
  const run = (): void => {
    cancelScheduled();
    if (!enabled || destroyed) return;
    try {
      syncThreadMirror();
    } catch {
      /* never break ChatGPT */
    }
  };
  const schedule = (): void => {
    if (!enabled || destroyed || scheduledTimer !== null) return;
    scheduledTimer = window.setTimeout(run, SYNC_DELAY_MS);
  };
  scheduleMirror = schedule;
  flushMirror = run;

  const isOwnMutation = (m: MutationRecord): boolean => {
    const target = m.target instanceof Element ? m.target : m.target.parentElement;
    return !!target?.closest(`[${LAYER_ATTR}]`) || (m.target as Element).hasAttribute?.(LAYER_ATTR);
  };
  const observer = new MutationObserver((mutations) => {
    if (!enabled || mutations.every(isOwnMutation)) return;
    schedule();
  });

  const attachObserver = (): void => {
    if (!enabled || !running || destroyed || !document.documentElement) return;
    try {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'data-turn-key', 'data-app-shell-active-page'],
      });
    } catch {
      /* ignore */
    }
    schedule();
  };

  const startRunning = (): void => {
    if (running || destroyed) return;
    running = true;
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('popstate', schedule);
    pollTimer = window.setInterval(schedule, POLL_MS);
    if (document.documentElement) attachObserver();
    else document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
  };

  const stopRunning = (): void => {
    if (!running) return;
    running = false;
    cancelScheduled();
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    observer.disconnect();
    document.removeEventListener('DOMContentLoaded', attachObserver);
    document.removeEventListener('scroll', schedule, true);
    window.removeEventListener('popstate', schedule);
    clearMirrorState();
  };

  const setEnabled = (next: boolean): void => {
    if (destroyed || enabled === next) return;
    enabled = next;
    if (enabled) startRunning();
    else stopRunning();
  };

  const onControlMessage = (event: MessageEvent): void => {
    if (destroyed || event.source !== window) return;
    if (typeof location !== 'undefined' && event.origin !== location.origin) return;
    const data = asDict(event.data);
    if (data?.__gvType !== 'gv-thread-mirror-control' || typeof data.enabled !== 'boolean') return;
    setEnabled(data.enabled);
  };

  window.addEventListener('message', onControlMessage);
  startRunning();
  window.postMessage({ __gvType: 'gv-thread-mirror-ready' }, location.origin);

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    enabled = false;
    stopRunning();
    window.removeEventListener('message', onControlMessage);
    scheduleMirror = null;
    flushMirror = null;
    delete scope.__voyagerLiteThreadMirrorInstalled;
  };

  return { setEnabled, destroy };
}

if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  !(globalThis as Dict).__voyagerLiteTestMode
) {
  installThreadMirror();
}
