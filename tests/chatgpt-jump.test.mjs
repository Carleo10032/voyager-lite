import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const navBundle = await build({
  entryPoints: ['vendor/features/timeline/TimelineNavigation.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});

const mirrorBundle = await build({
  entryPoints: ['src/chatgptThreadMirror.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});

const adapterBundle = await build({
  entryPoints: ['vendor/features/timeline/adapters/catalog/CatalogTimelineAdapter.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  alias: { '@': path.resolve('vendor') },
});

function createMiniDom() {
  class Node {
    static ELEMENT_NODE = 1;
    static TEXT_NODE = 3;
    static DOCUMENT_POSITION_FOLLOWING = 4;
    nodeType = 1;
    parentNode = null;
    parentElement = null;
    childNodes = [];
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    get firstChild() { return this.childNodes[0] ?? null; }
    get nextSibling() {
      if (!this.parentNode) return null;
      const idx = this.parentNode.childNodes.indexOf(this);
      return idx >= 0 ? this.parentNode.childNodes[idx + 1] ?? null : null;
    }
    get isConnected() {
      let n = this;
      while (n) { if (n === doc.documentElement) return true; n = n.parentNode; }
      return false;
    }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, ref) {
      if (child.parentNode) child.remove();
      const idx = ref ? this.childNodes.indexOf(ref) : -1;
      if (idx >= 0) this.childNodes.splice(idx, 0, child);
      else this.childNodes.push(child);
      child.parentNode = this;
      child.parentElement = this instanceof HTMLElement ? this : null;
      return child;
    }
    remove() {
      if (!this.parentNode) return;
      const idx = this.parentNode.childNodes.indexOf(this);
      if (idx >= 0) this.parentNode.childNodes.splice(idx, 1);
      this.parentNode = null;
      this.parentElement = null;
    }
    contains(other) {
      let n = other;
      while (n) { if (n === this) return true; n = n.parentNode; }
      return false;
    }
    compareDocumentPosition(other) {
      const all = [];
      const walk = node => { all.push(node); for (const c of node.childNodes) walk(c); };
      walk(doc.documentElement);
      return all.indexOf(this) < all.indexOf(other) ? Node.DOCUMENT_POSITION_FOLLOWING : 0;
    }
  }

  function matchSingle(el, sel) {
    sel = sel.trim();
    if (!sel) return false;
    const tagMatch = sel.match(/^([a-zA-Z0-9_-]+)/);
    let rest = sel;
    if (tagMatch) {
      if (el.tagName.toLowerCase() !== tagMatch[1].toLowerCase()) return false;
      rest = sel.slice(tagMatch[0].length);
    }
    const attrRe = /\[([^\]=]+)(?:="([^"]*)")?\]/g;
    let m;
    while ((m = attrRe.exec(rest)) !== null) {
      const [, name, val] = m;
      if (val === undefined) {
        if (!el.hasAttribute(name)) return false;
      } else if (el.getAttribute(name) !== val) {
        return false;
      }
    }
    return true;
  }

  function matchesSelector(el, selector) {
    return selector.split(',').some(part => {
      const s = part.trim();
      if (s.startsWith(':scope > ')) return matchSingle(el, s.slice(':scope > '.length));
      return matchSingle(el, s);
    });
  }

  class HTMLElement extends Node {
    constructor(tag = 'div') {
      super();
      this.tagName = tag.toUpperCase();
      this.attrs = new Map();
      this.style = { cssText: '' };
      this.hidden = false;
      this.textContent = '';
      this.scrollTop = 0;
      this.scrollHeight = 10000;
      this.clientHeight = 800;
    }
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
    setAttribute(name, val) { this.attrs.set(name, String(val)); }
    removeAttribute(name) { this.attrs.delete(name); }
    hasAttribute(name) { return this.attrs.has(name); }
    matches(sel) { return matchesSelector(this, sel); }
    closest(sel) {
      let n = this;
      while (n instanceof HTMLElement) { if (n.matches(sel)) return n; n = n.parentElement; }
      return null;
    }
    querySelectorAll(sel) {
      const results = [];
      const directOnly = sel.trim().startsWith(':scope > ');
      const walk = node => {
        for (const child of node.children) {
          if (matchesSelector(child, sel)) results.push(child);
          if (!directOnly) walk(child);
        }
      };
      walk(this);
      return results;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    getBoundingClientRect() {
      const top = parseFloat(this.style.top) || 0;
      const height = parseFloat(this.style.height) || 40;
      return { top, bottom: top + height, height, width: 400 };
    }
  }

  const documentElement = new HTMLElement('html');
  const body = new HTMLElement('body');
  documentElement.appendChild(body);
  const doc = {
    documentElement,
    body,
    scrollingElement: documentElement,
    createElement: tag => new HTMLElement(tag),
    querySelector: sel => documentElement.querySelector(sel),
    querySelectorAll: sel => documentElement.querySelectorAll(sel),
    addEventListener() {},
    removeEventListener() {},
  };
  return { Node, Element: HTMLElement, HTMLElement, document: doc };
}

test('ChatGPT thread mirror reads November rows layout beyond 300 provider ancestors', () => {
  const dom = createMiniDom();
  const messages = [];
  const location = { pathname: '/c/conv-nov', origin: 'https://chatgpt.com', href: 'https://chatgpt.com/c/conv-nov' };
  const window = {
    location,
    postMessage: (data, origin) => messages.push({ data, origin }),
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
  };
  const scope = {
    module: { exports: {} },
    __voyagerLiteTestMode: true,
    window,
    location,
    document: dom.document,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    getComputedStyle: el => ({ display: el.style.display || 'block', flexDirection: 'column' }),
    MutationObserver: class { observe() {} },
  };
  vm.runInNewContext(mirrorBundle.outputFiles[0].text, scope);
  const { syncThreadMirror } = scope.module.exports;

  const page = dom.document.createElement('div');
  page.setAttribute('data-app-shell-active-page', 'true');
  const main = dom.document.createElement('main');
  const container = dom.document.createElement('div');
  const row = dom.document.createElement('div');
  row.setAttribute('data-turn-key', 'k2');
  container.appendChild(row);
  main.appendChild(container);
  page.appendChild(main);
  dom.document.body.appendChild(page);

  const entry = (id, text, attachments = []) => ({
    turn: { items: [{ messageId: id, message: text, attachments }] },
  });
  const staleList = {
    memoizedProps: { rows: [entry('k1', 'stale')] },
    memoizedState: { memoizedState: { current: { turnKeys: ['k1', 'k2'], topOffsetsPx: [0, 50], heightsPx: [50, 50] } } },
    child: { tag: 5, stateNode: container },
  };
  const committedList = {
    memoizedProps: { rows: [entry('k1', 'first question'), entry('k2', 'second', [{ label: 'spec.pdf' }])] },
    memoizedState: { memoizedState: { current: { turnKeys: ['k1', 'k2'], topOffsetsPx: [120, 2400], heightsPx: [2100, 1800] } } },
    child: { tag: 5, stateNode: container },
  };
  const ownerProps = { conversationId: 'conv-nov', scrollStateConversationId: 'conv-nov', isConversationLoading: false };
  const currentRoot = {};
  const staleRoot = { stateNode: { current: currentRoot } };
  currentRoot.stateNode = { current: currentRoot };
  for (const [list, root] of [[staleList, staleRoot], [committedList, currentRoot]]) {
    let parent = root;
    for (let i = 0; i < 320; i++) parent = { memoizedProps: {}, return: parent };
    let owner = { memoizedProps: ownerProps, return: parent };
    for (let i = 0; i < 35; i++) owner = { memoizedProps: {}, return: owner };
    list.return = owner;
  }
  const staleRowFiber = { return: staleList };
  staleRowFiber.alternate = { return: committedList };
  row['__reactFiber$test'] = staleRowFiber;

  assert.equal(syncThreadMirror(), 2);
  const layer = container.querySelector('[data-gv-thread-anchor-layer]');
  assert.ok(layer, 'mirror creates anchor layer');
  assert.ok(!layer.style.cssText.includes('visibility:hidden'), 'layer stays visible to isRenderedTarget');
  assert.ok(layer.style.cssText.includes('opacity:0'), 'layer stays visually invisible');
  const anchors = layer.querySelectorAll('div[data-gv-thread-anchor]');
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].getAttribute('data-gv-thread-anchor'), 'k1');
  assert.equal(anchors[0].getAttribute('data-gv-text'), 'first question');
  assert.equal(anchors[0].style.top, '120px');
  assert.equal(anchors[0].style.height, '48px', 'anchor height targets prompt top, not full assistant reply');
  assert.equal(anchors[0].getAttribute('data-gv-row-height'), '2100');
  assert.equal(anchors[1].getAttribute('data-gv-attachments'), '["spec.pdf"]');
  assert.equal(messages.at(-1)?.data.__gvType, 'gv-thread-updated');

  // In-place topOffsetsPx mutation (same array reference) must still update anchors and notify.
  const countBefore = messages.length;
  committedList.memoizedState.memoizedState.current.topOffsetsPx[1] = 4800;
  assert.equal(syncThreadMirror(), 2);
  assert.equal(anchors[1].style.top, '4800px');
  assert.equal(messages.length, countBefore + 1);

  // Switching to another route removes stale anchors.
  location.pathname = '/c/conv-other';
  assert.equal(syncThreadMirror(), 0);
  assert.equal(container.querySelector('[data-gv-thread-anchor-layer]'), null);
});

test('CatalogTimelineAdapter scopes ChatGPT scroller, upgrades anchors to bubbles without duplicates, and falls back to DOM', () => {
  const dom = createMiniDom();
  const location = { href: 'https://chatgpt.com/c/active-1', pathname: '/c/active-1', origin: 'https://chatgpt.com' };
  const scope = {
    module: { exports: {} },
    location,
    window: { scrollY: 0, addEventListener() {}, removeEventListener() {} },
    document: dom.document,
    Node: dom.Node,
    Element: dom.Element,
    HTMLElement: dom.HTMLElement,
    HTMLFormElement: class {},
    MutationObserver: class { observe() {} },
    getComputedStyle: el => ({ display: el.style.display || 'block', flexDirection: 'column', overflowY: el.style.overflowY || 'visible' }),
  };
  vm.runInNewContext(adapterBundle.outputFiles[0].text, scope);
  const { CatalogTimelineAdapter } = scope.module.exports;

  // Cached hidden conversation earlier in DOM with its own timeline scroller.
  const hiddenPage = dom.document.createElement('div');
  hiddenPage.setAttribute('data-app-shell-active-page', 'false');
  hiddenPage.style.display = 'none';
  const hiddenScroller = dom.document.createElement('div');
  hiddenScroller.setAttribute('data-app-action-timeline-scroll', '');
  hiddenPage.appendChild(hiddenScroller);
  dom.document.body.appendChild(hiddenPage);

  // Active conversation page.
  const activePage = dom.document.createElement('div');
  activePage.setAttribute('data-app-shell-active-page', 'true');
  const main = dom.document.createElement('main');
  const activeScroller = dom.document.createElement('div');
  activeScroller.setAttribute('data-app-action-timeline-scroll', '');
  activeScroller.style.overflowY = 'auto';
  const listContainer = dom.document.createElement('div');
  const layer = dom.document.createElement('div');
  layer.setAttribute('data-gv-thread-anchor-layer', '');
  layer.setAttribute('data-gv-thread-conversation', 'active-1');
  const a1 = dom.document.createElement('div');
  a1.setAttribute('data-gv-thread-anchor', 'k1');
  a1.setAttribute('data-gv-text', 'hello world');
  a1.style.top = '100px';
  a1.style.height = '48px';
  const a2 = dom.document.createElement('div');
  a2.setAttribute('data-gv-thread-anchor', 'k2');
  a2.setAttribute('data-gv-text', '');
  a2.setAttribute('data-gv-attachments', '["report.pdf"]');
  a2.style.top = '2000px';
  a2.style.height = '48px';
  layer.appendChild(a1);
  layer.appendChild(a2);
  listContainer.appendChild(layer);
  activeScroller.appendChild(listContainer);
  main.appendChild(activeScroller);
  activePage.appendChild(main);
  dom.document.body.appendChild(activePage);

  const ownership = { observe() {}, canStar: () => true };
  const adapter = new CatalogTimelineAdapter({
    siteId: 'chatgpt',
    siteLabel: 'ChatGPT',
    scrollContainerSelector: '[data-app-action-timeline-scroll]',
    activePageSelector: '[data-app-shell-active-page="true"]',
    threadMirror: true,
    turnSelector: '[data-user-message-bubble]',
    position: 'right',
    pluginId: 'lite.chatgpt',
    coachmarkId: 'lite-timeline',
  }, ownership);

  assert.equal(adapter.viewport(a1), activeScroller, 'closest scroller ignores hidden cached conversation');
  assert.equal(adapter.viewport(dom.document.body), activeScroller, 'root fallback picks active page scroller');

  const snap1 = adapter.turns.read([]);
  assert.equal(snap1.markers.length, 2);
  assert.equal(snap1.markers[0].element, a1);
  assert.equal(snap1.markers[0].summary, 'hello world');
  assert.equal(snap1.markers[1].summary, 'report.pdf');
  const k1Id = snap1.markers[0].id;

  // Now ChatGPT mounts the real row for k1 while anchor a1 stays connected in the layer.
  const row1 = dom.document.createElement('div');
  row1.setAttribute('data-turn-key', 'k1');
  const bubble1 = dom.document.createElement('div');
  bubble1.setAttribute('data-user-message-bubble', '');
  bubble1.textContent = 'hello world';
  bubble1.style.top = '100px';
  bubble1.style.height = '40px';
  row1.appendChild(bubble1);
  listContainer.insertBefore(row1, layer);

  const snap2 = adapter.turns.read(snap1.markers);
  assert.equal(snap2.markers.length, 2, 'upgrading anchor to mounted bubble must not duplicate marker');
  assert.equal(snap2.markers[0].id, k1Id, 'marker id survives anchor -> bubble upgrade');
  assert.equal(snap2.markers[0].element, bubble1, 'mounted turn uses real DOM bubble');
  assert.equal(snap2.markers[1].element, a2, 'unmounted turn stays on mirrored anchor');

  // Unmounting row1 demotes back to anchor a1 without losing identity.
  row1.remove();
  const snap3 = adapter.turns.read(snap2.markers);
  assert.equal(snap3.markers.length, 2);
  assert.equal(snap3.markers[0].id, k1Id);
  assert.equal(snap3.markers[0].element, a1);

  // Removing anchor layer falls back cleanly to DOM-only mounted bubbles.
  layer.remove();
  listContainer.appendChild(row1);
  const snap4 = adapter.turns.read(snap3.markers);
  assert.equal(snap4.markers.length, 2, 'known markers retained in DOM fallback');
  assert.equal(snap4.markers[0].element, bubble1);

  // resolveLiveTarget works across other platforms too (e.g. Claude native turn key).
  const claudeAdapter = new CatalogTimelineAdapter({
    siteId: 'claude',
    siteLabel: 'Claude',
    turnSelector: '[data-testid="user-message"]',
    position: 'right',
    pluginId: 'lite.claude',
    coachmarkId: 'lite-timeline',
  }, ownership);
  const claudeRow = dom.document.createElement('article');
  claudeRow.setAttribute('data-turn-key', 'claude-k1');
  const claudeBubble = dom.document.createElement('div');
  claudeBubble.setAttribute('data-testid', 'user-message');
  claudeRow.appendChild(claudeBubble);
  dom.document.body.appendChild(claudeRow);
  const resolvedClaude = claudeAdapter.turns.resolveLiveTarget('claude-k1');
  assert.equal(resolvedClaude?.element, claudeBubble);
  assert.equal(resolvedClaude?.mounted, true);
});

function navFixture(siteId = 'chatgpt') {
  const writes = [], timers = new Map(), listeners = new Map(), viewportListeners = new Map(), pending = [], curtains = [];
  let now = 0, timerId = 0, rafId = 0, anchorTop = 5000, bubbleTop = 5000, bubbleMounted = false, refreshed = 0, refreshTarget = null;
  let activeObserver = null, observerDisconnected = 0;
  const rafs = new Map();
  const viewport = {
    scrollTop: 8000, scrollHeight: 14000, clientHeight: 800,
    images: [],
    addEventListener(type, listener) {
      const list = viewportListeners.get(type) ?? [];
      list.push(listener);
      viewportListeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = viewportListeners.get(type);
      if (!list) return;
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    },
    querySelectorAll(sel) { return sel === 'img' ? this.images : []; },
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTo(options) { writes.push(options); this.scrollTop = options.top; },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    removeEventListener(type, listener) {
      const list = listeners.get(type);
      if (!list) return;
      const idx = list.indexOf(listener);
      if (idx >= 0) list.splice(idx, 1);
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, due: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const anchor = {
    isConnected: true,
    getAttribute: name => (name === 'data-gv-thread-anchor' ? 'k2' : null),
    getBoundingClientRect: () => ({ top: anchorTop - viewport.scrollTop, bottom: anchorTop - viewport.scrollTop + 48, height: 48, width: 1 }),
  };
  const bubble = {
    isConnected: true,
    getAttribute: () => null,
    getBoundingClientRect: () => ({ top: bubbleTop - viewport.scrollTop, bottom: bubbleTop - viewport.scrollTop + 40, height: 40, width: 400 }),
  };
  const markers = [{ id: 'target', hostTurnId: 'k2', element: anchor, center: 5024 }];
  const location = { origin: 'https://chatgpt.com', pathname: '/c/long-3', href: 'https://chatgpt.com/c/long-3' };
  class FakeMutationObserver {
    constructor(cb) { this.cb = cb; }
    observe() { activeObserver = this; }
    disconnect() { if (activeObserver === this) activeObserver = null; observerDisconnected++; }
  }
  const scope = {
    module: { exports: {} }, window, location, AbortController,
    MutationObserver: FakeMutationObserver,
    document: { documentElement: {}, body: {}, querySelectorAll: () => [] },
    Date: class extends Date { static now() { return now; } },
    getComputedStyle: () => ({ display: 'block', flexDirection: 'column', visibility: 'visible' }),
    requestAnimationFrame: fn => { const id = ++rafId; rafs.set(id, fn); return id; },
    cancelAnimationFrame: id => { rafs.delete(id); },
  };
  vm.runInNewContext(navBundle.outputFiles[0].text, scope);
  const navigation = new scope.module.exports.TimelineNavigation({
    virtualized: true, siteId, getMarkers: () => markers,
    refreshMarkers(target) { refreshed++; refreshTarget = target; return true; },
    resolveLiveTarget: siteId === 'chatgpt'
      ? (turnKey) => {
          if (turnKey !== 'k2') return null;
          return bubbleMounted ? { element: bubble, mounted: true } : { element: anchor, mounted: false };
        }
      : undefined,
    onActiveChange() {},
    onPendingChange: id => pending.push(id),
    onCurtainChange: active => curtains.push({ active, writesAtEvent: writes.length, at: now }),
    onScroll() {},
  });
  navigation.setViewport(viewport);
  const emit = (type, event = {}) => {
    for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
  };
  return {
    navigation, markers, anchor, bubble, viewport, writes, timers, pending, curtains, rafs,
    refreshed: () => refreshed,
    refreshTarget: () => refreshTarget,
    hasObserver: () => !!activeObserver,
    observerDisconnected: () => observerDisconnected,
    setAnchorTop(v) { anchorTop = v; },
    setBubbleTop(v) { bubbleTop = v; },
    setBubbleMounted(v) { bubbleMounted = v; },
    wheel() { emit('wheel'); },
    fireMutation(records = [{ type: 'childList', target: { nodeType: 1 }, addedNodes: [{ nodeType: 1 }], removedNodes: [] }]) {
      activeObserver?.cb(records);
    },
    fireViewportScroll() { for (const fn of [...(viewportListeners.get('scroll') ?? [])]) fn(); },
    emitThreadUpdated() { emit('message', { source: window, origin: location.origin, data: { __gvType: 'gv-thread-updated' } }); },
    tick(ms = 50) {
      now += ms;
      const due = [...timers].filter(([, timer]) => timer.due <= now);
      for (const [id, timer] of due) { if (timers.delete(id)) timer.fn(); }
    },
  };
}

test('ChatGPT long-turn jump resists virtualizer +3500px scroll shift behind veil and lifts only after full quiet', () => {
  const f = navFixture();
  f.navigation.navigateToMarker('target');
  assert.equal(f.refreshed(), 1);
  assert.equal(f.refreshTarget(), f.anchor);
  assert.equal(f.curtains[0]?.active, true);
  assert.equal(f.curtains[0]?.writesAtEvent, 0, 'veil covers scroll area before jumping');
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].top, 4624);

  // At 60ms ChatGPT mounts turn 2 (real bubble), still measuring turn 1 above it.
  f.setBubbleMounted(true);
  f.setBubbleTop(5000);
  f.tick(60);
  assert.equal(f.curtains.at(-1)?.active, true, 'veil stays up while waiting for layout settle');

  // At 120ms ChatGPT finishes measuring turn 1 (+3500px) and shifts scrollTop down onto turn 3!
  f.viewport.scrollHeight = 17500;
  f.setAnchorTop(8500);
  f.setBubbleTop(8500);
  f.viewport.scrollTop = 11500; // pushed onto turn 3!
  f.tick(60);
  assert.equal(f.bubble.getBoundingClientRect().top, 380, 're-centers turn 2 behind opaque veil');
  assert.equal(f.curtains.at(-1)?.active, true, 'veil stays up right after shift');

  // Quiet for 350ms -> finishes cleanly on turn 2 and lifts veil.
  for (let i = 0; i < 7; i++) f.tick(60);
  assert.equal(f.timers.size, 0);
  assert.equal(f.hasObserver(), false);
  assert.equal(f.bubble.getBoundingClientRect().top, 380);
  assert.equal(f.curtains.at(-1)?.active, false);
  assert.equal(f.pending.at(-1), null);
  f.navigation.destroy();
});

test('opaque veil waits for host DOM loading mutations and visible images to finish before revealing', () => {
  const f = navFixture('chatgpt');
  f.setBubbleMounted(true);
  f.setBubbleTop(5000);
  f.navigation.navigateToMarker('target');
  assert.equal(f.curtains.at(-1)?.active, true);
  assert.equal(f.hasObserver(), true);

  // Keep firing DOM insertion mutations (e.g. markdown/code/LaTeX rendering) at t=240ms and t=480ms.
  for (let i = 0; i < 4; i++) f.tick(60); // t=240
  f.fireMutation();
  for (let i = 0; i < 4; i++) f.tick(60); // t=480
  assert.equal(f.curtains.at(-1)?.active, true, 'active DOM rendering keeps veil up');
  f.fireMutation();
  for (let i = 0; i < 4; i++) f.tick(60); // t=720
  assert.equal(f.curtains.at(-1)?.active, true);

  // Visible incomplete image also keeps veil up until decoded.
  const img = { complete: false, getBoundingClientRect: () => ({ top: 200, bottom: 500 }) };
  f.viewport.images.push(img);
  for (let i = 0; i < 7; i++) f.tick(60); // t=1140 (DOM quiet > 350ms, but image still loading)
  assert.equal(f.curtains.at(-1)?.active, true, 'incomplete visible image keeps veil up');
  img.complete = true;
  f.tick(60);
  assert.equal(f.curtains.at(-1)?.active, false, 'veil lifts as soon as DOM and images finish');
  assert.equal(f.hasObserver(), false);
  f.navigation.destroy();
});

test('all four platforms raise the opaque veil for distant/unmounted jumps, wait for settle, and enforce safety cap', () => {
  for (const siteId of ['chatgpt', 'claude', 'gemini', 'grok']) {
    const distant = navFixture(siteId);
    if (siteId !== 'chatgpt') {
      distant.markers[0].element = distant.bubble;
      distant.bubble.isConnected = false;
    }
    distant.navigation.navigateToMarker('target');
    assert.equal(distant.curtains[0]?.active, true, `${siteId}: unmounted jump raises veil`);
    assert.equal(distant.curtains[0]?.writesAtEvent, 0, `${siteId}: veil raises before scroll`);
    if (siteId === 'chatgpt') distant.setBubbleMounted(true);
    else distant.bubble.isConnected = true;
    distant.setBubbleTop(5000);
    distant.tick(60);
    assert.equal(distant.curtains.at(-1)?.active, true, `${siteId}: keeps veil up while settling`);
    for (let i = 0; i < 8; i++) distant.tick(60);
    assert.equal(distant.curtains.at(-1)?.active, false, `${siteId}: lifts veil once settled`);
    distant.navigation.destroy();

    const nearby = navFixture(siteId);
    if (siteId === 'chatgpt') nearby.setBubbleMounted(true);
    else nearby.markers[0].element = nearby.bubble;
    nearby.viewport.scrollTop = 4400;
    nearby.navigation.navigateToMarker('target');
    assert.equal(nearby.curtains.length, 0, `${siteId}: nearby mounted jump does not show veil`);
    nearby.navigation.destroy();
  }

  // Safety cap lifts curtain even if DOM keeps mutating (e.g. active streaming reply).
  const streaming = navFixture('chatgpt');
  streaming.setBubbleMounted(true);
  streaming.setBubbleTop(5000);
  streaming.navigation.navigateToMarker('target');
  for (let i = 0; i < 40; i++) {
    streaming.fireMutation();
    streaming.tick(60);
  }
  assert.equal(streaming.curtains.at(-1)?.active, false, 'safety cap lifts veil even during streaming');
  assert.equal(streaming.hasObserver(), false);
  streaming.navigation.destroy();
});

test('user wheel cancels pending veil and settle immediately', () => {
  const f = navFixture();
  f.navigation.navigateToMarker('target');
  f.tick(60);
  f.wheel();
  assert.equal(f.timers.size, 0);
  assert.equal(f.hasObserver(), false);
  assert.equal(f.curtains.at(-1)?.active, false);
  assert.equal(f.pending.at(-1), null);
  f.navigation.destroy();
});
