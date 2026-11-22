import { type TimelineStyle } from '@/core/types/common';
import { applyRTLClass } from '@/core/utils/rtl';

import { TimelineDotLayer } from './TimelineDotLayer';
import type { TimelineHierarchyGeometry } from './TimelineHierarchyGeometry';
import { TimelinePreviewPanel } from './TimelinePreviewPanel';
import { TimelineRailPlacement } from './TimelineRailPlacement';
import { TimelineSlider } from './TimelineSlider';
import type { TimelineState } from './TimelineState';
import timelineStyles from './timeline.css?inline';
import previewStyles from './timelinePreview.css?inline';
/** Hides every rail surface until the conversation has a turn to mark. */
const EMPTY_RAIL_CLASS = 'gv-timeline-empty';
/** Persists the last valid chat-area left offset across route rebuilds so left rails never flash into the sidebar. */
let lastKnownChatLeft: number | null = null;
/** Everything a timeline view and its engine put on the page. */
const TIMELINE_PAGE_NODES = [
  'style[data-gv-timeline]',
  '.gemini-timeline-bar',
  '.timeline-left-slider',
  '.timeline-preview-toggle',
  '.timeline-preview-panel',
  '.gv-timeline-preview-hover-bridge',
  '#gemini-timeline-tooltip',
  '.gv-navigation-loading',
  '.gv-navigation-veil',
].join(',');
interface TimelineViewOptions {
  mountAnchor?: HTMLElement;
  storagePrefix?: string;
  position?: 'left' | 'right';
  getViewport: () => HTMLElement | null;
  getActiveId: () => string | null;
  navigate: (turnId: string, index: number) => void;
  search: (query: string) => void;
  onStyleChange: () => void;
  onResize: () => void;
}
/** Composes rail owners, preview, styles and synchronization with the live viewport. */
export class TimelineView {
  ui: {
    timelineBar: HTMLElement | null;
    track?: HTMLElement | null;
    trackContent?: HTMLElement | null;
    slider?: HTMLElement | null;
    sliderHandle?: HTMLElement | null;
  } = { timelineBar: null };

  timelineStyle: TimelineStyle = 'dots';

  hideContainer: boolean = false;

  railPosition: 'left' | 'right' = 'right';

  private navigationVeil: HTMLElement | null = null;
  private veilRemoveTimer: number | null = null;
  private boundsResizeObserver: ResizeObserver | null = null;
  private observedBoundsEl: HTMLElement | null = null;

  setNavigationCurtain(active: boolean): void {
    if (this.veilRemoveTimer !== null) {
      window.clearTimeout(this.veilRemoveTimer);
      this.veilRemoveTimer = null;
    }
    if (!active || this.destroyed) {
      const veil = this.navigationVeil;
      if (!veil) return;
      if (this.destroyed) {
        veil.remove();
        this.navigationVeil = null;
        return;
      }
      veil.classList.add('gv-navigation-veil-hiding');
      this.veilRemoveTimer = window.setTimeout(() => {
        this.veilRemoveTimer = null;
        if (this.navigationVeil === veil) {
          veil.remove();
          this.navigationVeil = null;
        }
      }, 150);
      return;
    }
    const viewport = this.options.getViewport();
    const isWindowViewport =
      !viewport || viewport === document.documentElement || viewport === document.body;
    const rect = isWindowViewport
      ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
      : viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    let veil = this.navigationVeil;
    if (!veil || !veil.isConnected) {
      veil = document.createElement('div');
      veil.className = 'gv-navigation-veil';
      veil.setAttribute('aria-hidden', 'true');
      const spinner = document.createElement('span');
      spinner.className = 'gv-navigation-veil-spinner';
      veil.appendChild(spinner);
      (this.options.mountAnchor ?? document.body).append(veil);
      this.navigationVeil = veil;
    }
    veil.classList.remove('gv-navigation-veil-hiding');
    veil.style.top = `${Math.max(0, Math.round(rect.top))}px`;
    veil.style.left = `${Math.max(0, Math.round(rect.left))}px`;
    veil.style.width = `${Math.round(rect.width)}px`;
    veil.style.height = `${Math.round(rect.height)}px`;
    const bg = this.resolveOpaqueBackground(viewport);
    if (bg) veil.style.setProperty('--gv-veil-bg', bg);
    else veil.style.removeProperty('--gv-veil-bg');
  }

