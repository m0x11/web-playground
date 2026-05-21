// Media readiness tracking.
//
// Two kinds of async media work the export pipeline must wait for:
//
//   1. Initial loads — images decoding, video metadata loading. Awaited by
//      scene.ready() before frame 0 so nothing pops in mid-export.
//   2. Per-frame seeks — a video element settling at a new currentTime after
//      setTime(t). Awaited by scene.framePainted() before each screenshot.
//
// Components register promises here; the scene runtime drains them. In the
// GUI these gates are harmless (ready() is awaited once, framePainted() only
// by the export driver).

const loadPromises = new Set();
const seekPromises = new Set();

function track(set, promise) {
  set.add(promise);
  promise.finally(() => set.delete(promise));
  return promise;
}

// Register an initial asset load (image decode, video loadedmetadata...).
export function trackLoad(promise) {
  return track(loadPromises, promise);
}

// Register a per-frame video seek.
export function trackSeek(promise) {
  return track(seekPromises, promise);
}

// Resolves once every registered initial load has settled.
export function allLoaded() {
  return Promise.allSettled([...loadPromises]);
}

// Resolves once every in-flight seek has settled.
export function allSeeked() {
  return Promise.allSettled([...seekPromises]);
}

// Wrap an <img>: resolve when decoded. Safe to call on already-loaded images.
export function imageLoad(img) {
  return new Promise(resolve => {
    if (img.complete && img.naturalWidth > 0) { resolve(); return; }
    const done = () => {
      img.removeEventListener('load', done);
      img.removeEventListener('error', done);
      resolve();
    };
    img.addEventListener('load', done);
    img.addEventListener('error', done);
  });
}

// Wrap a <video>: resolve when metadata (duration, dimensions) is available.
export function videoMetadata(video) {
  return new Promise(resolve => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) { resolve(); return; }
    const done = () => {
      video.removeEventListener('loadedmetadata', done);
      video.removeEventListener('error', done);
      resolve();
    };
    video.addEventListener('loadedmetadata', done);
    video.addEventListener('error', done);
  });
}

// Wrap a <video> seek: resolve when it has settled at (or very near) target.
export function videoSeek(video, target) {
  return new Promise(resolve => {
    if (Math.abs(video.currentTime - target) < 0.005 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.addEventListener('error', done);
  });
}
