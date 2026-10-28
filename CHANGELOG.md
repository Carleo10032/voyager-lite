# Changelog

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
