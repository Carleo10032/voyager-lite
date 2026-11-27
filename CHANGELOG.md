# Changelog

## 3.2.0 — 2026-11-27

- Add a short, GPU-composited sliding active indicator (`.gv-timeline-active-indicator`, `180ms cubic-bezier(0.22, 1, 0.36, 1)`) across all timeline styles (Dots, Ruler, Compact) and both rail sides (`left` / `right`) on all four platforms (ChatGPT, Claude, Gemini, Grok), while keeping hover/focus states in a distinct neutral tint so the target node does not light up in active accent color before the gliding indicator arrives.
- Smoothly reposition existing timeline dots/ticks (`180ms`) and gently fade/scale in newly appended nodes (`160ms`) when new turns arrive, while keeping initial render and style switching instant and honoring `prefers-reduced-motion: reduce`.
- Fix ChatGPT's thread mirror (`readTurns`) borrowing another turn's text/attachments when `layout.turnKeys` and `entries` temporarily mismatch or omit an entry: preserve the turn's anchor position with empty text/attachments until its own record arrives.
- Pause ChatGPT's MAIN-world thread mirror (`MutationObserver`, `ResizeObserver`, `scroll` listener, `1.5s` poll, and hidden anchor layer) whenever ChatGPT's timeline is disabled, and resume it cleanly when re-enabled.
- Remove legacy `gvSnowEffect` storage handling and share a single `resolveVisualEffect` helper reading `gvVisualEffect` consistently across the popup and Snow/Sakura/Rain effects.

## 3.1.3 — 2026-11-23

