// Media — image / video / cycle primitive.
//
// Three source modes:
//   image — one still image
//   video — one video, muted + looping, driven by scene time (gif-like)
//   cycle — N images, swapped every `cycleSpeed` seconds
//
// Determinism: video and cycle derive their displayed frame purely from the
// scene time `t` (via the onTime hook), never wall-clock. So GUI playback,
// timeline scrubbing, and 4K export all agree frame-for-frame.
//   cycle: index = floor(t / cycleSpeed) % n
//   video: currentTime = start + (t % (end - start))  — loops the
//          [videoStart, videoStop] segment (videoStop 0 → natural end)
//
// Cycle uses one preloaded <img> per image (stacked, visibility-toggled) so a
// frame switch is instant — no src swap, no decode latency mid-export.
//
// Layout: each media element is sized to its *fitted content* size (cover /
// contain / none computed from the natural dimensions and the cell box), and
// centered; the cell's overflow:hidden does the cropping. object-fit is NOT
// used to crop, because object-fit crops inside the element box, and panning
// that box would just slide the crop window off the cell (blank space on one
// side) instead of revealing more of the picture. With the element equal to
// the content, pan / zoom / rotate act on the picture itself, so a cover- or
// none-fitted video larger than the cell can be panned around freely.
// Until natural dimensions are known the element falls back to the cell box
// with object-fit, and re-lays out on load / resize.
//
// Grading: exposure / contrast / saturation / hue / blur map straight onto
// CSS filter functions. Temperature and tint (colour balance) have no CSS
// function, so each instance owns a tiny inline <svg><filter> with an
// feColorMatrix that scales the R/G/B channels; the filter chain references
// it by id. All of it is plain DOM/CSS, so headless export renders it too.

import { assetUrl } from '../../scene/assets.js';
import { trackLoad, trackSeek, imageLoad, videoMetadata, videoSeek }
  from '../../media/readiness.js';
import { cycleIndex, cyclePeriodSeconds } from '../cycle.js';

export const schema = {
  name: 'Media',
  category: 'primitives',
  children: 'none',
  props: {
    source: {
      type: 'enum', label: 'Source',
      options: ['image', 'video', 'cycle'], default: 'image',
    },
    image: {
      type: 'asset', label: 'Image', accept: 'image/*', default: '',
      visibleWhen: { source: 'image' },
    },
    video: {
      type: 'asset', label: 'Video', accept: 'video/*', default: '',
      visibleWhen: { source: 'video' },
    },
    videoStart: {
      // `max` is a fallback — the right-rail replaces it with the actual
      // video duration once metadata loads.
      type: 'number', label: 'Start at', min: 0, max: 60, step: 0.1,
      unit: 's', default: 0,
      visibleWhen: { source: 'video' },
    },
    videoStop: {
      // 0 (or anything ≤ videoStart) means "the natural end of the video".
      // As with videoStart, the right-rail rebounds `max` to the duration.
      type: 'number', label: 'End at', min: 0, max: 60, step: 0.1,
      unit: 's', default: 0,
      visibleWhen: { source: 'video' },
    },
    videoEnd: {
      type: 'enum', label: 'On end',
      options: ['loop', 'hold', 'ping-pong'], default: 'loop',
      visibleWhen: { source: 'video' },
    },
    images: {
      type: 'asset-list', label: 'Images', accept: 'image/*', default: [],
      visibleWhen: { source: 'cycle' },
    },
    cycleSpeed: {
      type: 'number', label: 'Cycle', min: 0.05, max: 10, step: 0.05,
      unit: 's', default: 0.5,
      visibleWhen: { source: 'cycle' },
    },
    cycleStart: {
      type: 'number', label: 'Start on', min: 0, max: 50, step: 1, default: 0,
      visibleWhen: { source: 'cycle' },
    },
    cycleDir: {
      type: 'enum', label: 'Direction',
      options: ['forward', 'backward', 'ping-pong'], default: 'forward',
      visibleWhen: { source: 'cycle' },
    },
    fit: {
      type: 'enum', label: 'Fit',
      options: ['cover', 'contain', 'fill', 'none'], default: 'cover',
    },
    zoom: {
      type: 'number', label: 'Zoom', min: 0.1, max: 8, step: 0.05, default: 1,
    },
    offsetX: {
      type: 'number', label: 'Pan X', min: -100, max: 100, step: 1, unit: '%', default: 0,
    },
    offsetY: {
      type: 'number', label: 'Pan Y', min: -100, max: 100, step: 1, unit: '%', default: 0,
    },
    rotate: {
      type: 'number', label: 'Rotate', min: -180, max: 180, step: 1, unit: '°', default: 0,
    },
    // ── color grading (CSS filter + SVG colour matrix for balance) ──
    exposure: {
      type: 'number', label: 'Exposure', min: 0, max: 3, step: 0.01, default: 1,
    },
    contrast: {
      type: 'number', label: 'Contrast', min: 0, max: 3, step: 0.01, default: 1,
    },
    saturation: {
      type: 'number', label: 'Saturation', min: 0, max: 3, step: 0.01, default: 1,
    },
    hue: {
      type: 'number', label: 'Hue', min: -180, max: 180, step: 1, unit: '°', default: 0,
    },
    temperature: {
      type: 'number', label: 'Temperature', min: -100, max: 100, step: 1, default: 0,
    },
    tint: {
      type: 'number', label: 'Tint', min: -100, max: 100, step: 1, default: 0,
    },
    blur: {
      type: 'number', label: 'Blur', min: 0, max: 100, step: 0.5, unit: 'px', default: 0,
    },
    invert: {
      type: 'boolean', label: 'Invert', default: false,
    },
  },
};

