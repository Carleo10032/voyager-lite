/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */

import { scrollElementToAnchor } from './scrollMotion';

import { VirtualizedTimelineNavigation } from './VirtualizedTimelineNavigation';

export interface TimelineNavigationMarker {
  id: string;
  element: HTMLElement;
  hash?: string;
  center?: number;
  measuredAt?: number;
}

type Direction = 'previous' | 'next';
type TimelineSpringProfile = 'ios' | 'snappy' | 'gentle';

interface TimelineNavigationOptions {
  virtualized?: boolean;
  getMarkers(): readonly TimelineNavigationMarker[];
  getMarkerTops(): readonly number[];
  getMarkerPositions(): readonly number[];
  getTrackHeight(): number;
  /** Refresh an interaction target, or check for new turns at a navigation boundary. */
  refreshMarkers(target: HTMLElement | null, direction?: Direction): boolean;
  resolveStoredId(storedId: string): string | null;
  onActiveChange(id: string | null): void;
  onScroll(): void;
  animateRunner(fromIndex: number, toIndex: number, duration: number): void;
}

export function getTimelineSpringProfile(): TimelineSpringProfile {
  try {
    const value = localStorage.getItem('geminiTimelineSpring');
    if (value === 'snappy' || value === 'gentle') return value;
  } catch {}
  return 'ios';
}

/** Owns navigation for one conversation, including its viewport and pending work. */
export class TimelineNavigation {
  activeTurnId: string | null = null;
  mode: 'jump' = 'jump';
  private scrollContainer: HTMLElement | null = null;
  private viewportScrollTarget: EventTarget | null = null;
  private destroyed = false;
  private isScrolling = false;
  private scrollAnimationGeneration = 0;
  private animationRaf: number | null = null;
  private scrollRaf: number | null = null;
  private lastActiveChangeTime = 0;
  private pendingActiveId: string | null = null;
  private activeChangeTimer: number | null = null;
  private navigationCommitTimer: number | null = null;
  private navigationActiveLockUntil = 0;
  private starredNavigationTimer: number | null = null;
  private readonly onViewportScroll = () => this.scheduleScrollSync();

  private readonly virtualized: VirtualizedTimelineNavigation | null;

  constructor(private readonly options: TimelineNavigationOptions) {
    this.virtualized = options.virtualized
      ? new VirtualizedTimelineNavigation(
          () => this.scrollContainer,
          () => this.options.getMarkers(),
          (id) => this.setActive(id),
        )
      : null;
  }

  get viewport(): HTMLElement | null {
    return this.scrollContainer;
  }

  setViewport(viewport: HTMLElement | null): void {
    if (this.destroyed || viewport === this.scrollContainer) return;
    this.viewportScrollTarget?.removeEventListener('scroll', this.onViewportScroll);
    this.cancelScrollAnimation();
    this.scrollContainer = viewport;
    this.viewportScrollTarget =
      this.virtualized && (viewport === document.documentElement || viewport === document.body)
        ? window
        : viewport;
    this.viewportScrollTarget?.addEventListener('scroll', this.onViewportScroll, { passive: true });
    if (viewport) this.virtualized?.prepare(viewport);
  }

  getActiveIndex(): number {
    if (!this.activeTurnId) return -1;
    return this.options.getMarkers().findIndex((marker) => marker.id === this.activeTurnId);
  }