- Fix every newly sent Grok turn duplicating twice on the timeline when Grok commits an optimistic message by mutating its ancestor `div#response-<temp>` `id` in-place to `div#response-<server>` on the same connected DOM element: match in-place `hostTurnId` upgrades by live DOM element in `turnMerge.ts` (`matchKnownMarkers` / `rememberedMarkers`) while ensuring stale markers never remain attached to an element owned by a different `hostTurnId`, preserving the original marker ID across Grok and any other host performing in-place ID replacement.
- Fix Grok's left-side timeline rail floating above Grok's sidebar `...` context menus and Base-UI dropdown popovers: Grok wraps both `#grok-app-root` and its sibling Base-UI portal host inside an `isolation: isolate` container, so configure `mountAnchorSelector: '#grok-app-root'` for Grok and dynamically sync all timeline surfaces (rail, slider, preview panel/toggle/bridge, navigation veil, tooltip, and context menu) into the resolved mount anchor so they stay above Grok's chat area/headers while remaining strictly below Grok's dropdown menus, popovers, and modals.
- Fix Claude prompt editing leaving duplicate/extra timeline markers (especially when submitting edits via Enter, retrying a turn, or when the edited user bubble scrolls just above the viewport inside a long reply): configure `scrollContainerSelector: '[data-autoscroll-container="true"]'` for Claude, add `onClaudeEditKeydown` (Enter submission in `[data-testid="message-edit-box"]`) and `[data-testid="user-message-retry"]` handling, and extend contiguous mounted-window + visible-content disconnected-turn pruning to both Claude and Grok while preserving open inline editors (`[data-testid="message-edit-box"][data-message-uuid]` / `#response-*`) and virtualized turns between sparse windows (such as Claude's pinned tail turn).

## 3.1.2 — 2026-11-22

- Fix Gemini prompt editing leaving duplicate timeline markers and a dead trailing marker by truncating the edited branch on Gemini's `.update-button` click and pruning disconnected committed markers against Gemini's authoritative mounted DOM (and ChatGPT's active `threadMirror` anchor list) while preserving in-place edit/cancel state and `<pending-request>` adoption.
- Fix Grok prompt editing, stopped-response replacement, and history version switching (`< N / M >`) flickering the timeline rail, jumping left into the sidebar on short 1-turn branches, or leaving duplicate markers, and prevent left-side rails across all four platforms from flashing at the far-left sidebar edge when deleting a conversation or switching routes: ignore Grok's `?rid=` branch query parameter in route-change teardowns, configure native scroll containers for Grok (`[data-testid="chat-transcript-scroller"]`) and Gemini (`infinite-scroller[data-test-id="chat-history-container"]`), persist `lastKnownChatLeft` across route rebuilds while rejecting zero-height collapsing bounds, clear detached Gemini markers immediately when a conversation empties, truncate switched/edited branches on Grok save/Enter/`< N / M >` clicks, and prune disconnected visible/past-end Grok turns while preserving off-screen virtualized turns and open editors.

## 3.1.1 — 2026-11-22

- Lower timeline UI (`36`–`39`) and background visual effects (`35`) z-index layers from near-`INT_MAX` so image lightboxes, modals, popovers, and overlay drawers stay cleanly above the timeline and snow/sakura/rain effects across Gemini, ChatGPT, Claude, and Grok while keeping timeline controls above chat content, composers, and headers.

## 3.1.0 — 2026-11-21

- Add a timeline position setting (`左侧` / `右侧`, supporting Global + per-platform scopes with mixed-state detection) that mirrors the rail, Dots / Ruler / Compact ticks, hover preview cards, compact preview panel, and hover bridge with identical spacing (`15px` from the chat area edge, `12px` preview gap), automatically tracking collapsible left sidebars across all four platforms.
- Remove the redundant small loading spinner circle beside timeline markers/ticks (`.gv-navigation-loading`), leaving the main-area transition veil spinner as the single navigation loading indicator.
- Fix duplicate ghost timeline markers when sending new turns on Gemini (where `<pending-request>` initially renders without a turn ID and is then replaced by a committed `<div id="...">` container), allowing unidentified/pending turns across all platforms to adopt newly assigned native `hostTurnId`s seamlessly and dropping unmatched detached pending turns.
- Fix ChatGPT timeline jumps snapping back to the bottom of long/heavy conversations by disengaging ChatGPT's sticky-to-bottom scroll lock via a non-bubbling mouse `pointerdown`/`pointerup` handshake on `[data-app-action-timeline-scroll]` around `scrollTo`, flushing mirrored anchors immediately on virtualizer container resize, raising the veil safety cap to `4000ms`, and restoring the real active marker if a jump times out off-target.
- Refine scroll-driven active marker highlighting across all platforms to stay on the current turn until it leaves the readable viewport band (instead of switching prematurely halfway through a long reply), while keeping top/bottom edge alignment and automatic switching to newly sent turns.

## 3.0.1 — 2026-11-20

- Add a clickable platform selector in the popup header area allowing switching between Global (`全局`, applies to all four platforms with mixed-state indicators) and any individual platform (`ChatGPT`, `Claude`, `Gemini`, `Grok`) without switching tabs.
- Remove the redundant "时间线选项" heading from the timeline style card.
- Fix the active timeline marker not automatically advancing to the newest turn after a new conversation turn is sent and finishes outputting (when the host scrolls before marker debouncing or in short non-scrollable chats).
- Eliminate the style-switch color flash when switching into Dots style (suppress transitions during style toggle) and fix dark-mode active/hover dot specificity so only the active dot is highlighted immediately.

## 3.0.0 — 2026-11-20

- Restore full ChatGPT virtualized timeline support with a read-only MAIN-world thread mirror (`dist/chatgpt-thread-mirror.js`) supporting ChatGPT's November `rows` virtualizer, deep provider stacks, prompt-top anchor geometry, seamless anchor-to-bubble marker upgrades, active-page scroller scoping, and automatic DOM-only fallback when the mirror is unavailable.
- Unify navigation across all four platforms (ChatGPT, Claude, Gemini, Grok) with zero `siteId` branching in `TimelineNavigation` / `VirtualizedTimelineNavigation`, cross-platform `resolveLiveTarget`, and a 100% opaque theme-matched transition veil for distant (>1.5 viewports) or unmounted jumps that waits for target centering, visible image decoding, and layout/DOM quiet (`350ms`, `2200ms` safety cap) before fading out smoothly; nearby mounted jumps remain instant without a veil.
- Unify prompt text extraction across all platforms to select the first visible prompt container and strip visually-hidden (`cdk-visually-hidden`, `sr-only`), `aria-hidden`, hidden/display-none, and UI chrome descendants, fixing Gemini's hidden "你说" prefix and duplicated prompt summaries while preserving LaTeX source text.
- Redesign Dots style as containerless Antigravity-style circular dots that share Ruler's exact vertically centered compact layout (`18px` gap up to `360px` span, `4–10px` adaptive dot size), continuous hit targets, and instant left-side rich hover previews, with hover/active platform-accent color transitions.
- Remove the outer rail container across all timeline styles and drop the "Hide outer container" option from the popup.

## 2.2.15 — 2026-11-12

- Restore the timeline on the redesigned Grok web UI using its current message markers.
- Read Grok prompt text without the hidden author heading or message controls.
- Remove legacy Grok message selectors and attachment filename overrides; show the page’s own attachment text.

## 2.2.3 — 2026-11-01

- Place navigation loading feedback to the right of the shared rail, away from left-side previews, and clamp it inside the viewport.

## 2.2.2 — 2026-11-01

- Stop navigation once the target bubble is readable in the viewport instead of repeatedly recentering it.

## 2.2.1 — 2026-11-01

- Fix distant navigation from the middle of long replies when no user bubble is visible.
- Keep correcting the landing position while layout changes, and restore the visible selection when navigation fails or is cancelled.
- Show a small loading indicator beside the target only when positioning takes longer than 200 ms; fast arrivals do not flash.

## 2.2.0 — 2026-10-28

- Reposition the full-preview button when conversation turns first appear, fixing its missing position after initial load or refresh.
- Fix the node container width at the default 4px; remove drag resizing and ignore previously saved widths.

## 2.1.1 — 2026-10-28

- Prevent accidental text selection when repeatedly clicking popup controls; keep error messages selectable.

## 2.1.0 — 2026-10-28

- Size the popup to its visible settings and remove reserved scrollbar space on the right.

## 2.0.1 — 2026-10-28

- Use the existing active-state button colors for resting, hovered and opened full-preview states.

## 2.0.0 — 2026-10-28

- Use a light platform-colored background and platform accent icon for the full-preview button at rest.
- Publish the updated ruler interaction, compact alignment, node previews and spacing improvements developed in 1.2.0.
- Remove preview pinning; retain instant centered navigation.

## 1.2.0 — 2026-10-28

- Anchor the ruler hover wave to the hovered tick's center, matching its preview and accent.
- Keep lengths fixed while moving within a tick region; change the crest only when entering another region.
- Retain width-only transitions, pixel-aligned thickness, and instant navigation.
- Use 7.5px idle ruler and compact ticks. Limit ruler expansion to two neighbors on each side: 32 / 23.83 / 15.67 / 7.5px in equal steps, keeping a 12px preview gap.
- Keep every compact tick at 7.5px, including the active tick; measure its 12px preview gap from the painted tick edge.

- Keep the node full-preview button visible, use 12px spacing for individual previews and compact full previews, position the node full preview 10px from its button, and remove preview pinning including legacy saved behavior.

## 1.1.0 — 2026-10-28

- Align ruler tick positions and thickness to device pixels, matching the compact fix.
- Animate ruler width only, preserving tick thickness and corner geometry throughout hover.

## 1.0.21 — 2026-10-28

- Use the existing neutral gray for idle ruler ticks; keep accent colors for active and hovered ticks.
- Align compact ticks to device pixels so fractional spacing does not produce uneven apparent thickness.

## 1.0.20 — 2026-10-28

- Remove Flow controls and animated navigation; all targets jump directly to center, including users with old Flow settings.
- Retain identity-based reacquisition and automatic alignment for virtualized messages.
- Remove the legacy ChatGPT domain from site matching and extension permissions.

## 1.0.19 — 2026-10-28

- Limit Flow to rendered targets within six viewports; farther or unrendered targets jump.
- Make settings row text passive; only the switches change their values.
- Show switch focus rings only for keyboard focus, not mouse clicks.
- Reserve popup scrollbar space to keep the header and settings aligned when expanding the timeline.

## 1.0.18 — 2026-10-27

- Restore a wider adaptive Flow range of ten viewport heights for rendered targets.
- Targets outside the range or not rendered use Jump; preserve centered alignment and bounded layout-settling correction.

## 1.0.17 — 2026-10-27

- Treat hidden and zero-size connected targets as not yet rendered.
- Track the same message through navigation, waiting for both scroll offset and target position to settle before checking center alignment.
- Correct layout drift within the original click, preserve flow for rendered targets, and cancel on user wheel/touch input or a new navigation. Limit corrections and total wait time.

## 1.0.16 — 2026-10-27

- Remove the three-screen threshold: Flow animates all mounted targets regardless of distance.
- Automatically jump only when the target is unmounted; keep that navigation and its final correction instant.
- Remove distant mounted targets from the timed homing path to prevent mid-animation snaps.

## 1.0.15 — 2026-10-27

- Make Flow adaptive: animate only mounted targets within three viewport heights; otherwise jump directly and keep subsequent corrections instant.
- Keep explicit Jump always instant and retain centered alignment on every platform.

## 1.0.14 — 2026-10-27

- Center navigation across all platforms, using the same centre for initial virtualized estimates and mounted landings. Remove top-inset alignment.
- Keep flow navigation smooth through probes and corrections; wait for actual settling and cancel obsolete pending work.
- Prefer native message identities on Grok, Claude and Gemini, based on inspected DOM structures; preserve fallback when unavailable.

## 1.0.13 — 2026-10-27

- Remember message height and top inset for virtualized navigation; probe at the estimated message top instead of centering it.
- Skip correction when the loaded target is within 2px; otherwise correct instantly without a second smooth-scroll animation.

## 1.0.12 — 2026-10-27

- Identify ChatGPT turns by native DOM message IDs across virtualized remounts, preventing repeated short prompts from being merged into the wrong turn or duplicated.
- Preserve text-based fallback for other hosts and legacy ChatGPT markup.
- Add regression coverage for distinct identical prompts, sparse remounts and layout shifts.

## 1.0.11 — 2026-10-27

- Remove the global navigation shortcut service, configuration UI, shortcut types and keyboard-only navigation queue.
- Preserve pointer navigation, preview controls and ruler styling.

## 1.0.10 — 2026-10-27

- Show the current reading marker in the platform accent even when idle; keep its resting length unchanged.

## 1.0.9 — 2026-10-27

- Shorten ruler hover peak from 48px to 32px.
- Align mounted navigation targets at the viewport top with a 12px gap, honoring scroll padding and overlapping fixed/sticky headers.
- Use the same top alignment for initial long jumps and final virtualized landings.

## 1.0.8 — 2026-10-27

- Ruler rests at compact tick dimensions (12 × 3px), with 14px spacing and the platform soft color.
- Pointer proximity smoothly extends neighbouring ticks up to 48px; only the hovered tick uses the accent. Preview prefers the left.
- Keep navigation and the other two styles unchanged.

## 1.0.7 — 2026-10-27

- Restore the original upstream ruler CSS and reading-position wave, removing the custom 1.0.5/1.0.6 piano-key implementation.
- Restore upstream ruler coachmark text; retain Dots / Ruler / Compact order and existing Lite navigation.

## 1.0.6 — 2026-10-27

- Ruler ticks are now piano keys: all keys rest at one equal length, flush to the same edge.
- Hovering a key grows it to 32px and paints it in the platform accent, with a Gaussian taper on its neighbours.
- Tick weight is now 3px; the resting colour is quieter so the hovered key reads as the highlighted one.
- The collapsed/holding outline follows the key width instead of a fixed 25px capsule.
- Coachmark copy for the ruler style updated in zh/en.

## 1.0.5 — 2026-10-27

- Ruler ticks are equal-width at rest, with a graduated crest only around the hovered tick.
- Restore equal widths on pointer leave; scrolling no longer drives tick width.
- Remove ruler-track clipping; retain upstream tick geometry, tooltip, and 1.0.3 navigation.

## 1.0.4 — 2026-10-27

- Restore three timeline styles in the order Dots, Ruler, Compact.
- Ruler uses the upstream variable-width piano-key ticks and hover preview.
- Keep Compact as the previous narrow-tick style, with its correct label.
- Preserve the 1.0.3 navigation and platform adapters; exclude the abandoned 1.1.0 ChatGPT mirror.
