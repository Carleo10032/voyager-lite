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
