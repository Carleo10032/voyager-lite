import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

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
