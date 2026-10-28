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
- `vendor/features/timeline/scrollMotion.ts`
- `vendor/features/timeline/timeline.css`
- `vendor/features/timeline/timelinePreview.css`
- `vendor/pages/popup/components/KeyboardShortcutSettings.tsx`
- `vendor/pages/popup/components/SettingToggleRow.tsx`
- `vendor/pages/popup/components/TimelineSettingsCard.tsx`
- `vendor/pages/popup/components/VisualEffectPicker.tsx`
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
