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
const { userTurnSummary, userTurnDisplayOverride, displayTurnSummary } = scope.module.exports;

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
