/* Shared visual-effect storage resolver for Voyager Lite popup and page scripts. */

export type VisualEffectValue = 'off' | 'snow' | 'sakura' | 'rain';

export const VISUAL_EFFECT_STORAGE_KEY = 'gvVisualEffect';

export function resolveVisualEffect(raw: Readonly<Record<string, unknown>>): VisualEffectValue {
  const value = raw[VISUAL_EFFECT_STORAGE_KEY];
  return value === 'snow' || value === 'sakura' || value === 'rain' ? value : 'off';
}
