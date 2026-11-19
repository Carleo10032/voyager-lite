import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const bundle = await build({ entryPoints: ['vendor/features/timeline/adapters/catalog/turnHash.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': path.resolve('vendor') } });
class Element {
  constructor(text, file = null, chatgpt = false) { this.textContent = text; this.file = file; this.chatgpt = chatgpt; }
  matches(selector) { return selector === '[data-chatgpt-search-message-ids]' && this.chatgpt; }
  getAttribute() { return null; }
  querySelector(selector) { return selector.includes('resource-card') && this.file ? { getAttribute: () => this.file } : null; }
}
const scope = { module: { exports: {} }, Element };
vm.runInNewContext(bundle.outputFiles[0].text, scope);
const { turnSummary, userTurnSummary, userTurnDisplayOverride, displayTurnSummary } = scope.module.exports;

test('Gemini strips visually-hidden author prefix ("你说") and duplicate hidden prompt copies without altering real text', () => {
  function textNode(value) { return { nodeType: 3, nodeValue: value }; }
  function domEl(tag, { classes = [], attrs = {}, style = {}, children = [], connected = true } = {}) {
    const el = new Element('');
    el.tagName = tag.toUpperCase();
    el.nodeType = 1;
    el.classList = classes;
    el.style = style;
    el.isConnected = connected;
    el.childNodes = children;
    el.getAttribute = name => (name in attrs ? attrs[name] : null);
    el.hasAttribute = name => name in attrs;
    el.matches = () => false;
    for (const c of children) c.parentElement = el;
    el.querySelectorAll = selector => {
      const out = [];
      const walk = node => {
        for (const c of node.childNodes ?? []) {
          if (c.nodeType !== 1) continue;
          if (selector.includes('.query-text') && c.classList.includes('query-text')) out.push(c);
          if (selector.includes('[data-bubble-text]') && c.hasAttribute('data-bubble-text')) out.push(c);
          walk(c);
        }
      };
      walk(el);
      return out;
    };
    return el;
  }

  // Case 1: Gemini bubble with cdk-visually-hidden "你说", visible .query-text, and a second duplicate/aria-hidden copy.
  const geminiBubble = domEl('div', {
    classes: ['user-query-bubble-with-background'],
    children: [
      domEl('span', { classes: ['cdk-visually-hidden'], children: [textNode('你说')] }),
      domEl('div', {
        classes: ['query-text'],
        children: [
          domEl('span', { classes: ['cdk-visually-hidden'], children: [textNode('你说')] }),
          domEl('p', { classes: ['query-text-line'], children: [textNode('帮我写个脚本')] }),
          domEl('span', { attrs: { 'aria-hidden': 'true' }, children: [textNode('帮我写个脚本')] }),
        ],
      }),
      domEl('div', {
        classes: ['query-text'],
        children: [domEl('p', { children: [textNode('帮我写个脚本')] })],
      }),
    ],
  });
  assert.equal(turnSummary(geminiBubble), '帮我写个脚本');

  // Case 2: User genuinely starts their prompt with "你说" — must NOT be stripped!
  const genuine = domEl('div', {
    classes: ['user-query-bubble-with-background'],
    children: [
      domEl('span', { classes: ['cdk-visually-hidden'], children: [textNode('你说')] }),
      domEl('div', {
        classes: ['query-text'],
        children: [domEl('p', { children: [textNode('你说今天天气怎么样')] })],
      }),
    ],
  });
  assert.equal(turnSummary(genuine), '你说今天天气怎么样');
});

test('attachment-only turns show a file name or a fallback without changing text messages', () => {
  assert.equal(userTurnSummary(new Element('', null, true)), '【附件】');
  assert.equal(userTurnSummary(new Element('记录.xlsx电子表格', '记录.xlsx', true)), '记录.xlsx');
  assert.equal(userTurnSummary(new Element('', null)), '【附件】');
  assert.equal(userTurnSummary(new Element('  正文  内容  ')), '正文 内容');
});

test('Gemini displays the full filename while preserving the original summary', () => {
  const element = new Element('记录');
  element.matches = selector => selector === 'user-query';
  element.querySelector = selector => selector.includes('uploaded-file') ? { getAttribute: () => '记录.xlsx' } : null;
  const summary = userTurnSummary(element);
  const displaySummary = userTurnDisplayOverride('gemini', element);
  assert.equal(summary, '记录');
  assert.equal(displayTurnSummary({ summary, displaySummary }, '[Attachment]'), '记录.xlsx');
});

test('Claude attachment-only messages show a filename or a localized placeholder', () => {
  const file = new Element('');
  file.matches = selector => selector === '[data-cds="UserMessage"]';
  file.querySelector = selector => selector.includes('MessageAttachmentsFile') ? { getAttribute: () => '记录.xlsx' } : null;
  assert.equal(userTurnSummary(file), '记录.xlsx');
  file.querySelector = () => null;
  assert.equal(userTurnSummary(file), '【附件】');
});

for (const site of ['ChatGPT', 'Claude', 'Gemini', 'Grok']) {
  test(`${site}: localized attachment labels preserve real text and filenames`, () => {
    const marker = { summary: userTurnSummary(new Element('')), attachmentPlaceholder: true };
    assert.equal(displayTurnSummary(marker, '【附件】'), '【附件】');
    assert.equal(displayTurnSummary(marker, '[Attachment]'), '[Attachment]');
    assert.equal(marker.summary, '【附件】');
    assert.equal(displayTurnSummary({ summary: '【附件】' }, '[Attachment]'), '【附件】');
    assert.equal(displayTurnSummary({ summary: 'slides.pptx' }, '[Attachment]'), 'slides.pptx');
  });
}
