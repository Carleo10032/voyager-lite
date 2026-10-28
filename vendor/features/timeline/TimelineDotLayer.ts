/* Modified for Voyager Lite on 2026-10-13. See UPSTREAM.md for provenance and changes. */
import type { TimelineStyle } from '@/core/types/common';

import type { TimelineHierarchyGeometry } from './TimelineHierarchyGeometry';
import { getTimelineSpringProfile } from './TimelineNavigation';
import { denseMarkerOffsets } from './denseMarkerLayout';
import type { DotElement, TimelineMarker } from './types';

/** Owns measured marker positions, keyed dot rendering and the runner lifetime. */
export class TimelineDotLayer {
  private runnerRing: HTMLElement | null = null;

  private runnerAnimationGeneration = 0;

  contentHeight = 0;

  yPositions: number[] = [];

  markerTops: number[] = [];

  private visibleRange: { start: number; end: number } = { start: 0, end: -1 };

  private usePixelTop = false;

  private _cssVarTopSupported: boolean | null = null;
  private readonly dots = new Map<string, DotElement>();
  private normalizedPositions: number[] = [];
  private destroyed = false;
  private runnerRaf: number | null = null;
  private bar: HTMLElement | null = null;
  private track: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private rulerPointerY: number | null = null;
  constructor(
    private readonly getMarkers: () => TimelineMarker[],
    private readonly geometry: TimelineHierarchyGeometry,
    private readonly options: {
      getStyle: () => TimelineStyle;
      getViewport: () => HTMLElement | null;
      getActiveId: () => string | null;
    },
  ) {}
  measureMarkerTops(elements: HTMLElement[]): void {
    this.markerTops = this.computeElementTopsInScrollContainer(elements);
  }

  private computeElementTopsInScrollContainer(elements: HTMLElement[]): number[] {
    if (!this.scrollContainer || elements.length === 0) return [];

    const containerRect = this.scrollContainer.getBoundingClientRect();
    const scrollTop = this.scrollContainer.scrollTop;

    const first = elements[0];
    const firstOffsetParent = first.offsetParent;
    const firstOffsetTop = first.offsetTop;
    const firstTop = first.getBoundingClientRect().top - containerRect.top + scrollTop;

    const sameOffsetParent =
      firstOffsetParent !== null && elements.every((el) => el.offsetParent === firstOffsetParent);

    const tops = elements.map((el) => {
      if (sameOffsetParent) {
        return firstTop + (el.offsetTop - firstOffsetTop);
      }
      return el.getBoundingClientRect().top - containerRect.top + scrollTop;
    });

    for (let i = 1; i < tops.length; i++) {
      if (tops[i] < tops[i - 1]) return [];
    }

    return tops;
  }

  mount(bar: HTMLElement, track: HTMLElement, content: HTMLElement): void {
    this.bar = bar;
    this.track = track;
    this.content = content;
    bar.addEventListener('pointermove', this.onRulerPointerMove);
    bar.addEventListener('pointerleave', this.onRulerPointerLeave);
  }
  get padding(): number {
    return this.getTrackPadding();
  }
  updateActive(): void {
    for (const [id, dot] of this.dots) {
      dot.classList.toggle('active', id === this.activeTurnId);
      dot.setAttribute('aria-current', String(id === this.activeTurnId));
    }
  }
  destroy(): void {
    this.destroyed = true;
    if (this.runnerRaf !== null) cancelAnimationFrame(this.runnerRaf);
    this.bar?.removeEventListener('pointermove', this.onRulerPointerMove);
    this.bar?.removeEventListener('pointerleave', this.onRulerPointerLeave);
    this.rulerPointerY = null;
    this.dots.clear();
    this.bar = null;
    this.track = null;
    this.content = null;
  }

  private get markers() {
    return this.getMarkers();
  }
  private get scrollContainer() {
    return this.options.getViewport();
  }
  private get activeTurnId() {
    return this.options.getActiveId();
  }
  private getActiveIndex() {
    return this.markers.findIndex((marker) => marker.id === this.activeTurnId);
  }

