import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const bundle = await build({
  entryPoints: ['src/settings.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  alias: { '@': path.resolve('vendor') },
});

const context = vm.createContext({ module: { exports: {} } });
context.exports = context.module.exports;
vm.runInContext(bundle.outputFiles[0].text, context);

const effectBundle = await build({
  entryPoints: ['vendor/pages/content/visualEffects/resolveEffect.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
});
const effectCtx = vm.createContext({ module: { exports: {} } });
effectCtx.exports = effectCtx.module.exports;
vm.runInContext(effectBundle.outputFiles[0].text, effectCtx);
const { resolveVisualEffect } = effectCtx.module.exports;

const {
  GLOBAL_SCOPE,
  enabledPatch,
  readGlobalSettings,
  readSettings,
  settingsPatch,
} = context.module.exports;

const ALL_SITES = ['chatgpt', 'claude', 'gemini', 'grok'];

test('global settings apply to every platform and report mixed states when platforms diverge', () => {
  let raw = {};
  const initial = readGlobalSettings(raw, ALL_SITES);
  assert.equal(initial.enabled, true);
  assert.equal(initial.enabledMixed, false);
  assert.equal(initial.timelineStyle, 'dots');
  assert.equal(initial.styleMixed, false);
  assert.equal(initial.timelineSide, 'right');
  assert.equal(initial.sideMixed, false);

  // Per-platform edit updates only Gemini; global detects mixed style.
  raw = { ...raw, ...settingsPatch('gemini', { timelineStyle: 'ruler' }, ALL_SITES) };
  assert.equal(readSettings(raw, 'gemini').timelineStyle, 'ruler');
  assert.equal(readSettings(raw, 'chatgpt').timelineStyle, 'dots');
  const mixedStyle = readGlobalSettings(raw, ALL_SITES);
  assert.equal(mixedStyle.styleMixed, true);

  // Per-platform side edit updates only Claude; global detects mixed side.
  raw = { ...raw, ...settingsPatch('claude', { timelineSide: 'left' }, ALL_SITES) };
  assert.equal(readSettings(raw, 'claude').timelineSide, 'left');
  assert.equal(readSettings(raw, 'gemini').timelineSide, 'right');
  const mixedSide = readGlobalSettings(raw, ALL_SITES);
  assert.equal(mixedSide.sideMixed, true);

  // Global side edit unifies all four platforms.
  raw = { ...raw, ...settingsPatch(GLOBAL_SCOPE, { timelineSide: 'left' }, ALL_SITES) };
  for (const id of ALL_SITES) {
    assert.equal(readSettings(raw, id).timelineSide, 'left', `${id} adopts global left side`);
  }
  assert.equal(readGlobalSettings(raw, ALL_SITES).sideMixed, false);
  assert.equal(readGlobalSettings(raw, ALL_SITES).timelineSide, 'left');

  // Global style edit unifies all four platforms (including previously overridden Gemini).
  raw = { ...raw, ...settingsPatch(GLOBAL_SCOPE, { timelineStyle: 'compact' }, ALL_SITES) };
  for (const id of ALL_SITES) {
    assert.equal(readSettings(raw, id).timelineStyle, 'compact', `${id} adopts global compact style`);
  }
  assert.equal(readGlobalSettings(raw, ALL_SITES).styleMixed, false);
  assert.equal(readGlobalSettings(raw, ALL_SITES).timelineStyle, 'compact');

  // Per-platform disable triggers enabledMixed in global scope.
  raw = { ...raw, ...enabledPatch('grok', false, ALL_SITES) };
  assert.equal(readSettings(raw, 'grok').enabled, false);
  assert.equal(readSettings(raw, 'claude').enabled, true);
  const mixedEnabled = readGlobalSettings(raw, ALL_SITES);
  assert.equal(mixedEnabled.enabled, false);
  assert.equal(mixedEnabled.enabledMixed, true);

  // Global enable turns every platform back on.
  raw = { ...raw, ...enabledPatch(GLOBAL_SCOPE, true, ALL_SITES) };
  for (const id of ALL_SITES) {
    assert.equal(readSettings(raw, id).enabled, true, `${id} re-enabled globally`);
  }
  assert.equal(readGlobalSettings(raw, ALL_SITES).enabled, true);
  assert.equal(readGlobalSettings(raw, ALL_SITES).enabledMixed, false);
});

test('resolveVisualEffect reads gvVisualEffect consistently for popup and page scripts', () => {
  assert.equal(resolveVisualEffect({}), 'off');
  assert.equal(resolveVisualEffect({ gvVisualEffect: null }), 'off');
  assert.equal(resolveVisualEffect({ gvVisualEffect: 'off' }), 'off');
  assert.equal(resolveVisualEffect({ gvVisualEffect: 'none' }), 'off');
  assert.equal(resolveVisualEffect({ gvSnowEffect: true }), 'off');
  assert.equal(resolveVisualEffect({ gvVisualEffect: 'sakura' }), 'sakura');
  assert.equal(resolveVisualEffect({ gvVisualEffect: 'rain' }), 'rain');
  assert.equal(resolveVisualEffect({ gvVisualEffect: 'snow' }), 'snow');
});
