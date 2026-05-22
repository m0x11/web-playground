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
//   video: currentTime = t % duration
//
// Cycle uses one preloaded <img> per image (stacked, visibility-toggled) so a
// frame switch is instant — no src swap, no decode latency mid-export.

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
  },
};

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
  videoEl.loop = true;
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

  el.append(imgEl, videoEl, cycleLayer, placeholder);

  // cycle state: one <img> per source image.
  let cycleImgs = [];
  let cycleKey = '';      // signature of the current images list
  let current = { ...props };
  let lastTime = 0;       // last scene time seen — lets apply() re-seek video

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
        imgEl.style.objectFit = p.fit;
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
        videoEl.style.objectFit = p.fit;
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

    applyTransform(p);
  }

  // Zoom + pan the media within its cell. The cell has overflow:hidden, so
  // zoom > 1 crops. Applied to all three element types uniformly.
  function applyTransform(p) {
    const tf = `translate(${p.offsetX ?? 0}%, ${p.offsetY ?? 0}%) scale(${p.zoom ?? 1})`;
    for (const node of [imgEl, videoEl, cycleLayer]) {
      node.style.transform = tf;
      node.style.transformOrigin = 'center center';
    }
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
        trackLoad(imageLoad(im));
        cycleLayer.appendChild(im);
        return im;
      });
    }
    for (const im of cycleImgs) im.style.objectFit = p.fit;
  }

  function showPlaceholder(text) {
    placeholder.textContent = `(${text})`;
    show(placeholder, true);
  }

  // Time-driven update — cycle frame selection + video seek.
  function onTime(t) {
    lastTime = t;
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

  // Seek the video to the frame for scene time `t`: begins `videoStart`
  // seconds in, then loops — or, with videoHold, clamps to the final frame.
  function syncVideo(t) {
    if (current.source !== 'video' || !videoEl.src) return;
    const dur = videoEl.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    const raw = Math.max(0, current.videoStart ?? 0) + t;
    // Stay just shy of the exact end — seeking to currentTime === duration is
    // an unreliable edge.
    const top = Math.max(0.05, dur - 0.05);
    // `videoHold` is the legacy boolean; videoEnd supersedes it.
    const mode = current.videoEnd ?? (current.videoHold ? 'hold' : 'loop');
    let target;
    if (mode === 'hold') {
      target = Math.min(raw, top);
    } else if (mode === 'ping-pong') {
      const period = 2 * top;
      const pos = raw % period;
      target = pos < top ? pos : period - pos;   // triangle wave 0↔top
    } else {
      target = raw % dur;
    }
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
      el.classList.remove('gen-media');
      videoEl.removeAttribute('src');
      el.innerHTML = '';
      el.style.cssText = '';
    },
  };
}

function baseMediaCss() {
  return 'position:absolute;inset:0;width:100%;height:100%;display:block;';
}

function show(node, on) {
  node.style.display = on ? 'block' : 'none';
}

// Compare against the resolved absolute URL the browser stores in .src.
function absolute(url) {
  try { return new URL(url, location.href).href; }
  catch { return url; }
}