  private resolveOpaqueBackground(start: HTMLElement | null): string | null {
    for (let node: HTMLElement | null = start; node; node = node.parentElement) {
      try {
        const bg = getComputedStyle(node).backgroundColor;
        if (!bg || bg === 'transparent') continue;
        const rgba = bg.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)$/);
        if (rgba && parseFloat(rgba[1]) < 0.99) continue;
        return bg;
      } catch {
        break;
      }
    }
    return null;
  }

  private resolveChatBoundsElement(): HTMLElement | null {
    const viewport = this.options.getViewport();
    if (
      viewport &&
      viewport !== document.documentElement &&
      viewport !== document.body &&
      viewport.isConnected
    ) {
      return viewport;
    }
    const sample = this.markers.find((marker) => marker.element?.isConnected)?.element;
    if (sample) {
      for (
        let parent = sample.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        try {
          if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) {
            const rect = parent.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return parent;
          }
        } catch {
          break;
        }
      }
    }
    if (this.observedBoundsEl?.isConnected) return this.observedBoundsEl;
    return null;
  }

  private observeChatBounds(target: HTMLElement | null): void {
    if (this.observedBoundsEl === target) return;
    this.boundsResizeObserver?.disconnect();
    this.observedBoundsEl = null;
    if (!target || typeof ResizeObserver !== 'function' || this.destroyed) return;
    if (!this.boundsResizeObserver) {
      this.boundsResizeObserver = new ResizeObserver(() => this.syncRailPlacement());
    }
    this.boundsResizeObserver.observe(target);
    this.observedBoundsEl = target;
  }

  setRailPosition(position: 'left' | 'right'): void {
    const changed = this.railPosition !== position;
    this.railPosition = position;
    const bar = this.ui.timelineBar;
    if (!bar) return;
    bar.dataset.gvPosition = position;
    this.previewPanel?.setRailPosition(position);
    this.syncRailPlacement();
    this.updateRulerDirection();
    if (changed) {
      this.options.onStyleChange();
      this.updateSlider();
    }
  }

  /** Keep a left-side rail mirrored 15px inside the chat area's left edge, clearing any host sidebar. */
  syncRailPlacement(): void {
    const bar = this.ui.timelineBar;
    if (!bar || this.destroyed) return;
    bar.dataset.gvPosition = this.railPosition;
    if (this.railPosition === 'left') {
      const boundsEl = this.resolveChatBoundsElement();
      this.observeChatBounds(boundsEl);
      const boundsRect = boundsEl?.getBoundingClientRect();
      const validLeft =
        boundsRect &&
        boundsRect.width > 0 &&
        boundsRect.height > 0 &&
        boundsRect.left >= 0 &&
        boundsRect.left < window.innerWidth - 60
          ? Math.round(boundsRect.left)
          : null;
      if (validLeft !== null) lastKnownChatLeft = validLeft;
      const chatLeft = validLeft ?? lastKnownChatLeft ?? 0;
      const nextLeft = `${chatLeft + 15}px`;
      bar.style.right = 'auto';
      if (bar.style.left !== nextLeft) {
        bar.style.left = nextLeft;
        this.previewPanel?.reposition();
        this.updateSlider();
      }
    } else {
      this.observeChatBounds(null);
      const hadInline = bar.style.left !== '' || bar.style.right !== '';
      bar.style.left = '';
      bar.style.right = '';
      if (hadInline) {
        this.previewPanel?.reposition();
        this.updateSlider();
      }
    }
    this.updateRulerDirection();
  }

  private firstUserTurnOffset = 0;

  private contentSpanPx = 1;

  private resizeIdleTimer: number | null = null;

  private styleSwitchRaf: number | null = null;

  private resizeIdleDelay = 140;

  previewPanel: TimelinePreviewPanel | null = null;

  rtl = false;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private readonly lifetime = new AbortController();
  constructor(
    private readonly state: Pick<TimelineState, 'markers' | 'toggleStar'>,
    geometry: TimelineHierarchyGeometry,
    private readonly options: TimelineViewOptions,
  ) {
    this.railPosition = options.position ?? 'right';
    this.dotLayer = new TimelineDotLayer(() => state.markers, geometry, {
      getStyle: () => this.timelineStyle,
      getViewport: () => this.options.getViewport(),
      getActiveId: () => this.options.getActiveId(),
    });
    this.placement = new TimelineRailPlacement({
      storagePrefix: options.storagePrefix,
      getStyle: () => this.timelineStyle,
      onWidthChange: () => this.applyContainerVisibility(),
      onPositionRestore: () => {
        this.syncRailPlacement();
        this.previewPanel?.reposition();
      },
    });
  }
  private readonly dotLayer: TimelineDotLayer;
  get yPositions(): number[] {
    return this.dotLayer.yPositions;
  }
  get markerTops(): number[] {
    return this.dotLayer.markerTops;
  }
  measureMarkers(elements: HTMLElement[]): void {
    this.dotLayer.measureMarkerTops(elements);
    this.firstUserTurnOffset = elements[0].offsetTop;
    this.contentSpanPx = Math.max(
      1,
      elements[elements.length - 1].offsetTop - elements[0].offsetTop,
    );
  }
  updateTimelineGeometry(): void {
    if (!this.ui.timelineBar || !this.ui.trackContent) return;
    this.dotLayer.layout();
    this.slider?.updateGeometry();
  }
  updateVirtualRangeAndRender(): void {
    this.applyEmptyState();
    this.dotLayer.render();
  }
  // Gemini's new-chat home (/app) is a conversation route with no turns; an unmarked rail there
  // read as a stray full-height bar, so nothing of the rail shows until a marker exists.
  private applyEmptyState(): void {
    const empty = this.markers.length === 0;
    const bar = this.ui.timelineBar;
    const wasEmpty = bar?.classList.contains(EMPTY_RAIL_CLASS);
    bar?.classList.toggle(EMPTY_RAIL_CLASS, empty);
    this.ui.slider?.classList.toggle(EMPTY_RAIL_CLASS, empty);
    // Initial positioning may have measured a display:none rail before turns loaded.
    // Measure again only after restoring its visible geometry.
    if (wasEmpty && !empty) {
      this.syncRailPlacement();
      this.previewPanel?.reposition();
    }
  }
  startRunner(fromIdx: number, toIdx: number, duration: number): void {
    this.dotLayer.startRunner(fromIdx, toIdx, duration);
  }
  readonly placement: TimelineRailPlacement;
  private slider: TimelineSlider | null = null;

  updateSlider(): void {
    this.slider?.update();
  }
  updateSliderPosition(): void {
    this.slider?.updatePosition();
  }
  toggleDraggable(enabled: boolean): void {
    this.placement.toggleDraggable(enabled);
  }
  applyPosition(top: number, left: number): void {
    if (!this.ui.timelineBar) return;
    this.placement.applyPosition(top, left);
    this.previewPanel?.reposition();
  }
  updateRulerDirection(left?: number): void {
    this.placement.updateRulerDirection(left);
  }
  reapplyPosition(): void {
    if (this.placement.reapplyPosition()) this.previewPanel?.reposition();
  }
  private get markers() {
    return this.state.markers;
  }
  private get scrollContainer() {
    return this.options.getViewport();
  }
  private get activeTurnId() {
    return this.options.getActiveId();
  }
  mount(): void {
    if (this.destroyed) return;
    // One timeline per page: an orphaned content script (extension reload or
    // update) cannot tear its rail down, and adopting its bar while adding a
    // second preview panel stacked two lists on ChatGPT. The newest view owns
    // the page.
    for (const stale of document.querySelectorAll(TIMELINE_PAGE_NODES)) stale.remove();
    this.styleElement = document.createElement('style');
    this.styleElement.dataset.gvTimeline = '';
    this.styleElement.textContent = `${timelineStyles}\n${previewStyles}`;
    document.head.appendChild(this.styleElement);
    const anchor = this.options.mountAnchor ?? document.body;
    const bar = document.createElement('div');
    bar.className = 'gemini-timeline-bar';
    anchor.appendChild(bar);
    bar.dataset.gvPosition = this.railPosition;
    this.ui.timelineBar = bar;
    const track = document.createElement('div');
    track.className = 'timeline-track';
    bar.appendChild(track);
    const content = document.createElement('div');
    content.className = 'timeline-track-content';
    track.appendChild(content);
    this.ui.track = track;
    this.ui.trackContent = content;
    this.dotLayer.mount(bar, track, content);

    const slider = document.createElement('div');
    slider.className = 'timeline-left-slider';
    const handle = document.createElement('div');
    handle.className = 'timeline-left-handle';
    slider.appendChild(handle);
    anchor.appendChild(slider);
    this.ui.slider = slider;
    this.ui.sliderHandle = handle;
    this.applyEmptyState();

    this.previewPanel = new TimelinePreviewPanel(bar, anchor, this.railPosition);
    this.previewPanel.init(this.options.navigate, this.options.search, (id) =>
      this.state.toggleStar(id),
    );
    this.slider = new TimelineSlider(bar, track, slider, this.ui.sliderHandle, {
      getLayout: () => ({
        contentHeight: this.dotLayer.contentHeight,
        padding: this.dotLayer.padding,
        rtl: this.railPosition === 'left' || this.rtl,
      }),
      onScroll: () => this.updateVirtualRangeAndRender(),
    });
    this.placement.mount(bar);
    this.setupEventListeners();
    // Settings can arrive before mount; apply them before the first marker render.
    this.syncRailPlacement();
    this.applyContainerVisibility();
    this.applyTimelineStyle();
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(bar);
  }
  render(): void {
    if (this.destroyed) return;
    this.updateTimelineGeometry();
    this.syncTimelineTrackToMain();
    this.updateVirtualRangeAndRender();
    this.updateSlider();
  }
  updateActiveDotUI(): void {
    this.dotLayer.updateActive();
    this.previewPanel?.updateActiveTurn(this.activeTurnId);
  }
  updatePreviewMarkers(): void {
    this.previewPanel?.updateMarkers(
      this.markers.map((marker, index) => ({
        id: marker.id,
        summary: marker.summary,
        index,
        starred: marker.starred,
      })),
    );
  }
  private setupEventListeners(): void {
    const signal = this.lifetime.signal;
    this.ui.timelineBar!.addEventListener(
      'wheel',
      (event) => {
        if (this.scrollContainer) this.scrollContainer.scrollTop += event.deltaY;
        this.slider?.show();
        event.preventDefault();
      },
      { passive: false, signal },
    );
    // Both resize sources funnel through one trailing debounce so a resize
    // burst runs geometry/layout work only once per idle window.
    const onWindowResize = () => this.scheduleResizeWork();
    window.addEventListener('resize', onWindowResize, { signal: this.lifetime.signal });
    if (window.visualViewport) {
      const onVisualViewportResize = () => this.scheduleResizeWork();
      window.visualViewport.addEventListener('resize', onVisualViewportResize, {
        signal: this.lifetime.signal,
      });
    }
    // Catch sidebar transitions that shift the chat container horizontally without resizing it.
    document.addEventListener(
      'transitionend',
      () => {
        if (this.railPosition === 'left') this.syncRailPlacement();
      },
      { passive: true, signal },
    );
  }
  destroy(): void {
    this.destroyed = true;
    this.setNavigationCurtain(false);

    this.lifetime.abort();
    this.resizeObserver?.disconnect();
    this.boundsResizeObserver?.disconnect();
    this.boundsResizeObserver = null;
    this.observedBoundsEl = null;
    this.dotLayer.destroy();
    if (this.resizeIdleTimer !== null) clearTimeout(this.resizeIdleTimer);
    if (this.styleSwitchRaf !== null) {
      cancelAnimationFrame(this.styleSwitchRaf);
      this.styleSwitchRaf = null;
    }
    this.slider?.destroy();
    this.slider = null;
    this.placement.destroy();
    this.previewPanel?.destroy();
    this.previewPanel = null;
    this.ui.slider?.remove();
    this.ui.timelineBar?.remove();
    this.styleElement?.remove();
    this.styleElement = null;
    this.ui = { timelineBar: null };
  }
  applyContainerVisibility(): void {
    if (!this.ui.timelineBar) return;
    const bar = this.ui.timelineBar;
    // Visual background width (::before is centered, bar stays 24px for dots)
    bar.style.setProperty('--timeline-bar-width', `${this.placement.barWidth}px`);
    // hideContainer is an independent binary toggle
    bar.classList.toggle('timeline-no-container', !!this.hideContainer);
  }

  applyTimelineStyle(): void {
    const bar = this.ui.timelineBar;
    if (!bar) return;
    if (this.styleSwitchRaf !== null) {
      cancelAnimationFrame(this.styleSwitchRaf);
      this.styleSwitchRaf = null;
    }
    bar.classList.add('gv-timeline-switching');
    const compact = this.timelineStyle === 'compact';
    const ruler = this.timelineStyle === 'ruler';
    const dots = this.timelineStyle === 'dots';
    bar.classList.toggle('timeline-style-compact', compact);
    bar.classList.toggle('gv-timeline-style-ruler', ruler);
    bar.classList.toggle('gv-timeline-style-dots', dots);
    this.updateRulerDirection();
    this.ui.slider?.classList.toggle('timeline-style-compact', true);
    this.options.onStyleChange();
    if (this.ui.track) this.ui.track.scrollTop = 0;
    if (compact) {
      this.ui.track?.setAttribute('aria-hidden', 'true');
    } else {
      this.ui.track?.removeAttribute('aria-hidden');
    }
    this.previewPanel?.setCompactMode(compact);
    this.previewPanel?.setFloatingToggleSuppressed(!compact);
    this.updateVirtualRangeAndRender();
    this.updateSlider();
    void bar.offsetHeight;
    this.styleSwitchRaf = requestAnimationFrame(() => {
      this.styleSwitchRaf = null;
      bar.classList.remove('gv-timeline-switching');
    });
  }

  syncTimelineTrackToMain(): void {}

  /** Reset inline placement when the page direction changes. */
  applyRTLUpdate(language?: string | null): void {
    const wasRTL = this.rtl;
    this.rtl = applyRTLClass(language);
    if (wasRTL !== this.rtl) {
      if (this.ui.timelineBar) this.ui.timelineBar.style.top = '';
      this.syncRailPlacement();
      this.updateSlider();
      this.previewPanel?.reposition();
    }
  }

  /** Trailing-debounced handler shared by window and visualViewport resize. */
  private scheduleResizeWork(): void {
    if (this.resizeIdleTimer !== null) clearTimeout(this.resizeIdleTimer);
    this.resizeIdleTimer = window.setTimeout(() => {
      this.resizeIdleTimer = null;
      if (this.destroyed) return;
      this.syncRailPlacement();
      this.options.onResize();
      this.updateTimelineGeometry();
      this.syncTimelineTrackToMain();
      this.updateVirtualRangeAndRender();
      this.updateSlider();
      // Reapply position for responsive design (v2 format only)
      this.reapplyPosition();
    }, this.resizeIdleDelay);
  }
}