// Unique id per mounted instance for its SVG colour-balance filter.
let instanceCounter = 0;

// Live-playback drift tolerances (seconds) — see syncVideo.
const LIVE_AHEAD_TOLERANCE = 0.1;
const LIVE_BEHIND_TOLERANCE = 0.3;

// How much scene time this component intrinsically needs. The scene's
// duration() takes the max across the tree, so a cycle alone makes the
// timeline playable. One full cycle = images.length × cycleSpeed.
export function intrinsicDuration(props) {
  if (props.source === 'cycle') {
    const n = (props.images ?? []).length;
    return cyclePeriodSeconds(n, props.cycleSpeed ?? 0.5, props.cycleDir);
  }
  return 0;
}

export function mount(el, props, _ctx) {
  el.classList.add('gen-media');
  Object.assign(el.style, {
    position: 'relative',
    width: '100%', height: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box',
  });

  // Persistent sub-elements; only the active one is shown.
  const imgEl = document.createElement('img');
  imgEl.style.cssText = baseMediaCss();

  const videoEl = document.createElement('video');
  videoEl.muted = true;
  videoEl.loop = false;        // segment looping is done by syncVideo
  videoEl.playsInline = true;
  videoEl.preload = 'auto';
  videoEl.style.cssText = baseMediaCss();

  const cycleLayer = document.createElement('div');
  Object.assign(cycleLayer.style, { position: 'absolute', inset: '0' });

  const placeholder = document.createElement('div');
  placeholder.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;' +
    'justify-content:center;background:rgba(0,0,0,0.05);' +
    'border:1px dashed rgba(0,0,0,0.25);color:rgba(0,0,0,0.45);' +
    'font-family:var(--font-mono);font-size:13px;box-sizing:border-box;';

  // Per-instance colour-balance filter (temperature / tint).
  const balanceId = `gen-media-balance-${++instanceCounter}`;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
  const filterEl = document.createElementNS(svgNS, 'filter');
  filterEl.setAttribute('id', balanceId);
  filterEl.setAttribute('color-interpolation-filters', 'sRGB');
  const matrixEl = document.createElementNS(svgNS, 'feColorMatrix');
  matrixEl.setAttribute('type', 'matrix');
  filterEl.appendChild(matrixEl);
  svg.appendChild(filterEl);

  el.append(svg, imgEl, videoEl, cycleLayer, placeholder);

  // cycle state: one <img> per source image.
  let cycleImgs = [];
  let cycleKey = '';      // signature of the current images list
  let current = { ...props };
  let lastTime = 0;       // last scene time seen — lets apply() re-seek video
  let live = false;       // real-time GUI playback (see onTime)
  let box = { w: 0, h: 0 };   // cell content box (fractional, from the RO)

  // Natural dimensions arrive asynchronously — re-lay out when they do.
  // Registered before any src is set so these run first on load.
  imgEl.addEventListener('load', layout);
  videoEl.addEventListener('loadedmetadata', layout);

  // Fitted sizes depend on the cell box — re-lay out whenever it changes
  // (grid resize, canvas aspect change, …).
  const ro = new ResizeObserver(entries => {
    const r = entries[entries.length - 1].contentRect;
    box = { w: r.width, h: r.height };
    layout();
  });
  ro.observe(el);

  function apply(p) {
    current = { ...p };
    const { source } = p;

    show(imgEl, false);
    show(videoEl, false);
    show(cycleLayer, false);
    show(placeholder, false);

    if (source === 'image') {
      const url = assetUrl(p.image);
      if (url) {
        if (imgEl.src !== absolute(url)) imgEl.src = url;
        trackLoad(imageLoad(imgEl));
        show(imgEl, true);
      } else {
        showPlaceholder('no image');
      }
    } else if (source === 'video') {
      const url = assetUrl(p.video);
      if (url) {
        if (videoEl.src !== absolute(url)) {
          videoEl.src = url;
          trackLoad(videoMetadata(videoEl));
          videoEl.addEventListener('loadedmetadata', () => syncVideo(lastTime), { once: true });
        }
        show(videoEl, true);
        syncVideo(lastTime);   // reflect videoStart / current time immediately
      } else {
        showPlaceholder('no video');
      }
    } else if (source === 'cycle') {
      rebuildCycle(p);
      if (cycleImgs.length > 0) show(cycleLayer, true);
      else showPlaceholder('no images');
    }

    layout();
  }

  // Size each media element to its fitted content and apply pan / rotate /
  // zoom. Transform order (left → right): center the element on the cell,
  // pan (in % of the content's own size, along the cell's axes), rotate
  // about the content center, then zoom. The cell's overflow:hidden crops.
  function layout() {
    const p = current;
    const tf =
      `translate(-50%, -50%) ` +
      `translate(${p.offsetX ?? 0}%, ${p.offsetY ?? 0}%) ` +
      `rotate(${p.rotate ?? 0}deg) ` +
      `scale(${p.zoom ?? 1})`;
    const filter = gradingFilter(p);
    place(imgEl, imgEl.naturalWidth, imgEl.naturalHeight, p.fit, tf, filter);
    place(videoEl, videoEl.videoWidth, videoEl.videoHeight, p.fit, tf, filter);
    for (const im of cycleImgs) place(im, im.naturalWidth, im.naturalHeight, p.fit, tf, filter);
  }

  // CSS filter chain for the grading props. Temperature / tint go through
  // the instance's SVG colour matrix; it's only referenced when non-zero so
  // the common case stays a pure CSS filter (or none at all).
  function gradingFilter(p) {
    const parts = [];
    const exposure = p.exposure ?? 1, contrast = p.contrast ?? 1;
    const saturation = p.saturation ?? 1, hue = p.hue ?? 0, blur = p.blur ?? 0;
    const temperature = p.temperature ?? 0, tint = p.tint ?? 0;
    if (exposure !== 1) parts.push(`brightness(${exposure})`);
    if (contrast !== 1) parts.push(`contrast(${contrast})`);
    if (saturation !== 1) parts.push(`saturate(${saturation})`);
    if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);
    if (temperature !== 0 || tint !== 0) {
      matrixEl.setAttribute('values', balanceMatrix(temperature / 100, tint / 100));
      parts.push(`url(#${balanceId})`);
    }
    if (blur > 0) parts.push(`blur(${blur}px)`);
    // Last, so it negates the graded result (what you'd expect from an
    // "invert" toggle on top of a look).
    if (p.invert) parts.push('invert(1)');
    return parts.length ? parts.join(' ') : '';
  }

  function place(node, natW, natH, fit, tf, filter) {
    const size = fitSize(natW, natH, box.w, box.h, fit);
    if (size) {
      node.style.width = `${size.w}px`;
      node.style.height = `${size.h}px`;
      node.style.objectFit = 'fill';     // box already has the content's shape
    } else {
      // Dimensions unknown yet — fall back to the cell box + object-fit.
      node.style.width = '100%';
      node.style.height = '100%';
      node.style.objectFit = fit;
    }
    node.style.transform = tf;
    node.style.transformOrigin = 'center center';
    node.style.filter = filter;
  }

  function rebuildCycle(p) {
    const urls = (p.images ?? []).map(assetUrl).filter(Boolean);
    const key = urls.join('|');
    if (key !== cycleKey) {
      cycleKey = key;
      cycleLayer.innerHTML = '';
      cycleImgs = urls.map((url, i) => {
        const im = document.createElement('img');
        im.src = url;
        im.style.cssText = baseMediaCss();
        im.style.display = i === 0 ? 'block' : 'none';
        im.addEventListener('load', layout);
        trackLoad(imageLoad(im));
        cycleLayer.appendChild(im);
        return im;
      });
    }
  }

  function showPlaceholder(text) {
    placeholder.textContent = `(${text})`;
    show(placeholder, true);
  }

  // Time-driven update — cycle frame selection + video seek. `info.live`
  // marks real-time GUI playback (vs scrub / export frames).
  function onTime(t, info) {
    lastTime = t;
    live = !!info?.live;
    if (current.source === 'cycle' && cycleImgs.length > 0) {
      const speed = Math.max(0.001, current.cycleSpeed ?? 0.5);
      const start = Math.max(0, Math.round(current.cycleStart ?? 0));
      const step = Math.floor(t / speed);
      const idx = cycleIndex(step, cycleImgs.length, current.cycleDir, start);
      cycleImgs.forEach((im, i) => {
        im.style.display = i === idx ? 'block' : 'none';
      });
    } else if (current.source === 'video') {
      syncVideo(t);
    }
  }

  // Native playback bookkeeping for live mode.
  function playVideo() {
    if (!videoEl.paused) return;
    const p = videoEl.play();
    if (p?.catch) p.catch(() => { /* autoplay refused — seeks still work */ });
  }
  function pauseVideo() {
    if (!videoEl.paused) videoEl.pause();
  }

  // Seek the video to the frame for scene time `t`. Playback is confined to
  // the segment [videoStart, videoStop] (videoStop ≤ videoStart → natural
  // end): loop wraps back to videoStart, hold clamps at videoStop, ping-pong
  // bounces between the two.
  //
  // Non-live (scrub, paused, export): exact seek every call — deterministic.
  // Live (GUI play): seeking every frame forces a decode per frame per video
  // and tanks the framerate with a couple of 4K clips, so instead the element
  // plays natively and we only seek when it drifts from the target — which
  // also covers segment wraps. Ping-pong's backward leg can't play natively
  // (no negative playbackRate), so it falls back to per-frame seeks.
  function syncVideo(t) {
    if (current.source !== 'video' || !videoEl.src) return;
    const dur = videoEl.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    // Stay just shy of the exact end — seeking to currentTime === duration is
    // an unreliable edge.
    const top = Math.max(0.05, dur - 0.05);
    const start = Math.min(top, Math.max(0, current.videoStart ?? 0));
    const stop = current.videoStop ?? 0;
    const end = stop > start ? Math.min(stop, top) : top;
    const span = end - start;
    // `videoHold` is the legacy boolean; videoEnd supersedes it.
    const mode = current.videoEnd ?? (current.videoHold ? 'hold' : 'loop');
    let target;
    let forward = true;   // is the picture advancing in real time right now?
    if (span <= 0.001) {
      target = start;
      forward = false;
    } else if (mode === 'hold') {
      target = Math.min(start + t, end);
      forward = start + t < end;
    } else if (mode === 'ping-pong') {
      const period = 2 * span;
      const pos = t % period;
      forward = pos < span;
      target = start + (forward ? pos : period - pos);   // triangle wave start↔end
    } else {
      target = start + (t % span);
    }

    if (live && forward) {
      playVideo();
      const drift = videoEl.currentTime - target;
      // Ahead (overshot the segment end / wrapped) or well behind (stalled):
      // snap. Asymmetric so ordinary frame-quantisation jitter never seeks.
      if (drift > LIVE_AHEAD_TOLERANCE || drift < -LIVE_BEHIND_TOLERANCE) {
        videoEl.currentTime = target;
      }
      return;
    }

    pauseVideo();
    if (Math.abs(videoEl.currentTime - target) > 0.005) {
      videoEl.currentTime = target;
      trackSeek(videoSeek(videoEl, target));
    }
  }

  apply(props);

  return {
    onTime,
    patch(nextProps) { apply(nextProps); },
    unmount() {
      ro.disconnect();
      el.classList.remove('gen-media');
      videoEl.removeAttribute('src');
      el.innerHTML = '';
      el.style.cssText = '';
    },
  };
}

