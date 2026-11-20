import { timelineSettingKey } from '../vendor/features/timeline/timelineSettings';
import type { TimelineSettingsValues } from '../vendor/pages/popup/components/TimelineSettingsCard';

export const GLOBAL_SCOPE = 'global';
export type SettingsScope = typeof GLOBAL_SCOPE | string;
export interface ResolvedSettings extends TimelineSettingsValues {
  enabled: boolean;
  enabledMixed?: boolean;
  styleMixed?: boolean;
}

export function enabledKey(siteId: string) { return `liteTimeline:${siteId}`; }
export function readSettings(raw: Record<string, unknown>, siteId: string): ResolvedSettings {
  const get = (field: Parameters<typeof timelineSettingKey>[1]) => raw[timelineSettingKey(siteId, field)];
  const style = get('Style') ?? raw.liteStyle;
  return {
    enabled: (raw[enabledKey(siteId)] ?? raw.liteTimeline) !== false,
    timelineStyle: style === 'compact' || style === 'ruler' ? style : 'dots',
    hideContainer: true,
    draggableTimeline: false,
    markerLevelEnabled: false,
    preventAutoScrollEnabled: false,
    showMessageTimestamps: false,
  };
}
export function readGlobalSettings(raw: Record<string, unknown>, siteIds: readonly string[]): ResolvedSettings {
  const perSite = siteIds.map((id) => readSettings(raw, id));
  const allEnabled = perSite.length > 0 ? perSite.every((item) => item.enabled) : raw.liteTimeline !== false;
  const anyEnabled = perSite.some((item) => item.enabled);
  const firstStyle = perSite[0]?.timelineStyle ?? (raw.liteStyle === 'compact' || raw.liteStyle === 'ruler' ? raw.liteStyle : 'dots');
  const styleMixed = perSite.some((item) => item.timelineStyle !== firstStyle);
  return {
    enabled: allEnabled,
    enabledMixed: anyEnabled && !allEnabled,
    timelineStyle: firstStyle,
    styleMixed,
    hideContainer: true,
    draggableTimeline: false,
    markerLevelEnabled: false,
    preventAutoScrollEnabled: false,
    showMessageTimestamps: false,
  };
}
export function enabledPatch(scope: SettingsScope, enabled: boolean, siteIds: readonly string[] = []): Record<string, unknown> {
  if (scope !== GLOBAL_SCOPE) return { [enabledKey(scope)]: enabled };
  const result: Record<string, unknown> = { liteTimeline: enabled };
  for (const id of siteIds) result[enabledKey(id)] = enabled;
  return result;
}
export function settingsPatch(scope: SettingsScope, patch: Partial<TimelineSettingsValues>, siteIds: readonly string[] = []): Record<string, unknown> {
  const fields = { timelineStyle:'Style' } as const;
  const result: Record<string, unknown> = {};
  for (const [field, suffix] of Object.entries(fields)) {
    if (!(field in patch)) continue;
    const value = patch[field as keyof typeof fields];
    if (scope === GLOBAL_SCOPE) {
      result.liteStyle = value;
      for (const id of siteIds) result[timelineSettingKey(id, suffix)] = value;
    } else {
      result[timelineSettingKey(scope, suffix)] = value;
    }
  }
  return result;
}
