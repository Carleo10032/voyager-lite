import { timelineSettingKey } from '../vendor/features/timeline/timelineSettings';
import type { TimelineSettingsValues } from '../vendor/pages/popup/components/TimelineSettingsCard';

export function enabledKey(siteId: string) { return `liteTimeline:${siteId}`; }
export function readSettings(raw: Record<string, unknown>, siteId: string): TimelineSettingsValues & { enabled: boolean } {
  const get = (field: Parameters<typeof timelineSettingKey>[1]) => raw[timelineSettingKey(siteId, field)];
  const style = get('Style') ?? raw.liteStyle;
  return {
    enabled: (raw[enabledKey(siteId)] ?? raw.liteTimeline) !== false,
    timelineStyle: style === 'compact' || style === 'ruler' ? style : 'dots',
    hideContainer: get('HideContainer') === true,
    draggableTimeline: false,
    timelinePreviewPinned: get('PreviewPinned') === true,
    markerLevelEnabled: false,
    preventAutoScrollEnabled: false,
    showMessageTimestamps: false,
  };
}
export function settingsPatch(siteId: string, patch: Partial<TimelineSettingsValues>): Record<string, unknown> {
  const fields = { timelineStyle:'Style', hideContainer:'HideContainer', timelinePreviewPinned:'PreviewPinned' } as const;
  const result: Record<string, unknown> = {};
  for (const [field, suffix] of Object.entries(fields)) {
    if (field in patch) result[timelineSettingKey(siteId, suffix)] = patch[field as keyof typeof fields];
  }
  return result;
}