  scheduleScrollSync(): void {
    if (this.destroyed || this.scrollRaf !== null) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = null;
      if (this.destroyed) return;
      this.options.onScroll();
      this.computeActiveByScroll();
    });
  }

  computeActiveByScroll(): void {
    const viewport = this.scrollContainer;
    const markers = this.options.getMarkers();
    if (this.destroyed || this.isScrolling || !viewport || markers.length === 0) return;
    if (this.virtualized) {
      this.virtualized.measure();
      this.virtualized.refreshActive();
      return;
    }
    if (Date.now() < this.navigationActiveLockUntil) return;
    const scrollTop = viewport.scrollTop;
    const reference = scrollTop + viewport.clientHeight * 0.5;
    const tops = this.options.getMarkerTops();
    let activeId = markers[0].id;
    if (tops.length === markers.length) {
      let low = 0;
      let high = tops.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (tops[middle] <= reference) low = middle + 1;
        else high = middle;
      }
      activeId = markers[Math.max(0, low - 1)].id;
    } else {
      const viewportRect = viewport.getBoundingClientRect();
      for (const marker of markers) {
        const top = marker.element.getBoundingClientRect().top - viewportRect.top + scrollTop;
        if (top > reference) break;
        activeId = marker.id;
      }
    }
    if (this.activeTurnId === activeId) return;
    const now = performance.now();
    const elapsed = now - this.lastActiveChangeTime;
    if (elapsed < 120) {
      this.pendingActiveId = activeId;
      if (this.activeChangeTimer === null) {
        this.activeChangeTimer = window.setTimeout(() => {
          this.activeChangeTimer = null;
          if (this.pendingActiveId && this.pendingActiveId !== this.activeTurnId) {
            this.setActive(this.pendingActiveId);
            this.lastActiveChangeTime = performance.now();
          }
          this.pendingActiveId = null;
        }, 120 - elapsed);
      }
    } else {
      this.setActive(activeId);
      this.lastActiveChangeTime = now;
    }
  }

  jumpTo(target: HTMLElement): void {
    const viewport = this.scrollContainer;
    if (this.destroyed || !viewport) return;
    const scrollTarget = viewport === document.documentElement || viewport === document.body
      ? window : viewport;
    scrollElementToAnchor(scrollTarget, target, 0, 0, 'instant');
  }

  navigateToMarker(turnId: string, index = -1, source: 'dot' | 'preview' = 'dot'): void {
    if (this.destroyed) return;
    if (this.virtualized) {
      this.options.refreshMarkers(null);
      this.virtualized.navigateTo(turnId);
      return;
    }
    const resolveTarget = () => {
      const markers = this.options.getMarkers();
      const idIndex = markers.findIndex((marker) => marker.id === turnId);
      const targetIndex =
        source === 'preview' ? (idIndex >= 0 ? idIndex : index) : markers[index] ? index : idIndex;
      return { marker: markers[targetIndex], targetIndex };
    };
    let target = resolveTarget();
    if (this.options.refreshMarkers(target.marker?.element ?? null)) target = resolveTarget();
    if (!target.marker) return;
    this.jumpTo(target.marker.element);
    this.commitActiveMarkerAfterNavigation(target.marker.id, 0);
  }

  handleStarredMessageNavigation(): void {
    if (this.destroyed) return;
    if (this.virtualized) {
      this.virtualized.handleHash();
      return;
    }
    this.clearStarredNavigationTimer();
    const url = window.location.href;
    const hash = window.location.hash;
    if (!hash.startsWith('#gv-turn-')) return;
    const turnId = hash.slice('#gv-turn-'.length);
    if (!turnId) return;
    const isCurrent = () => !this.destroyed && window.location.href === url;
    const clearHash = () => {
      if (isCurrent())
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    const schedule = (callback: () => void, delay: number) => {
      this.starredNavigationTimer = window.setTimeout(() => {
        this.starredNavigationTimer = null;
        if (isCurrent()) callback();
      }, delay);
    };
    const checkAndScroll = () => {
      const id = this.options.resolveStoredId(turnId);
      const marker = this.options.getMarkers().find((item) => item.id === id);
      if (!marker) return false;
      schedule(() => {
        this.jumpTo(marker.element);
        schedule(clearHash, 900);
      }, 100);
      return true;
    };
    let attempts = 0;
    const retry = () => {
      if (checkAndScroll()) return;
      if (++attempts >= 20) {
        clearHash();
        return;
      }
      schedule(retry, Math.min(attempts * 100, 300));
    };
    if (!checkAndScroll()) schedule(retry, 200);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.setViewport(null);
    this.virtualized?.destroy();
    this.destroyed = true;
    this.clearActiveChange();
    this.clearPendingNavigationCommit();
    this.clearStarredNavigationTimer();
    if (this.scrollRaf !== null) cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = null;
    this.activeTurnId = null;
  }

  private setActive(id: string | null): void {
    this.activeTurnId = id;
    this.options.onActiveChange(id);
  }

  private cancelScrollAnimation(): void {
    this.scrollAnimationGeneration++;
    if (this.animationRaf !== null) cancelAnimationFrame(this.animationRaf);
    this.animationRaf = null;
    this.isScrolling = false;
  }

  private clearActiveChange(): void {
    if (this.activeChangeTimer !== null) window.clearTimeout(this.activeChangeTimer);
    this.activeChangeTimer = null;
    this.pendingActiveId = null;
  }

  private clearPendingNavigationCommit(): void {
    if (this.navigationCommitTimer !== null) window.clearTimeout(this.navigationCommitTimer);
    this.navigationCommitTimer = null;
  }

  private clearStarredNavigationTimer(): void {
    if (this.starredNavigationTimer !== null) window.clearTimeout(this.starredNavigationTimer);
    this.starredNavigationTimer = null;
  }

  private commitActiveMarkerAfterNavigation(targetId: string, duration: number): void {
    this.clearPendingNavigationCommit();
    this.navigationCommitTimer = window.setTimeout(
      () => {
        this.navigationCommitTimer = null;
        if (!this.options.getMarkers().some((marker) => marker.id === targetId)) return;
        this.clearActiveChange();
        this.navigationActiveLockUntil = Date.now() + 900;
        this.setActive(targetId);
        this.scheduleScrollSync();
      },
      this.mode === 'jump' ? 0 : Math.max(0, duration),
    );
  }

}