  private getCSSVarNumber(el: Element, name: string, fallback: number): number {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private getTrackPadding(): number {
    return this.bar ? this.getCSSVarNumber(this.bar, '--timeline-track-padding', 12) : 12;
  }

  private getMinGap(): number {
    return this.bar ? this.getCSSVarNumber(this.bar, '--timeline-min-gap', 12) : 12;
  }

  private detectCssVarTopSupport(pad: number, usableC: number): boolean {
    try {
      const test = document.createElement('button');
      test.className = 'timeline-dot';
      test.style.visibility = 'hidden';
      test.setAttribute('aria-hidden', 'true');
      test.style.setProperty('--n', '0.5');
      this.content!.appendChild(test);
      const cs = getComputedStyle(test);
      const px = parseFloat(cs.top || '');
      test.remove();
      const expected = pad + 0.5 * usableC;
      return Number.isFinite(px) && Math.abs(px - expected) <= 2;
    } catch {
      return false;
    }
  }

  layout(): void {
    if (!this.bar || !this.content) return;
    const H = this.bar.clientHeight || 0;
    const pad = this.getTrackPadding();
    const minGap = this.getMinGap();
    const N = this.markers.length;
    // Get hidden markers for collapse feature
    const hiddenIndices = this.geometry.getHiddenMarkerIndices();
    const visibleCount = N - hiddenIndices.size;
    const desired = Math.max(
      H,
      visibleCount > 0 ? 2 * pad + Math.max(0, visibleCount - 1) * minGap : H,
    );
    this.contentHeight = Math.ceil(desired);
    this.content.style.height = `${this.contentHeight}px`;

    const usableC = Math.max(1, this.contentHeight - 2 * pad);
    // Calculate Y positions with collapse - using effective baseN for repositioning
    const { desiredY } = this.geometry.calculateCollapsedPositions(hiddenIndices, pad, usableC);

    // Apply min gap only to visible markers
    const gapMultipliers: number[] = new Array(N).fill(1.0);
    const adjusted = this.applyMinGapWithHidden(
      desiredY,
      pad,
      pad + usableC,
      minGap,
      hiddenIndices,
      gapMultipliers,
    );
    this.yPositions = adjusted;

    for (let i = 0; i < N; i++) {
      if (hiddenIndices.has(i)) {
        this.normalizedPositions[i] = -1;
        continue;
      }
      const top = adjusted[i];
      const n = (top - pad) / usableC;
      this.normalizedPositions[i] = Math.max(0, Math.min(1, n));
      const dot = this.dots.get(this.markers[i].id);
      if (dot && !this.usePixelTop) {
        dot.style.setProperty('--n', String(this.normalizedPositions[i]));
      }
    }
    if (this._cssVarTopSupported === null) {
      this._cssVarTopSupported = this.detectCssVarTopSupport(pad, usableC);
      this.usePixelTop = !this._cssVarTopSupported;
    }
  }

  /* Apply minimum gap between visible markers, skipping hidden ones */
  private applyMinGapWithHidden(
    positions: number[],
    minTop: number,
    maxTop: number,
    gap: number,
    hiddenIndices: Set<number>,
    gapMultipliers: number[],
  ): number[] {
    const n = positions.length;
    if (n === 0) return positions;

    const out = positions.slice();
    let prevVisibleIdx = -1;
    for (let i = 0; i < n; i++) {
      if (hiddenIndices.has(i)) continue;

      if (prevVisibleIdx === -1) {
        out[i] = Math.max(minTop, Math.min(positions[i], maxTop));
      } else {
        const currentGap = gap * gapMultipliers[i];
        const minAllowed = out[prevVisibleIdx] + currentGap;
        out[i] = Math.max(positions[i], minAllowed);
      }
      prevVisibleIdx = i;
    }
    let lastVisibleIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (!hiddenIndices.has(i)) {
        lastVisibleIdx = i;
        break;
      }
    }

    if (lastVisibleIdx >= 0 && out[lastVisibleIdx] > maxTop) {
      out[lastVisibleIdx] = maxTop;

      let nextVisibleIdx = lastVisibleIdx;
      for (let i = lastVisibleIdx - 1; i >= 0; i--) {
        if (hiddenIndices.has(i)) continue;

        const currentGap = gap * gapMultipliers[nextVisibleIdx];
        const maxAllowed = out[nextVisibleIdx] - currentGap;
        out[i] = Math.min(out[i], maxAllowed);
        nextVisibleIdx = i;
      }
    }

    // Clamp all visible markers
    for (let i = 0; i < n; i++) {
      if (hiddenIndices.has(i)) continue;
      if (out[i] < minTop) out[i] = minTop;
      if (out[i] > maxTop) out[i] = maxTop;
    }

    return out;
  }

