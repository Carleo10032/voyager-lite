import { textWithLatexSource } from '@/core/utils/userLatexSource';

/** The mounted turn's normalized DOM text is its shared summary and hash input. */
export function turnSummary(element: Element): string {
  // Rendered user LaTeX reads as its source, so rendering never changes a turn's id or star.
  // Grok's redesigned bubble also contains a hidden author heading and action toolbar.
  const content = element.matches('[data-testid="user-message"]')
    ? element.querySelector('[data-bubble-text]') ?? element
    : element;
  return textWithLatexSource(content).replace(/\s+/g, ' ').trim();
}

/** Keep attachment-only user turns visible without changing assistant summaries. */
export function userTurnSummary(element: Element): string {
  if (element.matches('[data-cds="UserMessage"]')) {
    return element.querySelector('[data-cds="MessageAttachmentsFile"] [title]')?.getAttribute('title')?.trim() || '【附件】';
  }
  if (element.matches('[data-chatgpt-search-message-ids]')) {
    const file = element.querySelector('[class*="resource-card"] [title]');
    const name = file?.getAttribute('title')?.trim();
    if (name) return name;
  }
  return turnSummary(element) || '【附件】';
}

/** Preserve the host text as the hash while displaying an attachment's full filename. */
export function userTurnDisplayOverride(site: string, element: Element): string | undefined {
  if (site === 'gemini' && element.matches('user-query')) {
    return element.querySelector('[data-test-id="uploaded-file"] button[aria-label]')?.getAttribute('aria-label')?.trim() || undefined;
  }
  return undefined;
}

/** Translate only the generated label, never user text or the hash input. */
export function displayTurnSummary(
  marker: { summary: string; attachmentPlaceholder?: boolean; displaySummary?: string },
  attachmentLabel: string,
): string {
  return marker.attachmentPlaceholder ? attachmentLabel : marker.displaySummary ?? marker.summary;
}

/**
 * Content hash shared by every historical turn-id format:
 * legacy `c-<mountIndex>-<hash>`, current `c-<hash>` and `c-<hash>~<n>`.
 */
export function extractTurnHash(turnId: string): string {
  const base = turnId.split('~')[0];
  const segments = base.split('-');
  return segments[segments.length - 1] || base;
}
