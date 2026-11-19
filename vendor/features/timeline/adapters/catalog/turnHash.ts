import {
  USER_LATEX_ORIGINAL_ATTRIBUTE,
  hasUserLatexRendering,
  textWithLatexSource,
} from '@/core/utils/userLatexSource';

const USER_TEXT_CONTAINER_SELECTOR = '[data-bubble-text], .query-text';
const EXCLUDED_TEXT_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'BUTTON',
  'TEXTAREA',
  'INPUT',
  'SVG',
  'MODEL-THOUGHTS',
]);
const BLOCK_TEXT_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'BLOCKQUOTE',
  'BR',
  'DIV',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'LI',
  'P',
  'PRE',
  'SECTION',
  'TR',
]);

function isExcludedTextNode(node: Element): boolean {
  if (EXCLUDED_TEXT_TAGS.has(node.tagName)) return true;
  if (node.getAttribute('role') === 'button') return true;
  if (node.hasAttribute?.('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
  const classList = node.classList ? Array.from(node.classList) : [];
  if (
    classList.some((name) => {
      const lower = name.toLowerCase();
      return (
        lower.includes('visually-hidden') ||
        name === 'sr-only' ||
        name === 'screen-reader-only' ||
        name === 'thoughts-container' ||
        name === 'thoughts-content' ||
        name.startsWith('gv-')
      );
    })
  ) {
    return true;
  }
  const inline = (node as HTMLElement).style;
  if (inline?.display === 'none' || inline?.visibility === 'hidden') return true;
  if (node.isConnected && typeof getComputedStyle === 'function') {
    try {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
    } catch {
      /* ignore mock or detached nodes */
    }
  }
  return false;
}

function pickVisibleTextRoot(element: Element): Element {
  if (typeof element.querySelectorAll !== 'function') {
    return element.matches('[data-testid="user-message"]')
      ? element.querySelector('[data-bubble-text]') ?? element
      : element;
  }
  const candidates = Array.from(element.querySelectorAll(USER_TEXT_CONTAINER_SELECTOR));
  const visible = candidates.find((candidate) => {
    for (let cur: Element | null = candidate; cur && cur !== element; cur = cur.parentElement) {
      if (isExcludedTextNode(cur)) return false;
    }
    return !isExcludedTextNode(candidate);
  });
  return visible ?? element;
}

function cleanTextWithLatexSource(node: Node, isRoot = true): string {
  if (node.nodeType === 3) return node.nodeValue ?? '';
  if (!(node instanceof Element)) return node.textContent ?? '';
  if (!isRoot && isExcludedTextNode(node)) return '';
  const original = node.getAttribute(USER_LATEX_ORIGINAL_ATTRIBUTE);
  if (original !== null && hasUserLatexRendering(node)) return original;
  if (!node.childNodes || node.childNodes.length === 0) {
    return node.tagName === 'BR' ? ' ' : textWithLatexSource(node);
  }
  const pad = !isRoot && BLOCK_TEXT_TAGS.has(node.tagName) ? ' ' : '';
  let text = pad;
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 8 || child.nodeType === 7) continue;
    text += cleanTextWithLatexSource(child, false);
  }
  return text + pad;
}

/** The mounted turn's normalized DOM text is its shared summary and hash input. */
export function turnSummary(element: Element): string {
  // Rendered user LaTeX reads as its source, so rendering never changes a turn's id or star.
  // Strip host screen-reader labels (e.g. Gemini "你说", Grok "你") and hidden duplicate copies.
  const content = pickVisibleTextRoot(element);
  return cleanTextWithLatexSource(content, true).replace(/\s+/g, ' ').trim();
}

/** Keep attachment-only user turns visible without changing assistant summaries. */
export function userTurnSummary(element: Element): string {
  if (element.getAttribute('data-gv-thread-anchor') !== null) {
    const text = (element.getAttribute('data-gv-text') ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
    const rawAttachments = element.getAttribute('data-gv-attachments');
    if (rawAttachments) {
      try {
        const parsed: unknown = JSON.parse(rawAttachments);
        if (Array.isArray(parsed)) {
          const name = parsed.find((v): v is string => typeof v === 'string' && v.trim().length > 0);
          if (name) return name.trim();
        }
      } catch {
        /* malformed attachment list falls back to placeholder */
      }
    }
    return '【附件】';
  }
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
