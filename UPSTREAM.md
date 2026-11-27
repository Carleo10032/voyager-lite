# Upstream provenance

Voyager Lite is an independent, unofficial derivative of [Voyager](https://github.com/voyager-crew/voyager), version 1.9.0.

- Upstream revision: `e854e349ef8de867e6dc587033e46425320a165f`
- Modification date: 2026-10-13
- License: GNU GPL version 3; the upstream copyright notices and full license are preserved in `LICENSE`.
- `vendor/` contains extracted upstream source and compatibility modules. Paths generally correspond to upstream `src/`; translations originate in upstream locale resources.
- `public/icon-32.png` and `public/icon-128.png` retain the upstream icons. `public/tokens.css` extracts upstream style tokens.

Changes include standalone extension entry points and build tooling, a reduced popup, four platform adapters, platform colors, per-platform settings, keyboard navigation, scroll-mode handling, node styling, rail endpoints and focus fixes. Timeline dragging and unrelated features are excluded from the exposed interface. New integration code lives in `src/`.

## Modified upstream files

- `vendor/core/utils/version.ts`
- `vendor/features/plugins/catalog/sites/index.ts`
- `vendor/features/timeline/TimelineDotLayer.ts`
- `vendor/features/timeline/TimelineNavigation.ts`
- `vendor/features/timeline/TimelineRailPlacement.ts`
- `vendor/features/timeline/VirtualizedTimelineNavigation.ts`
- `vendor/features/timeline/runRouteTimeline.ts`
- `vendor/features/timeline/scrollMotion.ts`
- `vendor/features/timeline/timeline.css`
- `vendor/features/timeline/timelinePreview.css`
- `vendor/pages/popup/components/KeyboardShortcutSettings.tsx`
- `vendor/pages/popup/components/SettingToggleRow.tsx`
- `vendor/pages/popup/components/TimelineSettingsCard.tsx`
- `vendor/pages/popup/components/VisualEffectPicker.tsx`
- `vendor/pages/content/visualEffects/rain.ts`
- `vendor/pages/content/visualEffects/sakura.ts`
- `vendor/pages/content/visualEffects/snow.ts`
- `vendor/utils/translations.ts`

## Additional extracted or replacement modules


Local follow-up, 2026-10-13: preserve timeline node focus during keyboard navigation, remove focus glow, and add focused-node arrow navigation in `vendor/core/services/KeyboardShortcutService.ts`.

Follow-up: explicitly focus clicked nodes in `TimelineMarkerInteractions.ts`; support all four arrow keys outside editable fields without requiring node focus.

Arrow layout update: defaults and one-time migration to Up/Down and double Left/Right; consume pending sequence strokes to prevent native horizontal scrolling.

1.0.4 (2026-10-27): restore the already-vendored Ruler rendering alongside Dots and Compact. Update the style selector order/labels and stop converting ruler to compact in src/settings.ts. Navigation remains unchanged from 1.0.3.

The Chinese compact-style label in vendor/locales/zh/messages.json is shortened to “紧凑”. The build now reads the package version and clears generated output before bundling.

1.0.5 (2026-10-27): checked the original Voyager ruler CSS at e854e349ef8de867e6dc587033e46425320a165f and current TimelineDotLayer at edf659e8b18eeaa4113f0a89cffdb4ac1074b891. Reuse its 24px × 2px ticks, inward alignment, tooltip, and Gaussian falloff. Lite changes the trigger from reading position to pointer hover, uses 24px resting / 40px peak widths, resets on leave, and removes ruler-track clipping. Navigation is unchanged.

1.0.6 (2026-10-27): the ruler style becomes a piano keyboard. `denseMarkerLayout.ts` replaces `rulerWaveTick` with `rulerKeyTick`, which returns width, opacity and accent tint per key; the resting key is 12px and the crest is 32px. `TimelineDotLayer.ts` writes `--gv-timeline-key-width/-opacity/-tint`, and `timeline.css` morphs the 3px tick through those variables, including its collapsed outline. Tooltip, dense marker offsets and the 1.0.3 navigation are unchanged.

1.0.7 (2026-10-27): revert the 1.0.5/1.0.6 ruler customizations. Ruler CSS, wave computation and denseMarkerLayout are verified against original upstream revision e854e349ef8de867e6dc587033e46425320a165f. Retain existing Lite rail sizing and navigation integration.

1.0.8: ruler uses compact tick geometry with wider spacing and continuous pointer-distance Gaussian falloff (interaction reference: hjj345/dsh-sm-context-piano). Independently integrated into Lite; navigation unchanged.

1.0.9: shorten ruler hover crest to 32px; replace mounted message center alignment with top alignment, including ordinary navigation and virtualized long-jump landings.

1.0.10: ruler active marker retains the platform accent at rest without changing width.

1.0.11: remove keyboard shortcut service, popup settings and associated navigation queue. Native control keyboard behavior and preview dismissal remain.

1.0.12: CatalogTimelineAdapter reads ChatGPT native DOM turn/message identity; turnMerge prioritizes that identity over content hashes. No internal React state or network conversation API is used.

1.0.13: virtualized navigation remembers height/top inset, probes for top alignment, skips negligible correction and uses instantaneous final correction.

1.0.14: unify all navigation destinations at viewport centre; smooth-mode probes and corrections wait for settling. Add hostTurnId resolver for observed Grok response-* containers, Claude data-turn-key and Gemini chat-history row IDs.

1.0.15: share adaptive motion policy across ordinary and virtualized navigation. Flow animates only mounted targets within three screens. Remove the now-unneeded smooth-probe settling loop.

1.0.16: adaptive motion depends on target mounting status only, not distance. Mounted targets flow directly without delayed homing; unmounted targets use instant discovery and correction.

1.0.17: add rendered-box checks and bounded post-scroll verification. Flow corrections wait for stable geometry and remain smooth; unavailable targets are reacquired by existing marker identity.

1.0.18: use a shared ten-viewport Flow limit, preserving rendered-target validation and post-scroll alignment verification.

1.0.19 (2026-10-28): reduce Flow limit to six viewports; make SettingToggleRow text passive with aria-labelledby, use keyboard-only switch focus rings, and reserve the popup scroll gutter.

1.0.20 (2026-10-28): remove Flow mode controls and scrolling animation, force instant centered navigation regardless of legacy settings, and remove chat.openai.com matching and permissions. Keep virtualized target reacquisition and alignment correction.

1.0.21 (2026-10-28): use the compact neutral gray and opacity for idle ruler ticks, retain active/hover accents, and align compact tick positions and thickness to device pixels.

1.1.0 (2026-10-28): share device-pixel thickness and position alignment between ruler and compact; animate ruler width instead of horizontal transforms so thickness and corner geometry remain fixed.

1.2.0 (2026-10-28): snap the ruler hover crest to the hovered tick region rather than tracking every pointer coordinate; preserve the neighboring falloff and width-only transitions.

1.2.0 styling follow-up: 10px idle ruler/compact ticks, 36px ruler crest, and a narrower 0.9-gap Gaussian falloff; preserve thickness and preview placement.

1.2.0 reference proportion follow-up: ruler widths use the supplied screenshot ratio 52:40:28:20:12 scaled to a 32px peak, with a 12px preview gap measured from the painted tick instead of the invisible hit box. Compact idle width remains 10px.

1.2.0 final sizing: ruler and compact idle widths are 7.5px; ruler expansion reaches only two neighbors on each side, retaining 32px peak and 12px preview gap.

1.2.0 compact preview follow-up: remove active-tick widening and anchor the preview 12px from the visible compact tick edge, including mirrored left-side rails.

1.2.0 equal-step follow-up: ruler widths now use an arithmetic progression from 7.5px to 32px (step 49/6px), retaining two expanded neighbors on each side, fixed thickness and 12px preview spacing.

1.2.0 preview follow-up: keep node full-preview entry visible and clickable; measure individual and full-preview spacing from painted markers at 12px; remove preview-pinning UI, settings reads, and panel behavior.

1.2.0 node list placement: anchor the node full-preview panel 10px from the list button edge; retain other preview spacing.

2.0.0 (2026-10-28): full-preview button uses the existing light platform background and platform accent icon in its resting state; publish the accumulated timeline and preview refinements.

2.0.1 (2026-10-28): unify full-preview button states using the existing active-state background and platform accent icon.

2.1.0 (2026-10-28): adapt popup height to visible settings and remove the reserved scrollbar gutter.

2.1.1 (2026-10-28): prevent native text selection in popup controls while preserving selectable error messages.

2.2.0 (2026-10-28): reposition the full-preview toggle after the empty rail becomes visible; remove container width resizing and ignore legacy widths in favor of the 4px default.

2.2.1 (2026-11-01): fix virtualized navigation from long reply gaps, keep alignment corrections until settled or timed out, restore selection on cancellation/failure, and add delayed navigation feedback.

2.2.2 (2026-11-01): stop correcting once the target is readable in the viewport.

2.2.3 (2026-11-01): place delayed loading feedback to the right of the shared rail, clear of left-side previews.

3.0.0 (2026-11-20): adapt the read-only MAIN-world thread mirror from `TanChuping/chatgpt-voyager` v1.9.4, revision `e02c0311` (GPL-3.0), `src/pages/pageWorld/threadMirror.ts`, into `src/chatgptThreadMirror.ts` (`dist/chatgpt-thread-mirror.js`, injected via manifest `world: "MAIN"` on `https://chatgpt.com/*`). Supports ChatGPT's November `rows` virtualizer and deep provider stacks (`MAX_ROOT_CLIMB = 512`, `MAX_CLIMB = 64`), mirrors prompt-top anchors (`<= 48px`) in an `opacity: 0` layer with value-based layout signatures and `ResizeObserver` tracking, upgrades anchors seamlessly to real mounted bubbles by `hostTurnId`, and falls back automatically to DOM-only scanning when the mirror is unavailable. Express ChatGPT active-page scoping and thread-mirror support declaratively via `CatalogTimelineConfig` (`activePageSelector`, `threadMirror`) and generalize `resolveLiveTarget` to all four platforms. Unify `TimelineNavigation.ts` and `VirtualizedTimelineNavigation.ts` with zero `siteId` branching around a single 100% opaque theme-matched transition veil (`.gv-navigation-veil`) for distant (>1.5 viewports) or unmounted jumps, waiting until target centering, visible image decoding, and layout/DOM quiet (`350ms`, `2200ms` safety cap) before fading out over `150ms` (nearby mounted jumps stay instant without a veil). Unify `turnSummary` in `turnHash.ts` to pick the first visible `[data-bubble-text], .query-text` container and exclude visually-hidden, `aria-hidden`, hidden/display-none, and UI chrome descendants while preserving LaTeX source text (fixing Gemini's hidden "你说" prefix and duplicated prompts). Redesign Dots style in `TimelineView.ts`, `TimelineDotLayer.ts`, `TimelineTooltip.ts`, and `timeline.css` as containerless Antigravity-style circular dots matching Ruler's vertically centered compact layout (`18px` gap, `360px` max span, `4–10px` adaptive diameter), continuous hit targets, and instant left-side rich hover previews; hide `.gemini-timeline-bar::before` across all styles and remove `hideOuterContainer` from the popup.