  private ensureRunnerRing(): void {
    if (!this.content) return;
    if (!this.runnerRing) {
      const ring = document.createElement('div');
      ring.className = 'timeline-runner-ring';
      Object.assign(ring.style, {
        position: 'absolute',
        left: '50%',
        top: '0',
        width: '20px',
        height: '20px',
        transform: 'translate3d(-50%, -10px, 0)',
        borderRadius: '9999px',
        boxShadow: '0 0 0 2px var(--timeline-dot-active-color), 0 0 12px rgba(59,130,246,.45)',
        background: 'transparent',
        pointerEvents: 'none',
        zIndex: '4',
        opacity: '0',
        transition: 'opacity 120ms ease',
        willChange: 'transform, opacity',
      } as CSSStyleDeclaration);
      this.content.appendChild(ring);
      this.runnerRing = ring;
    }
  }

  startRunner(fromIdx: number, toIdx: number, duration: number): void {
    this.ensureRunnerRing();
    if (!this.runnerRing) return;
    if (this.runnerRaf !== null) cancelAnimationFrame(this.runnerRaf);
    const animationGeneration = ++this.runnerAnimationGeneration;
    const y1 = Math.round(this.yPositions[fromIdx]);
    const y2 = Math.round(this.yPositions[toIdx]);
    const spring = getTimelineSpringProfile();
    const t0 =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    this.runnerRing.style.opacity = '1';
    const animate = () => {
      if (this.destroyed || animationGeneration !== this.runnerAnimationGeneration) {
        return;
      }
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const t = Math.min(1, (now - t0) / Math.max(1, duration));
      let eased: number;
      if (spring === 'snappy') eased = Math.min(1, t + 0.08 * Math.sin(t * 8));
      else if (spring === 'gentle') eased = t * t * (3 - 2 * t);
      else eased = t * t * (3 - 2 * t) * 0.85 + t * 0.15;
      const y = Math.round(y1 + (y2 - y1) * eased);
      if (this.runnerRing) {
        this.runnerRing.style.transform = `translate3d(-50%, ${y - 10}px, 0)`;
      }
      if (t < 1) {
        this.runnerRaf = requestAnimationFrame(animate);
      } else {
        if (this.runnerRing) {
          this.runnerRing.style.opacity = '0';
        }
      }
    };
    animate();
  }

