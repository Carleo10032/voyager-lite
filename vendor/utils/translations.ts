/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
// Voyager Lite: retain Chinese and English strings; other UI locales fall back to English.
import enMessages from '@locales/en/messages.json';
import zhMessages from '@locales/zh/messages.json';
import type { AppLanguage } from './language';
export type TranslationKey = keyof typeof enMessages;
export type Translation = Record<TranslationKey,string>;
const extract=(raw:Record<string,{message:string}>)=>Object.fromEntries(Object.entries(raw).map(([key,value])=>[key,value.message])) as Translation;
const en=extract(enMessages),zh=extract(zhMessages);
export const TRANSLATIONS:Record<AppLanguage,Translation>={en,zh,zh_TW:zh,ja:en,fr:en,es:en,pt:en,ar:en,ru:en,ko:en};
export function isTranslationKey(value:string):value is TranslationKey{return Object.hasOwn(en,value);}
