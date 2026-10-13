/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
// Voyager Lite: static adapters only; no plugin catalog or remote loading.
import chatgpt from './chatgpt/site.json';
import claude from './claude/site.json';
import type { SiteAdapter } from '../../types';
export const BUNDLED_SITE_ADAPTERS = [chatgpt, claude] as unknown as readonly SiteAdapter[];
export function requireBundledSiteAdapter(id: string): SiteAdapter {
 const adapter=BUNDLED_SITE_ADAPTERS.find(site=>site.id===id);
 if(!adapter) throw Error(`Missing adapter: ${id}`);
 return adapter;
}
