import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const inlineCssPlugin = {
  name: 'inline-css',
  setup(b) {
    b.onResolve({ filter: /\.css\?inline$/ }, () => ({ path: 'empty.css', namespace: 'inline-css' }));
    b.onLoad({ filter: /.*/, namespace: 'inline-css' }, () => ({ contents: '', loader: 'text' }));
  },
};

const bundle = await build({
  stdin: {
    contents: `
      export { TimelineTooltip } from './vendor/features/timeline/TimelineTooltip.ts';
      export { TimelinePreviewPanel } from './vendor/features/timeline/TimelinePreviewPanel.ts';
      export { TimelineRailPlacement } from './vendor/features/timeline/TimelineRailPlacement.ts';
      export { TimelineView } from './vendor/features/timeline/TimelineView.ts';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  alias: { '@': path.resolve('vendor'), '@locales': path.resolve('vendor/locales') },
  plugins: [inlineCssPlugin],
});

function createEnv({ innerWidth = 1440, innerHeight = 900, afterWidth = '10px', barRect, dotRect } = {}) {
  class MiniClassList {
    constructor(el) { this.el = el; this.set = new Set(); }
    add(...names) { names.forEach(n => this.set.add(n)); }
    remove(...names) { names.forEach(n => this.set.delete(n)); }
    toggle(name, force) {
      if (force === undefined) { if (this.set.has(name)) { this.set.delete(name); return false; } this.set.add(name); return true; }
      if (force) this.set.add(name); else this.set.delete(name);
      return !!force;
    }
    contains(name) { return this.set.has(name); }
    setFromString(s) { this.set = new Set(String(s || '').split(/\s+/).filter(Boolean)); }
  }
  class MiniEl {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.style = {
        setProperty: (k, v) => { this.style[k] = v; },
        removeProperty: (k) => { delete this.style[k]; },
        getPropertyValue: (k) => this.style[k] ?? '',
      };
      this.dataset = {};
      this.attrs = new Map();
      this.children = [];
      this.parentElement = null;
      this.classList = new MiniClassList(this);
      this.offsetWidth = 24;
      this.offsetHeight = 60;
      this.clientHeight = 540;
      this.scrollTop = 0;
      this.scrollHeight = 540;
      this.listeners = new Map();
      this._rect = null;
    }
    get className() { return [...this.classList.set].join(' '); }
    set className(v) { this.classList.setFromString(v); }
    get isConnected() {
      for (let c = this; c; c = c.parentElement) if (c === document.body || c === document.head) return true;
      return false;
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.get(k) ?? null; }
    removeAttribute(k) { this.attrs.delete(k); }
    appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
    append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
    replaceChildren(...nodes) { this.children = []; nodes.forEach(n => this.appendChild(n)); }
    remove() {
      if (!this.parentElement) return;
      const i = this.parentElement.children.indexOf(this);
      if (i >= 0) this.parentElement.children.splice(i, 1);
      this.parentElement = null;
    }
    insertBefore(c, ref) {
      c.parentElement = this;
      const i = ref ? this.children.indexOf(ref) : -1;
      if (i >= 0) this.children.splice(i, 0, c);
      else this.children.push(c);
      return c;
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    contains(node) {
      for (let c = node; c; c = c.parentElement) if (c === this) return true;
      return false;
    }
    matches(sel) {
      return sel.split(',').some(part => {
        const s = part.trim();
        if (s.startsWith('#')) return this.id === s.slice(1);
        if (s.startsWith('.')) return this.classList.contains(s.slice(1));
        return this.tagName === s.toUpperCase();
      });
    }
    closest(sel) { for (let c = this; c; c = c.parentElement) if (c.matches(sel)) return c; return null; }
    querySelectorAll(sel) {
      const out = [];
      const walk = n => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
    getBoundingClientRect() {
      if (this._rect) return this._rect;
      if (this.classList.contains('gemini-timeline-bar')) {
        if (typeof barRect === 'function') return barRect(this);
        const left = this.style.left ? parseFloat(this.style.left) : innerWidth - 15 - 24;
        return { left, right: left + 24, top: 60, bottom: 600, width: 24, height: 540 };
      }
      if (this.classList.contains('timeline-dot') && typeof dotRect === 'function') return dotRect(this);
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    }
  }

  class DOMRect {
    constructor(x = 0, y = 0, width = 0, height = 0) {
      this.x = x; this.y = y; this.width = width; this.height = height;
      this.left = x; this.top = y; this.right = x + width; this.bottom = y + height;
    }
  }

  const resizeObservers = [];
  class FakeResizeObserver {
    constructor(cb) { this.cb = cb; this.targets = new Set(); resizeObservers.push(this); }
    observe(el) { this.targets.add(el); }
    disconnect() { this.targets.clear(); }
    trigger() { this.cb([]); }
  }

  const head = new MiniEl('head');
  const body = new MiniEl('body');
  const documentElement = new MiniEl('html');
  documentElement.appendChild(head);
  documentElement.appendChild(body);
  const document = {
    head,
    body,
    documentElement,
    scrollingElement: documentElement,
    createElement: tag => new MiniEl(tag),
    createDocumentFragment: () => new MiniEl('fragment'),
    createTextNode: text => ({ nodeType: 3, textContent: text }),
    querySelectorAll: sel => documentElement.querySelectorAll(sel),
    querySelector: sel => documentElement.querySelector(sel),
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    innerWidth,
    innerHeight,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  };
  const getComputedStyle = (el, pseudo) => {
    if (pseudo === '::after') return { width: afterWidth };
    return {
      display: 'block',
      overflowY: el.style.overflowY || 'visible',
      getPropertyValue: name => (name === '--timeline-tooltip-max' ? '320' : ''),
    };
  };
  const scope = {
    module: { exports: {} },
    window,
    document,
    Element: MiniEl,
    HTMLElement: MiniEl,
    DOMRect,
    AbortController,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame: fn => { fn(); return 1; },
    cancelAnimationFrame() {},
    getComputedStyle,
    navigator: { language: 'zh-CN' },
    chrome: { runtime: { id: 'test' }, storage: { onChanged: { addListener() {}, removeListener() {} } } },
  };
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  return { ...scope.module.exports, document, window, MiniEl, resizeObservers };
}

test('left-side tooltip mirrors exact 12px gap and opens into chat content even with a wide left sidebar', () => {
  const sidebarWidth = 288;
  const barLeft = sidebarWidth + 15; // 303
  const barCenter = barLeft + 12;    // 315
  const rightBarLeft = 1440 - 15 - 24; // 1401
  const rightBarCenter = rightBarLeft + 12; // 1413

  for (const [style, afterWidth, expectedGapEdgeLeft, expectedGapEdgeRight] of [
    ['dots', '10px', barCenter + 5, rightBarCenter - 5],
    ['ruler', '32px', barCenter + 32, rightBarCenter - 32],
  ]) {
    // Left rail (even with 288px sidebar available to the left, tooltip must open to the RIGHT into chat content).
    const leftEnv = createEnv({
      afterWidth,
      dotRect: () => ({ left: barCenter - 48, right: barCenter + 48, top: 300, bottom: 318, width: 96, height: 18 }),
    });
    const leftBar = leftEnv.document.createElement('div');
    leftBar.className = 'gemini-timeline-bar gv-timeline-ruler-inward-right';
    leftEnv.document.body.appendChild(leftBar);
    const leftDot = leftEnv.document.createElement('button');
    leftDot.className = 'timeline-dot';
    leftDot.dataset.targetTurnId = 't1';
    leftDot.setAttribute('aria-label', '提问内容');
    leftBar.appendChild(leftDot);
    const leftTip = new leftEnv.TimelineTooltip(leftBar, {
      getContext: () => ({ style, previewOpen: false, position: 'left' }),
      getContent: () => ({ text: '提问内容', summary: '提问内容', assistantSummary: '回答摘要', starred: false }),
    });
    leftTip.show(leftDot);
    const tipEl = leftEnv.document.querySelector('#gemini-timeline-tooltip');
    assert.equal(tipEl.getAttribute('data-placement'), 'right', `${style}: left rail tooltip opens rightward`);
    assert.equal(parseFloat(tipEl.style.left), expectedGapEdgeLeft + 12, `${style}: left rail keeps exact 12px gap`);
    leftTip.destroy();

    // Right rail mirror check.
    const rightEnv = createEnv({
      afterWidth,
      dotRect: () => ({ left: rightBarCenter - 48, right: rightBarCenter + 48, top: 300, bottom: 318, width: 96, height: 18 }),
    });
    const rightBar = rightEnv.document.createElement('div');
    rightBar.className = 'gemini-timeline-bar';
    rightEnv.document.body.appendChild(rightBar);
    const rightDot = rightEnv.document.createElement('button');
    rightDot.className = 'timeline-dot';
    rightDot.dataset.targetTurnId = 't1';
    rightDot.setAttribute('aria-label', '提问内容');
    rightBar.appendChild(rightDot);
    const rightTip = new rightEnv.TimelineTooltip(rightBar, {
      getContext: () => ({ style, previewOpen: false, position: 'right' }),
      getContent: () => ({ text: '提问内容', summary: '提问内容', assistantSummary: '回答摘要', starred: false }),
    });
    rightTip.show(rightDot);
    const rTipEl = rightEnv.document.querySelector('#gemini-timeline-tooltip');
    const rWidth = parseFloat(rTipEl.style.width);
    assert.equal(rTipEl.getAttribute('data-placement'), 'left', `${style}: right rail tooltip opens leftward`);
    assert.equal(parseFloat(rTipEl.style.left) + rWidth, expectedGapEdgeRight - 12, `${style}: right rail keeps exact 12px gap`);
    rightTip.destroy();
  }
});

test('compact preview panel and hover bridge mirror with exact 12px tick gap on left side', () => {
  const barLeft = 288 + 15; // 303
  const barCenter = barLeft + 12; // 315
  const env = createEnv({
    afterWidth: '7.5px',
    barRect: () => ({ left: barLeft, right: barLeft + 24, top: 60, bottom: 600, width: 24, height: 540 }),
    dotRect: () => ({ left: barCenter - 8, right: barCenter + 8, top: 326, bottom: 334, width: 16, height: 8 }),
  });
  const bar = env.document.createElement('div');
  bar.className = 'gemini-timeline-bar timeline-style-compact gv-timeline-ruler-inward-right';
  const dot = env.document.createElement('button');
  dot.className = 'timeline-dot';
  bar.appendChild(dot);
  env.document.body.appendChild(bar);

  const panel = new env.TimelinePreviewPanel(bar, env.document.body, 'right');
  panel.init(() => {});
  panel.setCompactMode(true);
  panel.setRailPosition('left');
  panel.updateMarkers([{ id: 't1', summary: '第一轮', index: 0, starred: false }]);
  panel.open();

  const panelEl = env.document.querySelector('.timeline-preview-panel');
  const bridgeEl = env.document.querySelector('.gv-timeline-preview-hover-bridge');
  assert.ok(panelEl.classList.contains('timeline-preview-panel-left'));
  // Tick extends rightward from barCenter (315) by 7.5px to 322.5, plus 12px gap => 334.5.
  assert.equal(parseFloat(panelEl.style.left), barCenter + 7.5 + 12);
  // Hover bridge connects bar right edge (327) to panel left edge (334.5).
  assert.equal(parseFloat(bridgeEl.style.left), barLeft + 24);
  assert.equal(parseFloat(bridgeEl.style.width), Math.round((barCenter + 7.5 + 12) - (barLeft + 24)));
  panel.destroy();
});

test('TimelineView places left rail 15px inside chat scroller, tracks sidebar resize, and switches live without loading spinner', () => {
  let scrollerLeft = 288;
  const env = createEnv();
  const scroller = env.document.createElement('div');
  scroller.style.overflowY = 'scroll';
  scroller._rect = { left: scrollerLeft, right: 1440, top: 0, bottom: 900, width: 1152, height: 900 };
  env.document.body.appendChild(scroller);

  const state = { markers: [{ id: 'm1', element: scroller, summary: 'hello', baseN: 0.5, starred: false }], toggleStar() {} };
  const geometry = {
    markerLevelEnabled: false,
    getHiddenMarkerIndices: () => new Set(),
    calculateCollapsedPositions: () => ({ desiredY: [100] }),
    isMarkerCollapsed: () => false,
    getMarkerLevel: () => 1,
  };
  const view = new env.TimelineView(state, geometry, {
    mountAnchor: env.document.body,
    position: 'right',
    getViewport: () => scroller,
    getActiveId: () => 'm1',
    navigate() {},
    search() {},
    onStyleChange() {},
    onResize() {},
  });
  view.mount();
  const bar = view.ui.timelineBar;

  // Default right side uses CSS right: 15px and no inward-right class.
  assert.equal(bar.dataset.gvPosition, 'right');
  assert.equal(bar.style.left, '');
  assert.equal(bar.classList.contains('gv-timeline-ruler-inward-right'), false);
  assert.equal('setNavigationPending' in view, false, 'dot-side loading spinner API removed');

  // Switch live to left side: aligns 15px inside scroller.left (288 + 15 = 303px).
  view.setRailPosition('left');
  assert.equal(bar.dataset.gvPosition, 'left');
  assert.equal(bar.style.right, 'auto');
  assert.equal(bar.style.left, '303px');
  assert.equal(bar.classList.contains('gv-timeline-ruler-inward-right'), true);

  // Sidebar collapses (scroller moves from 288 -> 72): ResizeObserver updates left to 72 + 15 = 87px.
  scrollerLeft = 72;
  scroller._rect = { left: scrollerLeft, right: 1440, top: 0, bottom: 900, width: 1368, height: 900 };
  const boundsObserver = env.resizeObservers.find(o => o.targets.has(scroller));
  assert.ok(boundsObserver, 'left rail observes chat scroller for sidebar collapse/expand');
  boundsObserver.trigger();
  assert.equal(bar.style.left, '87px');

  // Switch back to right side: clears inline left/right and stops observing scroller.
  view.setRailPosition('right');
  assert.equal(bar.style.left, '');
  assert.equal(bar.style.right, '');
  assert.equal(bar.classList.contains('gv-timeline-ruler-inward-right'), false);
  assert.equal(boundsObserver.targets.size, 0);
  view.destroy();
});
