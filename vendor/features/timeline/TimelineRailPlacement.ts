/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
import type { TimelineStyle } from '@/core/types/common';

import type { ExtGlobal, TimelinePositionData } from './types';

interface TimelineRailPlacementOptions {
  storagePrefix?: string;
  getStyle: () => TimelineStyle;
  onWidthChange: () => void;
  onPositionRestore: () => void;
}

/** Owns rail placement; Lite fixes the visual container width at its default. */
export class TimelineRailPlacement {
  readonly barWidth = 4;
  savedPosition: TimelinePositionData | null = null;
  private bar: HTMLElement | null = null;
  private draggable = false;
  private barDragging = false;
  private barStartPos = { x: 0, y: 0 };
  private barStartOffset = { x: 0, y: 0 };
  private onBarPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onBarPointerUp: ((ev: PointerEvent) => void) | null = null;
  private readonly lifetime = new AbortController();

  constructor(private readonly options: TimelineRailPlacementOptions) {}

  // Lite keeps the default width, ignoring widths saved by older versions.
  restoreWidth(_value: unknown): boolean {
    return false;
  }

  // Fixed placement in Lite 1.0: ignore positions saved by older draggable versions.
  restorePosition(_position: TimelinePositionData | undefined): void {
    this.updateSavedPosition(null);
  }

  updateSavedPosition(_position: TimelinePositionData | null): void {
    this.savedPosition = null;
    if (this.bar) {
      this.bar.style.top = '';
      this.bar.style.left = '';
    }
    this.updateRulerDirection();
    this.options.onPositionRestore();
  }

  mount(bar: HTMLElement): void {
    this.bar = bar;
    const signal = this.lifetime.signal;
    const onBarPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest('.timeline-dot, .timeline-thumb')) return;
      if (!this.draggable) return;
      this.barDragging = true;
      this.barStartPos = { x: ev.clientX, y: ev.clientY };
      const rect = this.bar!.getBoundingClientRect();
      this.barStartOffset = { x: rect.left, y: rect.top };
      this.bar!.setPointerCapture(ev.pointerId);
      this.onBarPointerMove = (e: PointerEvent) => this.handleBarDrag(e);
      this.onBarPointerUp = () => this.endBarDrag();
      window.addEventListener('pointermove', this.onBarPointerMove, { signal });
      // Cancellation follows pointerup, including saving the final position.
      window.addEventListener('pointerup', this.onBarPointerUp, { signal });
      window.addEventListener('pointercancel', this.onBarPointerUp, { signal });
    };
    this.bar.addEventListener('pointerdown', onBarPointerDown, { signal });
    const onBarCursorMove = () => {
      if (this.barDragging) return;
      if (this.draggable) this.bar!.style.cursor = 'move';
      else this.bar!.style.cursor = '';
    };
    this.bar.addEventListener('pointermove', onBarCursorMove, { signal });
  }

  toggleDraggable(_enabled: boolean): void {
    this.draggable = false;
    if (!this.bar) return;
    if (!this.draggable) this.bar.style.cursor = '';
  }

  private handleBarDrag(e: PointerEvent): void {
    if (!this.barDragging) return;
    const dx = e.clientX - this.barStartPos.x;
    const dy = e.clientY - this.barStartPos.y;
    const left = this.barStartOffset.x + dx;
    this.bar!.style.left = `${left}px`;
    this.bar!.style.top = `${this.barStartOffset.y + dy}px`;
    this.updateRulerDirection(left);
  }

  private endBarDrag(): void {
    this.barDragging = false;
    this.savePosition();
    try {
      if (this.onBarPointerMove) window.removeEventListener('pointermove', this.onBarPointerMove);
      if (this.onBarPointerUp) {
        window.removeEventListener('pointerup', this.onBarPointerUp);
        window.removeEventListener('pointercancel', this.onBarPointerUp);
      }
    } catch {}
    this.onBarPointerMove = null;
    this.onBarPointerUp = null;
  }

  private savePosition(): void {
    if (!this.bar) return;
    const rect = this.bar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const position = {
      version: 2,
      topPercent: (rect.top / viewportHeight) * 100,
      leftPercent: (rect.left / viewportWidth) * 100,
    };
    this.savedPosition = position;
    const g = globalThis as ExtGlobal;
    if (g.chrome?.storage?.sync?.set) {
      g.chrome.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}Position`]: position,
      });
    } else if (g.browser?.storage?.sync?.set) {
      g.browser.storage.sync.set({
        [`${this.options.storagePrefix ?? 'geminiTimeline'}Position`]: position,
      });
    }
  }

  applyPosition(top: number, left: number): void {
    if (!this.bar) return;
    const barWidth = this.bar.offsetWidth || 24;
    const barHeight = this.bar.offsetHeight || 100;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;
    const clampedTop = Math.max(padding, Math.min(top, viewportHeight - barHeight - padding));
    const clampedLeft = Math.max(padding, Math.min(left, viewportWidth - barWidth - padding));
    this.bar.style.top = `${clampedTop}px`;
    this.bar.style.left = `${clampedLeft}px`;
    this.updateRulerDirection(clampedLeft);
  }

  /** Grow ruler ticks toward page content, including when dragging across the viewport. */
  updateRulerDirection(left?: number): void {
    if (!this.bar) return;
    const barLeft = left ?? this.bar.getBoundingClientRect().left;
    const center = barLeft + (this.bar.offsetWidth || 24) / 2;
    this.bar.classList.toggle('gv-timeline-ruler-inward-right', center < window.innerWidth / 2);
  }

  /** Resize uses the cached position, never storage IPC. Legacy pixel positions stay absolute. */
  reapplyPosition(): boolean {
    if (!this.bar) return false;
    const position = this.savedPosition;
    if (!position) return false;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (
      position.version === 2 &&
      position.topPercent !== undefined &&
      position.leftPercent !== undefined
    ) {
      const top = (position.topPercent / 100) * viewportHeight;
      const left = (position.leftPercent / 100) * viewportWidth;
      this.applyPosition(top, left);
      return true;
    } else if (position.top !== undefined && position.left !== undefined) {
      this.applyPosition(position.top, position.left);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.lifetime.abort();
    this.bar = null;
  }
}
