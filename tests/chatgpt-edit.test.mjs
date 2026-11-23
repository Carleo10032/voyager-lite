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
  button.getAttribute = () => null;
  button.matches = (sel) => sel.includes('user-message-previous-version');
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
  cancel.getAttribute = () => null;
  const save = new Element(editor, true);
  save.getAttribute = () => null;
  turns.observe(() => {});
  listeners.get('click')({ target: cancel });
  listeners.get('click')({ target: save });
  assert.equal(turns.known.length, 3);
  save.disabled = false;
  listeners.get('click')({ target: save });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');

  // Pressing Enter in Claude's edit box also clears the old branch while Shift+Enter, IME, and disabled Save leave it intact.
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  const textarea = new Element(editor);
  textarea.closest = (selector) => (selector === '[data-testid="message-edit-box"]' ? editor : null);
  save.disabled = true;
  listeners.get('keydown')({ target: textarea, key: 'Enter', shiftKey: false, altKey: false, isComposing: false });
  assert.equal(turns.known.length, 3);
  save.disabled = false;
  listeners.get('keydown')({ target: textarea, key: 'Enter', shiftKey: true, altKey: false, isComposing: false });
  listeners.get('keydown')({ target: textarea, key: 'Enter', shiftKey: false, altKey: false, isComposing: true });
  assert.equal(turns.known.length, 3);
  listeners.get('keydown')({ target: textarea, key: 'Enter', shiftKey: false, altKey: false, isComposing: false });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');

  // Clicking user-message-retry keeps the retried turn and discards downstream turns.
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  const retry = new Element();
  retry.getAttribute = () => null;
  retry.matches = (sel) => sel === '[data-testid="user-message-retry"]';
  retry.closest = (selector) =>
    selector === 'button' ? retry : selector === '[data-turn-key]' ? { getAttribute: () => 'edited' } : null;
  listeners.get('click')({ target: retry });
  assert.equal(turns.known.length, 2);
  assert.deepEqual(turns.known.map((m) => m.hostTurnId), ['first', 'edited']);

  turns.stop();
  assert.equal(listeners.has('click'), false);
  assert.equal(listeners.has('keydown'), false);
});

test('updating a Gemini edit removes its old branch while cancel and disabled update leave it intact', () => {
  const turns = new CatalogTimelineAdapter({ siteId: 'gemini', position: 'right' }, {}).turns;
  turns.known = [{ hostTurnId: 'first' }, { hostTurnId: 'edited' }, { hostTurnId: 'later' }];
  const scroller = { matches: (sel) => sel === 'infinite-scroller[data-test-id="chat-history-container"]' };
  const row = { id: 'edited', parentElement: scroller };
  const userQuery = { parentElement: row };
  function geminiButton({ update = false, disabled = false, ariaDisabled = 'false', hostDisabled = false } = {}) {
    const updateHost = update
      ? { classList: { contains: (c) => hostDisabled && c === 'gem-button-disabled' } }
      : null;
    const btn = new Element(null, disabled);
    btn.getAttribute = (name) => (name === 'aria-disabled' ? ariaDisabled : null);
    btn.closest = (selector) => {
      if (selector === 'button') return btn;
      if (selector === '.update-button') return updateHost;
      if (selector === 'user-query') return userQuery;
      return null;
    };
    return btn;
  }
  turns.observe(() => {});
  listeners.get('click')({ target: geminiButton({ update: false }) });
  listeners.get('click')({ target: geminiButton({ update: true, disabled: true }) });
  listeners.get('click')({ target: geminiButton({ update: true, ariaDisabled: 'true' }) });
  listeners.get('click')({ target: geminiButton({ update: true, hostDisabled: true }) });
  assert.equal(turns.known.length, 3);
  listeners.get('click')({ target: geminiButton({ update: true }) });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'first');
  turns.stop();
  assert.equal(listeners.has('click'), false);
});

