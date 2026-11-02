import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const bundled = await build({ entryPoints: ['vendor/features/timeline/adapters/catalog/CatalogTimelineAdapter.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': path.resolve('vendor') } });
class Form {
  constructor(id, editable = true) { this.id = id; this.editable = editable; }
  querySelector() { return this.editable ? {} : null; }
  closest(selector) { return selector === '[data-turn-key]' && this.id ? { getAttribute: () => this.id } : null; }
}
const listeners = new Map();
const document = { body: {}, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); } };
class Element {
  constructor(editor = null, disabled = false) { this.editor = editor; this.disabled = disabled; }
  closest(selector) { return selector === 'button' ? this : this.editor; }
  hasAttribute(name) { return name === 'disabled' && this.disabled; }
  matches() { return false; }
}
class MutationObserver { observe() {} }
const scope = { module: { exports: {} }, location: { href: 'https://chatgpt.com/c/test' }, document, Element, HTMLFormElement: Form, MutationObserver };
vm.runInNewContext(bundled.outputFiles[0].text, scope);
const { CatalogTimelineAdapter } = scope.module.exports;

test('submitting a ChatGPT edit discards the old branch but unrelated forms do not', () => {
  const turns = new CatalogTimelineAdapter({ siteId: 'chatgpt', position: 'right' }, {}).turns;
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  turns.observe(() => {});
  listeners.get('submit')({ target: new Form(null) });
  listeners.get('submit')({ target: new Form('edited', false) });
  assert.equal(turns.known.length, 3);
  listeners.get('submit')({ target: new Form('edited') });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');
  turns.stop();
  assert.equal(listeners.has('submit'), false);
});

test('switching a Claude message version clears only that branch', () => {
  const turns = new CatalogTimelineAdapter({ siteId: 'claude', position: 'right' }, {}).turns;
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  const button = new Element();
  button.matches = () => true;
  button.closest = (selector) => selector === 'button' ? button : selector === '[data-turn-key]' ? { getAttribute: () => 'edited' } : null;
  turns.observe(() => {});
  listeners.get('click')({ target: button });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');
  turns.stop();
});

test('saving a Claude edit removes its old branch while cancel and disabled save leave it intact', () => {
  const turns = new CatalogTimelineAdapter({ siteId: 'claude', position: 'right' }, {}).turns;
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  const editor = { getAttribute: () => 'edited', querySelectorAll: () => [cancel, save] };
  const cancel = new Element(editor);
  const save = new Element(editor, true);
  turns.observe(() => {});
  listeners.get('click')({ target: cancel });
  listeners.get('click')({ target: save });
  assert.equal(turns.known.length, 3);
  save.disabled = false;
  listeners.get('click')({ target: save });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');
  turns.stop();
  assert.equal(listeners.has('click'), false);
});
