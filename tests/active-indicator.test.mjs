import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const distDir = path.resolve('dist');

const PLATFORMS = [
  {
    name: 'ChatGPT',
    url: 'https://chatgpt.com/c/indicator-test',
    turn: (text, id) =>
      `<article data-turn-key="${id}"><div data-message-author-role="user"><div data-user-message-bubble>${text}</div></div><div data-message-author-role="assistant">回复 ${text}</div></article>`,
    wrap: (body) =>
      `<main data-app-shell-active-page="true"><div data-app-action-timeline-scroll style="height:700px;overflow-y:auto">${body}</div></main>`,
  },
  {
    name: 'Claude',
    url: 'https://claude.ai/chat/indicator-test',
    turn: (text, id) =>
      `<article data-turn-key="${id}"><div data-testid="user-message">${text}</div><div class="font-claude-message">回复 ${text}</div></article>`,
    wrap: (body) =>
      `<main><div data-autoscroll-container="true" style="height:700px;overflow-y:auto">${body}</div></main>`,
  },
  {
    name: 'Gemini',
    url: 'https://gemini.google.com/app/indicator-test',
    turn: (text, id) =>
      `<article id="${id}"><user-query><div class="user-query-bubble-with-background">${text}</div></user-query><model-response>回复 ${text}</model-response></article>`,
    wrap: (body) =>
      `<main><infinite-scroller data-test-id="chat-history-container" style="display:block;height:700px;overflow-y:auto">${body}</infinite-scroller></main>`,
  },
  {
    name: 'Grok',
    url: 'https://grok.com/c/indicator-test',
    turn: (text, id) =>
      `<article id="response-${id}"><div data-testid="user-message" class="message-bubble"><span data-bubble-text>${text}</span></div><div data-testid="assistant-message" class="message-bubble">回复 ${text}</div></article>`,
    wrap: (body) =>
      `<div id="grok-app-root"><main><div data-testid="chat-transcript-scroller" style="height:700px;overflow-y:auto">${body}</div></main></div>`,
  },
];

const buildHtml = (markup) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; font: 16px system-ui; background: #fff; color: #111; }
    article { padding: 24px; min-height: 420px; border-bottom: 1px solid #eee; }
    user-query, model-response { display: block; }
  </style>
</head>
<body>${markup}</body>
</html>`;

async function injectDist(page, contentJs, tokensCss, initialStorage = {}) {
  await page.addStyleTag({ content: tokensCss });
  await page.evaluate((store) => {
    const syncData = { ...store };
    const listeners = [];
    window.__setSync = (patch) => {
      const changes = {};
      for (const [k, v] of Object.entries(patch)) {
        changes[k] = { oldValue: syncData[k], newValue: v };
        syncData[k] = v;
      }
      for (const fn of listeners) fn(changes, 'sync');
    };
    globalThis.chrome = {
      runtime: {
        id: 'test-ext',
        lastError: null,
        onMessage: { addListener() {}, removeListener() {} },
        sendMessage(_msg, cb) { cb?.({}); return Promise.resolve({}); },
        getURL: (p) => `chrome-extension://test-ext/${p ?? ''}`,
      },
      storage: {
        sync: {
          get(keys, cb) {
            const out = {};
            if (keys && typeof keys === 'object') {
              for (const [k, def] of Object.entries(keys)) out[k] = k in syncData ? syncData[k] : def;
            } else {
              Object.assign(out, syncData);
            }
            cb?.(out);
            return Promise.resolve(out);
          },
          set(patch, cb) {
            window.__setSync(patch);
            cb?.();
            return Promise.resolve();
          },
        },
        local: {
          get(_k, cb) { cb?.({}); return Promise.resolve({}); },
          set(_p, cb) { cb?.(); return Promise.resolve(); },
        },
        onChanged: {
          addListener(fn) { listeners.push(fn); },
          removeListener(fn) {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
      },
    };
  }, initialStorage);
  await page.addScriptTag({ content: contentJs });
}