test('sending a Grok edit via save button or Enter clears the old branch while cancel, Shift+Enter, IME, and disabled save leave it intact', () => {
  const turns = new CatalogTimelineAdapter({ siteId: 'grok', position: 'right' }, {}).turns;
  turns.known = [{ hostTurnId: 'response-1' }, { hostTurnId: 'response-2' }, { hostTurnId: 'response-3' }];
  let saveDisabled = true;
  const saveBtn = new Element(null, false);
  saveBtn.matches = (sel) => sel === '[data-testid="user-message-editor-save"]';
  saveBtn.hasAttribute = (name) => name === 'disabled' && saveDisabled;
  saveBtn.getAttribute = () => null;
  const responseEl = {
    id: 'response-2',
    querySelector: (sel) => (sel === '[data-testid="user-message-editor-save"]' ? saveBtn : null),
  };
  saveBtn.closest = (sel) => (sel === 'button' ? saveBtn : sel === '[id^="response-"]' ? responseEl : null);
  const cancelBtn = new Element(null, false);
  cancelBtn.matches = () => false;
  cancelBtn.getAttribute = () => null;
  cancelBtn.closest = (sel) => (sel === 'button' ? cancelBtn : sel === '[id^="response-"]' ? responseEl : null);

  const editor = new Element(null, false);
  editor.closest = (sel) => (sel === '[data-testid="user-message-editor"]' ? editor : sel === '[id^="response-"]' ? responseEl : null);

  turns.observe(() => {});
  listeners.get('click')({ target: cancelBtn });
  listeners.get('click')({ target: saveBtn });
  listeners.get('keydown')({ target: editor, key: 'Enter', shiftKey: false, isComposing: false });
  assert.equal(turns.known.length, 3);

  saveDisabled = false;
  listeners.get('keydown')({ target: editor, key: 'Enter', shiftKey: true, isComposing: false });
  listeners.get('keydown')({ target: editor, key: 'Enter', shiftKey: false, isComposing: true });
  assert.equal(turns.known.length, 3);

  listeners.get('click')({ target: saveBtn });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'response-1');

  turns.known = [{ hostTurnId: 'response-1' }, { hostTurnId: 'response-2' }, { hostTurnId: 'response-3' }];
  listeners.get('keydown')({ target: editor, key: 'Enter', shiftKey: false, isComposing: false });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'response-1');

  // Switching Grok history version (< 2 / 2 >) clears that branch immediately without affecting unrelated groups.
  turns.known = [{ hostTurnId: 'response-1' }, { hostTurnId: 'response-2' }, { hostTurnId: 'response-3' }];
  const prevBtn = new Element(null, false);
  const nextBtn = new Element(null, false);
  const versionGroup = { children: [prevBtn, { textContent: '2 / 2' }, nextBtn] };
  for (const btn of [prevBtn, nextBtn]) {
    btn.matches = () => false;
    btn.getAttribute = () => null;
    btn.closest = (sel) => (sel === 'button' ? btn : sel === '[role="group"]' ? versionGroup : sel === '[id^="response-"]' ? responseEl : null);
  }
  const unrelatedBtn = new Element(null, false);
  unrelatedBtn.matches = () => false;
  unrelatedBtn.getAttribute = () => null;
  const otherGroup = { children: [unrelatedBtn, { textContent: 'Share' }, new Element()] };
  unrelatedBtn.closest = (sel) => (sel === 'button' ? unrelatedBtn : sel === '[role="group"]' ? otherGroup : sel === '[id^="response-"]' ? responseEl : null);
  listeners.get('click')({ target: unrelatedBtn });
  assert.equal(turns.known.length, 3);
  listeners.get('click')({ target: prevBtn });
  assert.equal(turns.known.length, 1);
  assert.equal(turns.known[0].hostTurnId, 'response-1');

  turns.stop();
  assert.equal(listeners.has('click'), false);
  assert.equal(listeners.has('keydown'), false);
});
