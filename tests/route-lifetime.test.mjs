import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const bundle = await build({ entryPoints: ['vendor/features/timeline/runRouteTimeline.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': path.resolve('vendor') } });

test('an invalidated extension instance cannot rebuild a rail on a version change', () => {
  const location = { href: 'https://grok.com/c/test?rid=first' };
  let tick;
  const window = { location, addEventListener() {}, removeEventListener() {}, setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, setTimeout, clearTimeout };
  const scope = { module: { exports: {} }, location, window, setTimeout, clearTimeout, console };
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  const { runRouteTimeline } = scope.module.exports;
  let alive = true, oldCreated = 0, oldDestroyed = 0, newCreated = 0;
  const makeEngine = () => ({ destroy() { oldDestroyed++; } });
  const old = runRouteTimeline({ signal: new AbortController().signal, isAlive: () => alive, createEngine: () => { oldCreated++; return makeEngine(); }, start() {} });
  const current = runRouteTimeline({ signal: new AbortController().signal, isAlive: () => true, createEngine: () => { newCreated++; return { destroy() {} }; }, start() {} });
  alive = false;
  location.href = 'https://grok.com/c/test?rid=second';
  tick();
  assert.equal(oldCreated, 1);
  assert.equal(oldDestroyed, 1);
  assert.equal(old.engine, null);
  assert.equal(newCreated, 2);
  current.stop();
});
