import type { CatalogTimelineConfig } from '../vendor/features/timeline/adapters/catalog/config';
export const sites = [
  { siteId:'chatgpt', brandColor:'#4165e8', darkBrandColor:'#8faaff', siteLabel:'ChatGPT', hosts:['chatgpt.com'], turnSelector:'[data-user-message-bubble], [data-message-author-role="user"]:not(:has([data-user-message-bubble]))', assistantTurnSelector:'[data-message-author-role="assistant"], [data-chatgpt-selection-message-id]:not([data-message-author-role="assistant"] *)', conversationIdPattern:'^(?:/u/[^/]+)?(?:/g/[^/]+)?/c/([^/?#]+)' },
  { siteId:'claude', brandColor:'#d97757', darkBrandColor:'#e89b7c', siteLabel:'Claude', hosts:['claude.ai'], turnSelector:'[data-testid="user-message"]', assistantTurnSelector:'.font-claude-message, [data-testid="assistant-message"]', conversationIdPattern:'^/chat/([^/?#]+)' },
  { siteId:'gemini', brandColor:'#4285f4', darkBrandColor:'#8ab4f8', siteLabel:'Gemini', hosts:['gemini.google.com'], turnSelector:'user-query .user-query-bubble-with-background, user-query:not(:has(.user-query-bubble-with-background)), [data-message-author-role="user"]', assistantTurnSelector:'model-response', conversationIdPattern:'^(?:/u/[^/]+)?/app/([^/?#]+)' },
  { siteId:'grok', brandColor:'#27272a', darkBrandColor:'#e4e4e7', siteLabel:'Grok', hosts:['grok.com'], turnSelector:'[data-message-author-role="user"], [data-role="user"], .items-end .message-bubble', assistantTurnSelector:'[data-message-author-role="assistant"], [data-role="assistant"], .items-start .message-bubble', conversationIdPattern:'^/(?:c|chat)/([^/?#]+)' },
];
export function siteForHost(host: string) { return sites.find(site => site.hosts.includes(host)); }
export function configFor(site: typeof sites[number]): CatalogTimelineConfig {
  return {...site, position:'right', pluginId:`lite.${site.siteId}`, coachmarkId:'lite-timeline'};
}