test('gliding active indicator lights target only on arrival across platforms, styles, sides, and newly appended turns', { timeout: 90000 }, async () => {
  const [contentJs, tokensCss] = await Promise.all([
    fs.readFile(path.join(distDir, 'content.js'), 'utf8'),
    fs.readFile(path.join(distDir, 'tokens.css'), 'utf8'),
  ]);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const platform of PLATFORMS) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      await page.route('https://**/*', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: buildHtml(
            platform.wrap(
              [
                platform.turn('第一条消息', 't1'),
                platform.turn('第二条消息', 't2'),
                platform.turn('第三条消息', 't3'),
              ].join(''),
            ),
          ),
        }),
      );
      await page.goto(platform.url);
      await injectDist(page, contentJs, tokensCss);
      await page.waitForSelector('.gv-timeline-active-indicator.gv-active-visible');

      // 1. Initial indicator aligns with active dot and has short 180ms transform transition
      const initial = await page.evaluate(() => {
        const ind = document.querySelector('.gv-timeline-active-indicator');
        const activeDot = document.querySelector('.timeline-dot.active');
        const indRect = ind.getBoundingClientRect();
        const dotRect = activeDot.getBoundingClientRect();
        const cs = getComputedStyle(ind);
        return {
          pointerEvents: cs.pointerEvents,
          opacity: parseFloat(cs.opacity),
          indicatorBg: cs.backgroundColor,
          transitionProperty: cs.transitionProperty,
          transitionDuration: cs.transitionDuration,
          dy: Math.abs((indRect.top + indRect.height / 2) - (dotRect.top + dotRect.height / 2)),
          dx: Math.abs((indRect.left + indRect.width / 2) - (dotRect.left + dotRect.width / 2)),
          offsetBefore: ind.style.getPropertyValue('--gv-active-offset'),
        };
      });
      assert.equal(initial.pointerEvents, 'none', `${platform.name}: indicator never blocks pointer events`);
      assert.equal(initial.opacity, 1, `${platform.name}: indicator visible on active dot`);
      assert.match(initial.transitionProperty, /transform/, `${platform.name}: indicator animates transform`);
      assert.match(initial.transitionDuration, /0\.18s/, `${platform.name}: indicator uses short 180ms glide`);
      assert.ok(initial.dy <= 1.2, `${platform.name}: initial indicator Y aligned (dy=${initial.dy})`);
      assert.ok(initial.dx <= 1.2, `${platform.name}: initial indicator X aligned (dx=${initial.dx})`);

      // 2. Hovering target dot must NOT prematurely paint it with active accent color
      const lastDot = page.locator('.timeline-dot').last();
      await lastDot.hover();
      await page.waitForTimeout(140);
      const hoveredBg = await page.evaluate(() => {
        const target = document.querySelectorAll('.timeline-dot')[2];
        return getComputedStyle(target, '::after').backgroundColor;
      });
      assert.notEqual(
        hoveredBg,
        initial.indicatorBg,
        `${platform.name}: hovered target dot stays neutral before indicator arrives`,
      );

      // 3. Clicking target dot keeps underlying dot neutral while indicator glides and lands on it
      await lastDot.click();
      const targetAfterClickBg = await page.evaluate(() => {
        const target = document.querySelectorAll('.timeline-dot')[2];
        return getComputedStyle(target, '::after').backgroundColor;
      });
      assert.notEqual(
        targetAfterClickBg,
        initial.indicatorBg,
        `${platform.name}: clicked target dot does not prematurely paint active accent color`,
      );

      await page.waitForFunction(() => !document.querySelector('.gv-navigation-veil'));
      await page.waitForTimeout(260);
      const afterClick = await page.evaluate(() => {
        const ind = document.querySelector('.gv-timeline-active-indicator');
        const activeDot = document.querySelector('.timeline-dot.active');
        const indRect = ind.getBoundingClientRect();
        const dotRect = activeDot.getBoundingClientRect();
        return {
          offsetAfter: ind.style.getPropertyValue('--gv-active-offset'),
          activeIndex: activeDot.dataset.markerIndex,
          dy: Math.abs((indRect.top + indRect.height / 2) - (dotRect.top + dotRect.height / 2)),
        };
      });
      assert.equal(afterClick.activeIndex, '2', `${platform.name}: last dot became active`);
      assert.notEqual(afterClick.offsetAfter, initial.offsetBefore, `${platform.name}: indicator moved to new offset`);
      assert.ok(afterClick.dy <= 1.2, `${platform.name}: indicator landed on clicked dot (dy=${afterClick.dy})`);

      // 4. Appending a new turn glides indicator smoothly onto new dot (without snapping)
      await page.evaluate((newTurnHtml) => {
        const scroller =
          document.querySelector('[data-app-action-timeline-scroll]') ||
          document.querySelector('[data-autoscroll-container="true"]') ||
          document.querySelector('infinite-scroller') ||
          document.querySelector('[data-testid="chat-transcript-scroller"]');
        scroller.insertAdjacentHTML('beforeend', newTurnHtml);
        scroller.scrollTop = scroller.scrollHeight;
      }, platform.turn('第四条新消息', 't4'));
      await page.waitForFunction(() => document.querySelectorAll('.timeline-dot').length === 4);
      await page.waitForTimeout(260);
      const afterAppend = await page.evaluate(() => {
        const dots = document.querySelectorAll('.timeline-dot');
        const ind = document.querySelector('.gv-timeline-active-indicator');
        const activeDot = document.querySelector('.timeline-dot.active');
        const indRect = ind.getBoundingClientRect();
        const dotRect = activeDot.getBoundingClientRect();
        return {
          count: dots.length,
          activeIndex: activeDot.dataset.markerIndex,
          hasNoTransition: ind.classList.contains('gv-no-transition'),
          visible: ind.classList.contains('gv-active-visible'),
          dy: Math.abs((indRect.top + indRect.height / 2) - (dotRect.top + dotRect.height / 2)),
        };
      });
      assert.equal(afterAppend.count, 4, `${platform.name}: 4th dot added`);
      assert.equal(afterAppend.activeIndex, '3', `${platform.name}: newly appended turn becomes active`);
      assert.equal(afterAppend.hasNoTransition, false, `${platform.name}: indicator glides without no-transition snap`);
      assert.equal(afterAppend.visible, true, `${platform.name}: indicator remains visible`);
      assert.ok(afterAppend.dy <= 1.2, `${platform.name}: indicator landed on newly appended dot (dy=${afterAppend.dy})`);

      // 5. Verify Ruler & Compact styles + Left/Right rail mirroring + neutral Ruler hover on Gemini
      if (platform.name === 'Gemini') {
        for (const style of ['ruler', 'compact', 'dots']) {
          for (const side of ['left', 'right']) {
            await page.evaluate(
              ({ nextStyle, nextSide }) => {
                window.__setSync({
                  geminiTimelineStyle: nextStyle,
                  geminiTimelineSide: nextSide,
                });
              },
              { nextStyle: style, nextSide: side },
            );
            await page.waitForTimeout(240);
            const geom = await page.evaluate(() => {
              const ind = document.querySelector('.gv-timeline-active-indicator');
              const activeDot = document.querySelector('.timeline-dot.active');
              const indRect = ind.getBoundingClientRect();
              const dotRect = activeDot.getBoundingClientRect();
              return {
                width: indRect.width,
                height: indRect.height,
                dy: Math.abs((indRect.top + indRect.height / 2) - (dotRect.top + dotRect.height / 2)),
              };
            });
            assert.ok(geom.width >= 4 && geom.height >= 2, `Gemini ${style}/${side}: indicator has painted geometry`);
            assert.ok(geom.dy <= 1.2, `Gemini ${style}/${side}: indicator Y aligned (dy=${geom.dy})`);
          }
        }

        // Verify Ruler hover keeps non-active tick neutral, glides+stretches in one GPU transform,
        // and syncs wave width on in-place hover
        await page.evaluate(() => window.__setSync({ geminiTimelineStyle: 'ruler', geminiTimelineSide: 'right' }));
        await page.waitForTimeout(100);
        await page.locator('.timeline-dot').first().hover();
        await page.waitForTimeout(140);
        const rulerNonActiveHover = await page.evaluate(() => ({
          indBg: getComputedStyle(document.querySelector('.gv-timeline-active-indicator')).backgroundColor,
          hoveredBg: getComputedStyle(document.querySelector('.timeline-dot'), '::after').backgroundColor,
          beforeRectW: document.querySelector('.gv-timeline-active-indicator').getBoundingClientRect().width,
        }));
        assert.notEqual(
          rulerNonActiveHover.hoveredBg,
          rulerNonActiveHover.indBg,
          'Gemini ruler: hovering non-active tick stays neutral',
        );
        assert.ok(
          Math.abs(rulerNonActiveHover.beforeRectW - 7.5) <= 0.5,
          `Gemini ruler: unhovered active indicator is 7.5px (${rulerNonActiveHover.beforeRectW}px)`,
        );
        // Click hovered first dot (32px) from active last dot (7.5px) and verify single synchronized transform transition
        const rulerGlidePromise = page.evaluate(
          () =>
            new Promise((resolve) => {
              const ind = document.querySelector('.gv-timeline-active-indicator');
              const startY = ind.getBoundingClientRect().top;
              const startW = ind.getBoundingClientRect().width;
              const samples = [];
              const t0 = performance.now();
              const tick = () => {
                const r = ind.getBoundingClientRect();
                samples.push({
                  t: performance.now() - t0,
                  y: r.top,
                  w: r.width,
                  transition: getComputedStyle(ind).transitionDuration,
                });
                if (performance.now() - t0 < 230) requestAnimationFrame(tick);
                else resolve({ startY, startW, samples });
              };
              requestAnimationFrame(tick);
            }),
        );
        await page.locator('.timeline-dot').first().click();
        const rulerGlide = await rulerGlidePromise;
        const finalSample = rulerGlide.samples.at(-1);
        assert.ok(
          Math.abs(finalSample.w - 32) <= 0.6,
          `Gemini ruler: active indicator smoothly stretched to 32px (${finalSample.w}px)`,
        );
        // Verify proportional Y and width progress during the glide (both driven by the same 180ms transform)
        const midSamples = rulerGlide.samples.filter(
          (s) => Math.abs(s.y - rulerGlide.startY) > 4 && Math.abs(s.y - finalSample.y) > 2,
        );
        for (const s of midSamples) {
          const yProg = (s.y - rulerGlide.startY) / (finalSample.y - rulerGlide.startY);
          const wProg = (s.w - rulerGlide.startW) / (finalSample.w - rulerGlide.startW);
          assert.ok(
            Math.abs(yProg - wProg) <= 0.15,
            `Gemini ruler: width progress (${wProg.toFixed(2)}) matches Y progress (${yProg.toFixed(2)})`,
          );
        }
        await page.waitForFunction(() => !document.querySelector('.gv-navigation-veil'));
        await page.waitForTimeout(200);
        // Now hover away (pointerleave) and verify active indicator collapses cleanly back to 7.5px
        await page.mouse.move(10, 10);
        await page.waitForTimeout(140);
        const collapsedWidth = await page.evaluate(
          () => document.querySelector('.gv-timeline-active-indicator').getBoundingClientRect().width,
        );
        assert.ok(
          Math.abs(collapsedWidth - 7.5) <= 0.5,
          `Gemini ruler: pointerleave restores active indicator to 7.5px (${collapsedWidth}px)`,
        );
      }

      await context.close();
    }

    // 6. Reduced motion disables transitions while preserving active alignment
    const rmContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    });
    const rmPage = await rmContext.newPage();
    await rmPage.route('https://**/*', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: buildHtml(
          PLATFORMS[2].wrap(
            [PLATFORMS[2].turn('第一条', 'r1'), PLATFORMS[2].turn('第二条', 'r2')].join(''),
          ),
        ),
      }),
    );
    await rmPage.goto(PLATFORMS[2].url);
    await injectDist(rmPage, contentJs, tokensCss);
    await rmPage.waitForSelector('.gv-timeline-active-indicator.gv-active-visible');
    const rmDuration = await rmPage.evaluate(() =>
      getComputedStyle(document.querySelector('.gv-timeline-active-indicator')).transitionDuration,
    );
    assert.equal(rmDuration, '0s', 'prefers-reduced-motion disables indicator transition');
    await rmContext.close();
  } finally {
    await browser.close();
  }
});
