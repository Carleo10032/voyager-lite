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

test('routeKey keeps the same engine across Grok rid branch switches while rebuilding on conversation changes', () => {
  const location = { href: 'https://grok.com/c/conv-a?rid=first' };
  let tick;
  const window = { location, addEventListener() {}, removeEventListener() {}, setInterval(fn) { tick = fn; return 1; }, clearInterval() {}, setTimeout, clearTimeout };
  const scope = { module: { exports: {} }, location, window, setTimeout, clearTimeout, console };
  vm.runInNewContext(bundle.outputFiles[0].text, scope);
  const { runRouteTimeline } = scope.module.exports;
  let created = 0, destroyed = 0;
  const grokRouteKey = (href) => {
    const url = new URL(href.split('#')[0]);
    url.searchParams.delete('rid');
    return url.toString();
  };
  const route = runRouteTimeline({
    signal: new AbortController().signal,
    routeKey: grokRouteKey,
    createEngine: () => { created++; return { destroy() { destroyed++; } }; },
    start() {},
  });
  assert.equal(created, 1);
  location.href = 'https://grok.com/c/conv-a?rid=second';
  tick();
  assert.equal(created, 1, 'changing only ?rid= must not tear down the rail');
  assert.equal(destroyed, 0);
  location.href = 'https://grok.com/c/conv-b';
  tick();
  assert.equal(created, 2, 'switching conversation still rebuilds the rail');
  assert.equal(destroyed, 1);
  route.stop();
});
