import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import path from 'node:path';

const bundle = await build({
  stdin: { contents: `export { sites } from './src/sites.ts'; export { userTurnSummary, userTurnDisplayOverride, displayTurnSummary } from './vendor/features/timeline/adapters/catalog/turnHash.ts'; export { mergeMountedTurns, rememberedMarkers } from './vendor/features/timeline/adapters/catalog/turnMerge.ts';`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'iife', globalName: 'attachmentTest', platform: 'browser', alias: { '@': path.resolve('vendor') },
});
const fixtures = {
  chatgpt: `<div data-turn-key="a"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="a"><img alt=""><span class="group/resource-card"><span title="课件.pptx">课件.pptx</span></span></div><div data-chatgpt-search-unit-key="fallback-turn-0:1:assistant" data-chatgpt-search-message-ids="a"><img alt="">assistant reply</div></div>`,
  claude: `<div data-cds="UserMessage" data-turn-key="a"><div data-cds="MessageAttachments"><div data-testid="file-thumbnail" data-cds="MessageAttachmentsImage"><img></div><div data-testid="file-thumbnail" data-cds="MessageAttachmentsFile"><span title="课件.pptx">课件.pptx</span></div></div></div>`,
  gemini: `<user-query><div data-test-id="uploaded-img"><img></div><div data-test-id="uploaded-file"><button aria-label="课件.pptx">课件</button></div></user-query>`,
  grok: `<div id="response-a"><div><button aria-label="打开附件">课件.pptx</button><button aria-label="打开附件"><img>image.png</button></div><div class="message-bubble" data-testid="user-message"><h2 class="sr-only">你</h2><span data-bubble-text>参考以下内容：</span></div></div>`,
};

test('mixed image and file attachments produce one stable marker on each platform', {timeout:30000}, async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_CHROMIUM ? { executablePath: process.env.TEST_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (const [site, markup] of Object.entries(fixtures)) {
      await page.setContent(markup);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const result = await page.evaluate((siteId) => {
        const { sites, userTurnSummary, userTurnDisplayOverride, displayTurnSummary, mergeMountedTurns, rememberedMarkers } = window.attachmentTest;
        const selector = sites.find(site => site.siteId === siteId).turnSelector;
        const elements = [...document.querySelectorAll(selector)];
        const turns = elements.map(element => ({ element, hostTurnId: 'a', summary: userTurnSummary(element), displaySummary: userTurnDisplayOverride(siteId, element) }));
        let markers = mergeMountedTurns([], turns, () => 100);
        for (let i = 0; i < 30; i++) markers = mergeMountedTurns(rememberedMarkers(markers, turns), turns, () => 100);
        return { matched: elements.length, count: markers.length, name: displayTurnSummary(markers[0], '【附件】') };
      }, site);
      assert.deepEqual(result, { matched: 1, count: 1, name: site === 'grok' ? '参考以下内容：' : '课件.pptx' }, site);
    }
  } finally { await browser.close(); }
});