  private lowerBound(arr: number[], x: number): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private upperBound(arr: number[], x: number): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  private readonly onRulerPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || this.options.getStyle() !== 'ruler') return;
    this.rulerPointerY = event.clientY;
    this.updateRulerWave();
  };

  private readonly onRulerPointerLeave = (): void => {
    this.rulerPointerY = null;
    this.updateRulerWave();
  };

  /** Continuous pointer-distance falloff; resting geometry never follows scrolling. */
  private updateRulerWave(): void {
    const ruler = this.options.getStyle() === 'ruler';
    if (!ruler) this.rulerPointerY = null;
    const dots = [...this.dots.values()].filter(dot => dot.isConnected);
    const gap = parseFloat(this.bar?.style.getPropertyValue('--lite-ruler-gap') || '14');
    const sigma = Math.max(1, gap) * 1.35;
    for (const dot of dots) {
      if (!ruler) {
        dot.style.removeProperty('--gv-timeline-ruler-scale');
        continue;
      }
      const rect = dot.getBoundingClientRect();
      const distance = this.rulerPointerY === null ? Infinity
        : this.rulerPointerY - (rect.top + rect.height / 2);
      const crest = Math.exp(-(distance * distance) / (2 * sigma * sigma));
      dot.style.setProperty('--gv-timeline-ruler-scale', (1 + (5 / 3) * crest).toFixed(4));
    }
  }

  private buildCompactMarkerOffsets(hiddenIndices: ReadonlySet<number>): Map<number, number> {
    const visibleIndices: number[] = [];
    for (let index = 0; index < this.markers.length; index++) {
      if (!hiddenIndices.has(index)) visibleIndices.push(index);
    }

    const ruler = this.options.getStyle() === 'ruler';
    const count = visibleIndices.length;
    const span = Math.min(280, Math.max(14, (this.track?.clientHeight ?? 340) - 40));
    const gap = count > 1 ? Math.min(14, span / (count - 1)) : 14;
    this.bar?.style.setProperty('--lite-ruler-gap', `${gap}px`);
    const rankOffsets = ruler
      ? visibleIndices.map((_, rank) => (rank - (count - 1) / 2) * gap)
      : denseMarkerOffsets(count);
    // Dense spacing can land each 3px tick on a different subpixel phase.
    // Snap its painted top and thickness to device pixels, keeping the hit area intact.
    const dpr = window.devicePixelRatio || 1;
    const tickHeight = Math.round(3 * dpr) / dpr;
    this.bar?.style.setProperty('--lite-tick-height', `${tickHeight}px`);
    const bounds = this.content?.getBoundingClientRect();
    const middle = bounds ? bounds.top + bounds.height / 2 : 0;
    return new Map(visibleIndices.map((markerIndex, rank) => {
      const offset = rankOffsets[rank];
      const aligned = Math.round((middle + offset - tickHeight / 2) * dpr) / dpr - middle + tickHeight / 2;
      return [markerIndex, aligned];
    }));
  }

  private applyDotPosition(dot: DotElement, index: number, compactOffset?: number): void {
    if (this.options.getStyle() === 'compact' || this.options.getStyle() === 'ruler') {
      const offset = compactOffset ?? 0;
      const operator = offset < 0 ? '-' : '+';
      dot.style.top = `calc(50% ${operator} ${Math.abs(offset)}px)`;
      dot.style.setProperty('--timeline-compact-offset', `${offset}px`);
      return;
    }

    dot.style.removeProperty('--timeline-compact-offset');
    dot.style.setProperty('--n', String(this.normalizedPositions[index] || 0));
    if (this.usePixelTop) {
      dot.style.top = `${Math.round(this.yPositions[index])}px`;
    } else {
      dot.style.removeProperty('top');
    }
  }
  render(): void {
    if (!this.bar || !this.track || !this.content) return;
    const hidden = this.geometry.getHiddenMarkerIndices();
    const style = this.options.getStyle();
    const dense = style !== 'dots';
    const top = this.track.scrollTop;
    const height = this.track.clientHeight;
    const positions = this.yPositions.filter((_, index) => !hidden.has(index));
    const first = Math.max(0, Math.min(height, (positions[0] ?? height / 2) - top));
    const last = Math.max(first, Math.min(height, (positions.at(-1) ?? height / 2) - top));
    this.bar.style.setProperty('--lite-rail-top', `${first}px`);
    this.bar.style.setProperty('--lite-rail-height', `${last - first}px`);
    const buffer = Math.max(100, height);
    const start = dense ? 0 : this.lowerBound(this.yPositions, top - buffer);
    const end = dense
      ? this.markers.length - 1
      : Math.max(start - 1, this.upperBound(this.yPositions, top + height + buffer));
    const offsets = dense ? this.buildCompactMarkerOffsets(hidden) : new Map<number, number>();
    const visibleIds = new Set<string>();
    const orderedDots: DotElement[] = [];
    for (let index = start; index <= end; index++) {
      const marker = this.markers[index];
      if (!marker || hidden.has(index)) continue;
      visibleIds.add(marker.id);
      let dot = this.dots.get(marker.id);
      if (!dot) {
        dot = document.createElement('button') as DotElement;
        dot.className = 'timeline-dot';
        dot.dataset.targetTurnId = marker.id;
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-describedby', 'gemini-timeline-tooltip');
        this.dots.set(marker.id, dot);
      }
      dot.dataset.markerIndex = String(index);
      dot.setAttribute('aria-label', marker.summary);
      this.applyDotPosition(dot, index, offsets.get(index));
      const collapsed = this.geometry.isMarkerCollapsed(marker.id);
      dot.classList.toggle('active', marker.id === this.activeTurnId);
      dot.setAttribute('aria-current', String(marker.id === this.activeTurnId));
      dot.classList.toggle('starred', marker.starred);
      dot.classList.toggle('collapsed', collapsed);
      dot.setAttribute('aria-pressed', String(marker.starred));
      dot.setAttribute('aria-expanded', String(!collapsed));
      dot.dataset.level = String(this.geometry.getMarkerLevel(marker.id));
      orderedDots.push(dot);
    }
    for (const [id, dot] of this.dots) {
      if (visibleIds.has(id)) continue;
      dot.remove();
      this.dots.delete(id);
    }
    // Prepending history must preserve keyboard order without detaching already ordered focused dots.
    let nextNode: Element | null = this.content.querySelector('.timeline-dot');
    for (const dot of orderedDots) {
      if (dot === nextNode) nextNode = dot.nextElementSibling;
      else this.content.insertBefore(dot, nextNode);
    }
    this.visibleRange = { start, end };
    this.updateRulerWave();
  }
}
