/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
/** Shared centered geometry for instant timeline navigation. */

/** A connected placeholder or a hidden cached thread is not a rendered target. */
export function isRenderedTarget(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) return false;
  if (typeof element.checkVisibility === 'function' &&
      !element.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) return false;
  const style = getComputedStyle(element);
  return style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.display !== 'none';
}

type ScrollTarget = HTMLElement | Window | null;

/**
 * A `flex-direction: column-reverse` scroller anchors its scroll origin at the
 * END of the content: `scrollTop` runs from 0 (newest) down to `-range` (the
 * conversation's start). Every offset the navigator compares grows from the
 * start, so such a container is translated on the way in and back on the way
 * out; otherwise `Math.max(0, …)` sends every jump to the newest turn.
 * (ChatGPT's thread was reported to scroll this way; a normal scroller is
 * unaffected.)
 *
 * Only the scroller's own layout decides it. A negative `scrollTop` is not
 * evidence: Safari reports one on an ordinary scroller during rubber-band
 * overscroll. A reversed flex box INSIDE an ordinary scroller does not move
 * the scroll origin either, so the content's direction is irrelevant.
 */
const reverseByStyle = new WeakMap<HTMLElement, boolean>();

function isReverseScroller(container: HTMLElement): boolean {
  // Read once per container: this runs on every scroll event.
  let reverse = reverseByStyle.get(container);
  if (reverse === undefined) {
    try {
      const style = getComputedStyle(container);
      reverse = style.flexDirection === 'column-reverse' && /flex/.test(style.display);
    } catch {
      reverse = false;
    }
    reverseByStyle.set(container, reverse);
  }
  return reverse;
}

function scrollRange(container: HTMLElement): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** The target's scroll offset measured from the start of the conversation. */
export function readScrollOffset(target: ScrollTarget): number {
  if (!target || target === window) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  const container = target as HTMLElement;
  return isReverseScroller(container)
    ? container.scrollTop + scrollRange(container)
    : container.scrollTop;
}

/**
 * ChatGPT's transcript scroller keeps a sticky-to-bottom lock and an anchor
 * bookmark that ignore programmatic `scrollTo` calls and yank the viewport back
 * to the bottom whenever virtualized turns resize. A non-bubbling mouse
 * `pointerdown` on the scroller itself matches its scrollbar-drag disengage
 * path without disturbing page or extension listeners, and `pointerup` cleans
 * up after the async `scroll` event consumes it.
 */
function dispatchScrollLockRelease(container: HTMLElement): (() => void) | null {
  if (
    typeof PointerEvent !== 'function' ||
    typeof container.dispatchEvent !== 'function' ||
    typeof container.hasAttribute !== 'function' ||
    !container.hasAttribute('data-app-action-timeline-scroll')
  ) {
    return null;
  }
  try {
    container.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse', bubbles: false }));
  } catch {
    return null;
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    container.removeEventListener?.('scroll', finish);
    try {
      container.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'mouse', bubbles: false }));
    } catch {
      /* ignore detached or mocked containers */
    }
  };
  return finish;
}

function applyScroll(target: ScrollTarget, top: number, behavior: ScrollBehavior): void {
  if (!target || target === window) {
    window.scrollTo({ top: Math.max(0, top), behavior });
    return;
  }
  const container = target as HTMLElement;
  const range = scrollRange(container);
  const clamped = isReverseScroller(container)
    ? Math.min(0, Math.max(-range, top - range))
    : Math.min(range, Math.max(0, top));
  const previous = container.scrollTop;
  const finishRelease =
    Math.abs(clamped - previous) >= 0.5 ? dispatchScrollLockRelease(container) : null;
  if (container.scrollTo) container.scrollTo({ top: clamped, behavior });
  else container.scrollTop = clamped;
  if (finishRelease) {
    if (container.scrollTop === previous) {
      finishRelease();
    } else {
      container.addEventListener?.('scroll', finishRelease, { once: true, passive: true });
      if (typeof setTimeout === 'function') setTimeout(finishRelease, 50);
    }
  }
}

/** First estimate and mounted landing share the same viewport centre. */
export function scrollToEstimatedCenter(
  target: ScrollTarget, center: number, viewportHeight: number, behavior: ScrollBehavior = 'instant',
): void {
  applyScroll(target, center - viewportHeight / 2, behavior);
}

export function elementCenterDestination(target: HTMLElement | Window, element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const viewportTop = target === window ? 0 : (target as HTMLElement).getBoundingClientRect().top;
  const height = target === window ? window.innerHeight : (target as HTMLElement).clientHeight;
  return Math.max(0, readScrollOffset(target) + rect.top - viewportTop + rect.height / 2 - height / 2);
}

export function scrollElementToAnchor(
  target: HTMLElement | Window,
  element: HTMLElement,
  _scrollTop: number,
  _viewportHeight: number,
  behavior: ScrollBehavior = 'instant',
): void {
  applyScroll(target, elementCenterDestination(target, element), behavior);
}
