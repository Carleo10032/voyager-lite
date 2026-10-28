/** Native identities verified against each host's conversation DOM.
 * Never use arbitrary ancestor ids: those may identify a whole conversation or
 * a temporary React component rather than a message. */
export function hostTurnId(site: string, element: HTMLElement): string | undefined {
  const attr = (name: string): string | undefined =>
    element.closest(`[${name}]`)?.getAttribute(name) || undefined;
  if (site === 'chatgpt') {
    return attr('data-turn-key') || attr('data-message-id') || attr('data-chatgpt-search-message-ids');
  }
  if (site === 'claude') return attr('data-turn-key') || attr('data-message-id');
  if (site === 'grok') {
    const response = element.closest('[id^="response-"]')?.id;
    return response || attr('data-message-id') || attr('data-turn-key');
  }
  if (site === 'gemini') {
    const row = element.closest('user-query')?.parentElement;
    if (row?.parentElement?.matches('infinite-scroller[data-test-id="chat-history-container"]') && row.id) {
      return row.id;
    }
    return attr('data-message-id') || attr('data-turn-key');
  }
  return undefined;
}
