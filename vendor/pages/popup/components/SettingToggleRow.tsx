/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
import React from 'react';

import type { TranslationKey } from '@/utils/translations';

import { Switch } from '../../../components/ui/switch';
import { ExperimentalBadge } from './ExperimentalBadge';

export interface SettingToggleRowProps {
  /** Input id; passive text supplies its accessible name. */
  id: string;
  /** Settings-search id handed to `isVisible`. */
  settingId: string;
  label: TranslationKey;
  hint?: TranslationKey;
  /** Wider text/switch gap and overflow clamp, as the floating-mode row has always had. */
  gapped?: boolean;
  experimental?: boolean;
  /** Extra content under the hint, such as a permission call-to-action. */
  extra?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  isVisible: (settingId: string) => boolean;
  /** Leave the DOM instead of carrying `hidden`, for sections that always did. */
  unmountWhenHidden?: boolean;
  t: (key: TranslationKey) => string;
}

/** One labelled switch row of a popup settings card, hidden by site capability or search. */
export function SettingToggleRow({
  id,
  settingId,
  label,
  hint,
  gapped,
  experimental,
  extra,
  checked,
  disabled,
  onChange,
  isVisible,
  unmountWhenHidden,
  t,
}: SettingToggleRowProps) {
  const visible = isVisible(settingId);
  if (!visible && unmountWhenHidden) return null;
  const labelNode = (
    <span
      id={`${id}-label`}
      className={`text-sm font-medium transition-colors${
        disabled
          ? ' text-muted-foreground'
          : ''
      }${experimental ? ' flex items-center gap-1' : ''}`}
    >
      {t(label)}
      {experimental && <ExperimentalBadge title={t('experimentalLabel')} />}
    </span>
  );
  return (
    <div
      hidden={!visible}
      className={`group flex items-center justify-between${gapped ? ' gap-3' : ''}`}
    >
      {hint ? (
        <div className={gapped ? 'min-w-0 flex-1' : 'flex-1'}>
          {labelNode}
          {extra}
        </div>
      ) : (
        labelNode
      )}
      <Switch
        id={id}
        aria-labelledby={`${id}-label`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