3.0.1 (2026-11-20): replace the static popup platform label in `src/popup.tsx` with a dropdown scope selector (`全局` + ChatGPT / Claude / Gemini / Grok) backed by global/per-site helpers in `src/settings.ts`, and remove the `timelineOptions` card heading from `vendor/pages/popup/components/TimelineSettingsCard.tsx`. Fix `VirtualizedTimelineNavigation.refreshActive` and `TimelineEngine.recalculateAndRenderMarkers` so newly appended visible turns and scroll/layout updates automatically advance the active dot/tick without staying stuck on the previous turn. Suppress dot `::after` transitions during style switching (`gv-timeline-switching` in `TimelineView.ts`) and move Dots idle colors to `--lite-dot-idle-color` in `timeline.css` so dark-mode `.active` / `:hover` specificity works and switching to Dots never flashes non-active dots.

3.1.0 (2026-11-21): fix duplicate ghost timeline markers when an optimistic/pending turn without `hostTurnId` (specifically Gemini's `<pending-request>` before being replaced by `<div id="...">`, and any in-place `undefined -> hostTurnId` upgrade on ChatGPT/Claude/Grok) transitions to a committed native `hostTurnId` (`turnMerge.ts`, `hostTurnId.ts`, `CatalogTimelineAdapter.ts`). Remove the redundant marker-side `.gv-navigation-loading` spinner from `TimelineView.ts`, `TimelineEngine.ts`, `TimelineNavigation.ts`, `VirtualizedTimelineNavigation.ts`, `CatalogTimelineAdapter.ts`, and `timeline.css`. Add a per-platform and global `timelineSide` (`left` / `right`) option in `timelineSettings.ts`, `src/settings.ts`, `src/popup.tsx`, `src/content.ts`, and `TimelineSettingsCard.tsx`, mirroring rail placement (`chatLeft + 15px` tracking collapsible left sidebars), Ruler/Compact tick orientation and hit clipping, `TimelineTooltip` anchor/placement (`12px` gap opening into chat content), and `TimelinePreviewPanel` position/animation/hover bridge. Fix ChatGPT long-conversation jumps snapping back to the bottom by releasing ChatGPT's sticky-to-bottom lock via a non-bubbling mouse `pointerdown`/`pointerup` handshake on `[data-app-action-timeline-scroll]` around `scrollTo` (`scrollMotion.ts`), flushing `syncThreadMirror` synchronously inside `containerResizeObserver` (`src/chatgptThreadMirror.ts`), raising `VEIL_MAX_MS` to `4000ms`, and passing actual `landed` state to `finishPendingNavigation` (`VirtualizedTimelineNavigation.ts`). Replace nearest-bubble active turn tracking in `VirtualizedTimelineNavigation.ts` with turn-span visibility hysteresis (`[topInset, viewportHeight - bottomInset]`) plus top/bottom edge snapping and preserved `appendedLatest` activation.

3.1.1 (2026-11-22): lower z-index stacking layers for timeline surfaces (`timeline.css`, `timelinePreview.css`: veil `36`, preview panel/hover bridge `37`, rail/toggle/slider `38`, tooltip/context menu `39`) and background visual effects (`rain.ts`, `sakura.ts`, `snow.ts`: `35`) from `2147483640`–`2147483647` to stay strictly below host image lightboxes, modals, popovers, and overlay sidebars across Gemini (`.cdk-overlay-container: 1000`), Claude (`--cds-z-modal: 40`), ChatGPT (`aside: 40`, modals/poppers `>= 50`), and Grok (`#portal: 9999`, modals `>= 50`), while remaining above chat scrollers, composers, and headers.

3.1.2 (2026-11-22): fix Gemini prompt editing leaving duplicate/dead trailing timeline markers and Grok prompt editing, stopped-response replacement, and `< N / M >` version switching flickering the rail, jumping left into the sidebar on short branches or conversation deletion, or leaving duplicate markers: add `onGeminiEditClick` (`.update-button`), `onGrokEditClick` (`[data-testid="user-message-editor-save"]` and `[role="group"]` `N / M` version buttons), and `onGrokEditKeydown` (Enter inside `[data-testid="user-message-editor"]`) branch truncation in `CatalogTimelineAdapter.ts`; configure `scrollContainerSelector` for Gemini (`infinite-scroller[data-test-id="chat-history-container"]`) and Grok (`[data-testid="chat-transcript-scroller"]`) in `src/sites.ts`, and persist module-level `lastKnownChatLeft` with `width > 0 && height > 0` validation plus connected `observedBoundsEl` fallback in `TimelineView.ts` so left-side rails stay in place across route rebuilds, branch switches, and conversation deletions; add optional `routeKey` to `runRouteTimeline.ts` and ignore Grok's `?rid=` branch parameter in `src/content.ts` so branch switches update in-place without tearing down the rail; add optional `pruneDisconnected` / `shouldPruneDisconnected` filtering in `turnMerge.ts` (`rememberedMarkers`) enabled for Gemini's non-virtualized DOM (including empty-DOM conversation deletion), ChatGPT's authoritative `threadMirror` anchor snapshots, and Grok `?rid=` changes or disconnected turns inside the visible viewport / past `scrollHeight` (excluding turns whose `div#response-*` editor container remains connected), while preserving off-screen virtualized turns, detached `<pending-request>` adoption, and edit/cancel retention by `hostTurnId`.

3.1.3 (2026-11-23): fix duplicate timeline markers on Grok when sending messages (and protect all platforms against in-place native ID replacement): in `vendor/features/timeline/adapters/catalog/turnMerge.ts`, update `matchKnownMarkers` to upgrade a known marker's `hostTurnId` in-place when the exact same live DOM element keeps its prompt hash and its previous `hostTurnId` is no longer mounted elsewhere, and update `rememberedMarkers` to keep connected same-element markers only when their `hostTurnId` is compatible or undergoing an in-place upgrade to an unseen `hostTurnId` (preventing two markers from ever sharing one live DOM element). Also fix Grok timeline surfaces painting over Grok's Base-UI dropdown/context menus (which portal into a sibling container inside Grok's `isolation: isolate` wrapper after `#grok-app-root`): add `mountAnchorSelector` to `CatalogTimelineConfig`, configure `#grok-app-root` for Grok in `src/sites.ts`, resolve it dynamically in `CatalogTimelineAdapter.ts`, and sync all mounted timeline elements into the active mount anchor across `TimelineView.ts`, `TimelinePreviewPanel.ts`, `TimelineTooltip.ts`, `TimelineMarkerInteractions.ts`, and `TimelineEngine.ts`. Also fix Claude prompt editing leaving extra/duplicate markers: configure `scrollContainerSelector: '[data-autoscroll-container="true"]'` for Claude in `src/sites.ts`, add `onClaudeEditKeydown` (Enter in `[data-testid="message-edit-box"]`), `aria-disabled` guards, and `[data-testid="user-message-retry"]` truncation in `CatalogTimelineAdapter.ts`, and generalize `shouldPruneDisconnected` to both Claude and Grok using gap-bounded (`<= 80px`) contiguous mounted turn/reply windows + visible content checks while keeping open edit boxes and off-screen virtualized turns intact.

3.2.0 (2026-11-27): add a sliding active highlight indicator (`.gv-timeline-active-indicator`) in `vendor/features/timeline/TimelineDotLayer.ts` and `vendor/features/timeline/timeline.css` across Dots, Ruler (combining vertical `translate3d` and horizontal `scaleX(--gv-active-ruler-scale)` in one GPU-composited `180ms` transform during glides while using `82ms` `.gv-ruler-wave-sync` for in-place hover waves on both left/right rails), and Compact styles. Keep hover/focus states on non-active markers in a neutral tint (`--lite-dot-hover-color` in Dots, `opacity: 1` neutral tick in Ruler) and remove `.timeline-dot.active::after` accent painting so the target marker only lights up in platform accent color when the gliding indicator arrives (`180ms cubic-bezier(0.22, 1, 0.36, 1)`). Preserve the indicator's previous offset across the `computeActiveByScroll -> render` cycle when a new turn is appended, smoothly shift existing markers (`180ms` `top` transition), and subtly fade/scale in newly added markers (`160ms`), while suppressing transitions on initial render, style switches (`.gv-timeline-switching`), and `prefers-reduced-motion: reduce`. Also harden `src/chatgptThreadMirror.ts` (`readTurns`) to require explicit key ownership (`entryMatchesKey`) before populating text/attachments, wire ChatGPT mirror pause/resume (`gv-thread-mirror-control` / `gv-thread-mirror-ready`) from `src/content.ts` so disabling ChatGPT's timeline stops observers/polling and removes the hidden anchor layer, and remove legacy `gvSnowEffect` fallback/writes while sharing `vendor/pages/content/visualEffects/resolveEffect.ts` (`gvVisualEffect` only) across `src/popup.tsx` and `snow.ts` / `rain.ts` / `sakura.ts`.
