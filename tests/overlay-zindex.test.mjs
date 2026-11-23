import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';

function readRuleZIndex(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{[^}]*?z-index:\\s*(\\d+)\\s*;`, 's'));
  assert.ok(match, `Expected numeric z-index for selector ${selector}`);
  return Number(match[1]);
}

test('timeline and visual effect layers stay above host chrome and below host modals/lightboxes', async () => {
  const timelineCss = await fs.readFile(path.resolve('vendor/features/timeline/timeline.css'), 'utf8');
  const previewCss = await fs.readFile(path.resolve('vendor/features/timeline/timelinePreview.css'), 'utf8');

  const veil = readRuleZIndex(timelineCss, '.gv-navigation-veil');
  const previewPanel = readRuleZIndex(previewCss, '.timeline-preview-panel');
  const hoverBridge = readRuleZIndex(previewCss, '.gv-timeline-preview-hover-bridge');
  const bar = readRuleZIndex(timelineCss, '.gemini-timeline-bar');
  const slider = readRuleZIndex(timelineCss, '.timeline-left-slider');
  const toggle = readRuleZIndex(previewCss, '.timeline-preview-toggle');
  const tooltip = readRuleZIndex(timelineCss, '.timeline-tooltip');
  const contextMenu = readRuleZIndex(timelineCss, '.timeline-context-menu');

  // Must stay above ChatGPT fixed header (30), Grok header wrapper (25), Claude sidebar (20), Gemini topbar (4),
  // and strictly below Claude modals (40), ChatGPT sidebar/modals (40/50+), Gemini CDK overlays (1000), Grok portals (9999).
  for (const [name, value] of Object.entries({
    veil,
    previewPanel,
    hoverBridge,
    bar,
    slider,
    toggle,
    tooltip,
    contextMenu,
  })) {
    assert.ok(value > 30 && value < 40, `${name} z-index (${value}) must be within (30, 40)`);
  }

  assert.ok(veil < previewPanel, 'navigation veil must stay below preview panel');
  assert.equal(previewPanel, hoverBridge, 'preview panel and hover bridge share z-index');
  assert.ok(previewPanel < bar, 'preview panel stays below rail');
  assert.equal(bar, toggle, 'rail and preview toggle share z-index');
  assert.equal(bar, slider, 'rail and slider share z-index');
  assert.ok(bar < tooltip, 'tooltip stays above rail');
  assert.equal(tooltip, contextMenu, 'tooltip and context menu share z-index');

  const effectFiles = [
    'vendor/pages/content/visualEffects/rain.ts',
    'vendor/pages/content/visualEffects/sakura.ts',
    'vendor/pages/content/visualEffects/snow.ts',
  ];

  for (const rel of effectFiles) {
    const source = await fs.readFile(path.resolve(rel), 'utf8');
    const matches = [...source.matchAll(/z-index\s*:\s*(\d+)/g)];
    assert.ok(matches.length > 0, `${rel} should declare explicit z-index`);
    for (const match of matches) {
      const value = Number(match[1]);
      assert.ok(
        value > 30 && value < veil,
        `${rel} z-index (${value}) must sit above host chrome (>30) and below timeline veil (${veil})`,
      );
    }
  }
});

test('Grok mounts and dynamically reparents all timeline surfaces inside #grok-app-root so Base-UI menus stay above the rail', async () => {
  const sitesSrc = await fs.readFile(path.resolve('src/sites.ts'), 'utf8');
  assert.match(
    sitesSrc,
    /siteId:'grok'[^}]*mountAnchorSelector:'#grok-app-root'/,
    'Grok site config must declare mountAnchorSelector #grok-app-root',
  );

  const [adapterBundle, viewBundle, tooltipBundle] = await Promise.all([
    build({
      entryPoints: ['vendor/features/timeline/adapters/catalog/CatalogTimelineAdapter.ts'],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      alias: { '@': path.resolve('vendor') },
    }),
    build({
      entryPoints: ['vendor/features/timeline/TimelineView.ts'],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      alias: { '@': path.resolve('vendor'), '@locales': path.resolve('vendor/locales') },
      plugins: [
        {
          name: 'inline-css',
          setup(b) {
            b.onResolve({ filter: /\.css\?inline$/ }, () => ({ path: 'empty.css', namespace: 'inline-css' }));
            b.onLoad({ filter: /.*/, namespace: 'inline-css' }, () => ({ contents: '', loader: 'text' }));
          },
        },
      ],
    }),
    build({
      entryPoints: ['vendor/features/timeline/TimelineTooltip.ts'],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      alias: { '@': path.resolve('vendor') },
    }),
  ]);

  class MiniEl {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.id = '';
      this.className = '';
      this.dataset = {};
      this.style = { setProperty() {}, removeProperty() {} };
      this.attrs = new Map();
      this.children = [];
      this.parentElement = null;
      this.classList = {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      };
    }
    get isConnected() {
      for (let c = this; c; c = c.parentElement) if (c === body || c === head) return true;
      return false;
    }
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) {
      return this.attrs.get(k) ?? null;
    }
    removeAttribute(k) {
      this.attrs.delete(k);
    }
    appendChild(child) {
      if (child.parentElement) {
        const i = child.parentElement.children.indexOf(child);
        if (i >= 0) child.parentElement.children.splice(i, 1);
      }
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
    append(...nodes) {
      for (const n of nodes) this.appendChild(n);
    }
    remove() {
      if (!this.parentElement) return;
      const i = this.parentElement.children.indexOf(this);
      if (i >= 0) this.parentElement.children.splice(i, 1);
      this.parentElement = null;
    }
    addEventListener() {}
    removeEventListener() {}
    querySelector() {
      return null;
    }
    querySelectorAll() {
      return [];
    }
    getBoundingClientRect() {
      return { left: 254, top: 0, width: 1168, height: 707, right: 1422, bottom: 707 };
    }
  }

  const head = new MiniEl('head');
  const body = new MiniEl('body');
  let grokAppRoot = null;
  const doc = {
    head,
    body,
    documentElement: body,
    createElement: (tag) => new MiniEl(tag),
    querySelector: (sel) => (sel === '#grok-app-root' ? grokAppRoot : null),
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
  };
  const baseEnv = {
    document: doc,
    chrome: {
      runtime: { id: 'test-ext' },
      storage: {
        sync: { get: (_keys, cb) => cb?.({}) },
        onChanged: { addListener() {}, removeListener() {} },
      },
    },
    window: {
      innerWidth: 1422,
      innerHeight: 707,
      setTimeout,
      clearTimeout,
      addEventListener() {},
      removeEventListener() {},
    },
    location: { href: 'https://grok.com/c/test', pathname: '/c/test', origin: 'https://grok.com' },
    getComputedStyle: () => ({
      backgroundColor: 'rgb(255, 255, 255)',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      lineHeight: '18px',
      padding: '0px',
      border: '0px',
      borderRadius: '0px',
      color: '#000',
      getPropertyValue: () => '',
    }),
    HTMLElement: MiniEl,
    Element: MiniEl,
    HTMLFormElement: class {},
    MutationObserver: class { observe() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    AbortController,
    DOMRect: class { constructor(x=0,y=0,w=0,h=0){this.x=this.left=x;this.y=this.top=y;this.width=w;this.height=h;this.right=x+w;this.bottom=y+h;} },
  };

  const adapterScope = { ...baseEnv, module: { exports: {} } };
  vm.runInNewContext(adapterBundle.outputFiles[0].text, adapterScope);
  const { CatalogTimelineAdapter } = adapterScope.module.exports;

  const adapter = new CatalogTimelineAdapter(
    {
      siteId: 'grok',
      siteLabel: 'Grok',
      position: 'left',
      pluginId: 'lite.grok',
      coachmarkId: 'lite-timeline',
      mountAnchorSelector: '#grok-app-root',
      turnSelector: '[data-testid="user-message"]',
    },
    { observe() {}, canStar: () => true },
  );

  // Before #grok-app-root mounts, anchor falls back cleanly to document.body.
  assert.equal(adapter.mount.anchor(), body);

  const viewScope = { ...baseEnv, module: { exports: {} } };
  vm.runInNewContext(viewBundle.outputFiles[0].text, viewScope);
  const { TimelineView } = viewScope.module.exports;

  const tooltipScope = { ...baseEnv, module: { exports: {} } };
  vm.runInNewContext(tooltipBundle.outputFiles[0].text, tooltipScope);
  const { TimelineTooltip } = tooltipScope.module.exports;

  const fakeState = { markers: [], isMarkerStarred: () => false };
  const fakeGeo = { markerLevelEnabled: false, getVisibleMarkers: () => [], getHiddenMarkerIndices: () => new Set(), getMarkerLevel: () => 1, isMarkerCollapsed: () => false };
  const view = new TimelineView(fakeState, fakeGeo, {
    getMountAnchor: () => adapter.mount.anchor(),
    getViewport: () => body,
    getActiveId: () => null,
    navigate() {},
    search() {},
    onStyleChange() {},
    onResize() {},
    position: 'left',
  });
  view.mount();
  const tooltip = new TimelineTooltip(view.ui.timelineBar, {
    getContext: () => ({ style: 'dots', previewOpen: false, position: 'left' }),
    getContent: () => ({ text: '', summary: '', assistantSummary: '', starred: false }),
  });

  assert.equal(view.ui.timelineBar.parentElement, body);
  assert.equal(view.ui.slider.parentElement, body);

  // Once Grok mounts #grok-app-root (inside its isolated wrapper before sibling Base-UI portals),
  // syncMountAnchor reparents rail, slider, preview panel/toggle/bridge, veil, and tooltip into it.
  grokAppRoot = new MiniEl('div');
  grokAppRoot.id = 'grok-app-root';
  body.appendChild(grokAppRoot);
  assert.equal(adapter.mount.anchor(), grokAppRoot);

  view.setNavigationCurtain(true);
  view.syncMountAnchor();
  tooltip.syncMountAnchor();

  assert.equal(view.ui.timelineBar.parentElement, grokAppRoot);
  assert.equal(view.ui.slider.parentElement, grokAppRoot);
  assert.ok(grokAppRoot.children.some((c) => c.className.includes('timeline-preview-panel')));
  assert.ok(grokAppRoot.children.some((c) => c.className.includes('timeline-preview-toggle')));
  assert.ok(grokAppRoot.children.some((c) => c.className.includes('gv-timeline-preview-hover-bridge')));
  assert.ok(grokAppRoot.children.some((c) => c.className.includes('gv-navigation-veil')));
  assert.ok(grokAppRoot.children.some((c) => c.id === 'gemini-timeline-tooltip'));
});