function baseMediaCss() {
  // Anchored at the cell center; layout() sets width/height and the
  // translate(-50%,-50%) that completes the centering.
  return 'position:absolute;left:50%;top:50%;width:100%;height:100%;' +
    'display:block;max-width:none;max-height:none;';
}

// feColorMatrix for colour balance. `t` (temperature) and `g` (tint) are in
// [-1, 1]. Warm = more red / less blue; cool = the reverse. Positive tint
// pushes green, negative pushes magenta (less green, a touch more R+B).
// Gains are ±35% at the extremes — strong enough to be a look, not a wreck.
function balanceMatrix(t, g) {
  const K = 0.35;
  const r = 1 + K * t - K * 0.5 * g;
  const gg = 1 + K * g;
  const b = 1 - K * t - K * 0.5 * g;
  return [
    r, 0, 0, 0, 0,
    0, gg, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ].map(v => +v.toFixed(4)).join(' ');
}

// Content box for `fit`, or null when dimensions aren't known yet.
function fitSize(natW, natH, boxW, boxH, fit) {
  if (!(natW > 0 && natH > 0 && boxW > 0 && boxH > 0)) return null;
  if (fit === 'fill') return { w: boxW, h: boxH };
  if (fit === 'none') return { w: natW, h: natH };
  const s = fit === 'contain'
    ? Math.min(boxW / natW, boxH / natH)
    : Math.max(boxW / natW, boxH / natH);   // cover
  return { w: natW * s, h: natH * s };
}

function show(node, on) {
  node.style.display = on ? 'block' : 'none';
}

// Compare against the resolved absolute URL the browser stores in .src.
function absolute(url) {
  try { return new URL(url, location.href).href; }
  catch { return url; }
}
