import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const fixtures=[
 ['ChatGPT','https://chatgpt.com/c/test-one',(text,id="one")=>`<article data-turn-key="${id}"><div data-message-author-role="user"><div data-user-message-bubble>${text}</div></div><div data-message-author-role="assistant">回复 ${text}</div></article>`],
 ['Claude','https://claude.ai/chat/test-one',(text,id="one")=>`<article data-turn-key="${id}"><div data-testid="user-message">${text}</div><div class="font-claude-message">回复 ${text}</div></article>`],
 ['Gemini','https://gemini.google.com/app/test-one',(text,id="one")=>`<infinite-scroller data-test-id="chat-history-container"><article id="${id}"><user-query><div class="user-query-bubble-with-background">${text}</div></user-query><model-response>回复 ${text}</model-response></article></infinite-scroller>`],
 ['Grok','https://grok.com/c/test-one',(text,id="one")=>`<article id="response-${id}"><div class="items-end"><div class="message-bubble">${text}</div></div><div class="items-start"><div class="message-bubble">回复 ${text}</div></div></article>`],
];
const extension=path.resolve('dist');
const html=markup=>`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>测试对话</title><style>body{font:16px system-ui;background:#f7f7f4;color:#253832;margin:0;padding:40px 15%;}article{padding:24px;border-bottom:1px solid #ddd;min-height:450px}user-query,model-response{display:block}article>div,model-response{margin:20px 0}body.dark{background:#18221f;color:#e5eee6}</style><body><main>${markup}</main></body></html>`;
test('real Chromium extension: four adapters, navigation, live settings, stars, routes and effects', {timeout:120000},async()=>{
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'voyager-lite-test-'));
 const context=await chromium.launchPersistentContext(profile,{headless:true,...(process.env.TEST_CHROMIUM ? {executablePath:process.env.TEST_CHROMIUM} : {channel:'chromium'}),args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1280,height:850}});
 try{
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.sync.set({language:'zh','gvTimeline:chatgpt:ScrollMode':'flow','gvTimeline:claude:ScrollMode':'flow','gvTimeline:grok:ScrollMode':'flow',geminiTimelineScrollMode:'flow'}));
  const errors=[];
  context.on('weberror',error=>errors.push(error.error().message));
  await context.route('https://**/*',route=>route.fulfill({contentType:'text/html',body:html('')}));
  for(const [name,url,turn] of fixtures){
   const page=await context.newPage();
   await page.route(url,route=>route.fulfill({contentType:'text/html',body:html(['第一条问题','第二条问题','第三条问题'].map(turn).join(''))}));
   await page.goto(url);
   await page.waitForSelector('.timeline-dot');
   assert.equal(await page.locator('.timeline-dot').count(),3,`${name}: exactly one marker per user turn`);
   await page.locator('.timeline-dot').last().click();
   await page.waitForFunction(()=>scrollY>300);
   await page.locator('.timeline-preview-toggle').click();
   const search=page.locator('.timeline-preview-search input');
   await search.fill('第二条');
   await page.waitForTimeout(200);
   assert.equal(await page.locator('.timeline-preview-item').count(),1,`${name}: search filters turns`);
   await search.fill('');
   await page.locator('.timeline-preview-toggle').click();
   // Long press is the upstream star gesture.
   const dot=page.locator('.timeline-dot').first();
   await dot.hover();await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
   await page.waitForTimeout(200);
   const saved=await worker.evaluate(()=>chrome.storage.local.get('gvSavedLibraryStars'));
   assert.ok(Object.values(saved.gvSavedLibraryStars?.messages ?? {}).some(list=>list.some(item=>item.conversationUrl===url)),`${name}: star saved`);
   await page.reload();await page.waitForSelector('.timeline-dot.starred');
   await worker.evaluate(()=>chrome.storage.sync.set({liteTimeline:false}));
   await page.waitForFunction(()=>!document.querySelector('.gemini-timeline-bar'));
   await worker.evaluate(()=>chrome.storage.sync.set({liteTimeline:true,liteStyle:'compact'}));
   await page.waitForSelector('.gemini-timeline-bar');
   await worker.evaluate(()=>chrome.storage.sync.set({liteStyle:'ruler'}));
   await page.waitForTimeout(100);
   await worker.evaluate(()=>chrome.storage.sync.set({liteStyle:'dots'}));
   await page.waitForSelector('.timeline-dot');
   await page.evaluate(newMarkup=>{history.pushState({},'',location.pathname.replace('test-one','test-two'));document.querySelector('main').innerHTML=newMarkup;},turn('全新对话'));
   await page.waitForTimeout(750);
   assert.equal(await page.locator('.timeline-dot').count(),1,`${name}: route reset`);
   assert.equal(await page.locator('.timeline-dot.starred').count(),0,`${name}: no stars leak across routes`);
   // Same short text, different native IDs, recreated virtualized DOM windows.
   await page.evaluate(markup=>{history.pushState({},'',location.pathname.replace('test-two','test-three'));document.querySelector('main').innerHTML=markup;},turn('ok','a')+turn('可以','b'));
   await page.waitForTimeout(750);
   assert.equal(await page.locator('.timeline-dot').count(),2,`${name}: fresh native-ID conversation`);
   const originalB=await page.locator('.timeline-dot[aria-label="可以"]').getAttribute('data-target-turn-id');
   await page.evaluate(markup=>document.querySelector('main').innerHTML=markup,turn('可以','b')+turn('ok','c'));
   await page.waitForTimeout(500);
   assert.equal(await page.locator('.timeline-dot').count(),3,`${name}: identical text with distinct IDs stays separate`);
   await page.evaluate(markup=>document.querySelector('main').innerHTML=markup,turn('ok','a')+turn('可以','b')+turn('ok','c'));
   await page.waitForTimeout(500);
   assert.equal(await page.locator('.timeline-dot').count(),3,`${name}: remount creates no ghost markers`);
   assert.equal(await page.locator('.timeline-dot[aria-label="可以"]').getAttribute('data-target-turn-id'),originalB,`${name}: message identity survives remount`);
   for(const effect of ['snow','sakura','rain']){
    await worker.evaluate(value=>chrome.storage.sync.set({gvVisualEffect:value}),effect);
    await page.waitForSelector(`#gv-${effect}-effect-canvas`);
    assert.equal(await page.locator(`#gv-${effect}-effect-canvas`).evaluate(el=>getComputedStyle(el).pointerEvents),'none');
   }
   await worker.evaluate(()=>chrome.storage.sync.set({gvVisualEffect:'none'}));
   if(name==='Gemini'){
    await page.screenshot({path:'tests/light-preview.png'});
    await page.evaluate(()=>document.body.classList.add('dark'));
    await page.screenshot({path:'tests/dark-preview.png'});
   }
   await page.close();
  }
  const id=new URL(worker.url()).host;
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForFunction(()=>document.querySelector('#platform')?.textContent==='当前页面不支持');
  assert.equal(await popup.getByRole('button',{name:'樱花',exact:true}).count(),0);
  await popup.locator('body').screenshot({path:'tests/popup-preview.png'});
  assert.deepEqual(errors,[],`No uncaught errors: ${errors.join('; ')}`);
 }finally{await context.close();await fs.rm(profile,{recursive:true,force:true});}
});
