// BrowserStack capability presets for WebGPU MSM bench runs. Mirrors the
// shape used by `barretenberg/wasm-bench/scripts/run-browserstack.mjs` so
// the two harnesses share a target vocabulary (`--target macos`,
// `--target s25-ultra`, …).
//
// WebGPU support matrix (as of 2026-05-17):
// - macOS Sequoia · Chrome 148: WebGPU GA since Chrome 113.
// - Android Chrome (S25 Ultra, Pixel 9 Pro XL): WebGPU shipped in stable
//   Chrome on Android in 2024. Latest = "for_real" newest on the device.
// - iOS Safari 26+ on iPhone 15 Pro: WebGPU shipped in Safari 26.0. iOS 17
//   Safari does NOT expose `navigator.gpu` — BrowserStack must have a 26+
//   image for that target to be usable. We expose the preset but flag it.

export const TARGETS = {
  macos: {
    label: "macOS Sequoia · Chrome 148",
    worker: {
      browser: "chrome",
      browser_version: "148.0",
      os: "OS X",
      os_version: "Sequoia",
      resolution: "1920x1080",
    },
    webgpu: "supported",
    firstProgressMs: 90_000,
    notes: "Reference desktop. Apple M2 base.",
  },
  "s25-ultra": {
    // For the /5/worker JS-testing API `browser` selects the browser; on real
    // Android it must be "chrome" to launch Chrome. The earlier
    // `browser:"android"` form launched the device default browser (BrowserStack
    // labels the session "Android Browser" regardless of what runs), which is
    // why prior runs produced no telemetry. `browserName` is a W3C/Selenium key
    // and is ignored by /5/worker.
    // NOTE (2026-05-30): real-Android Chrome on BrowserStack exposes
    // `navigator.gpu` but `requestAdapter()` returns null (no WebGPU adapter in
    // the device GPU sandbox), so the GPU MSM bench cannot run here. Re-confirm
    // with `dev/msm-webgpu/probe.html` before spending a seat on a bench run.
    label: "Galaxy S25 Ultra · Android 15 · Chrome",
    worker: {
      browser: "chrome",
      os: "android",
      os_version: "15.0",
      device: "Samsung Galaxy S25 Ultra",
      real_mobile: "true",
    },
    webgpu: "navigator.gpu present, requestAdapter null (no adapter on BS)",
    firstProgressMs: 150_000,
    notes: "Snapdragon 8 Elite · Adreno 830.",
  },
  s24: {
    label: "Galaxy S24 · Android 14 · Chrome",
    worker: {
      browser: "chrome",
      os: "android",
      os_version: "14.0",
      device: "Samsung Galaxy S24",
      real_mobile: "true",
    },
    webgpu: "navigator.gpu present, requestAdapter null (no adapter on BS)",
    firstProgressMs: 150_000,
    notes: "Snapdragon 8 Gen 3 · Adreno 750. Less contended than S25.",
  },
  "pixel-9-pro-xl": {
    label: "Pixel 9 Pro XL · Android 15 · Chrome",
    worker: {
      browser: "chrome",
      os: "android",
      os_version: "15.0",
      device: "Google Pixel 9 Pro XL",
      real_mobile: "true",
    },
    webgpu: "supported",
    firstProgressMs: 150_000,
    notes: "Tensor G4 · Mali.",
  },
  "iphone-15-pro": {
    label: "iPhone 15 Pro · iOS 26 · Safari",
    worker: {
      browser: "iphone",
      browserName: "safari",
      os: "ios",
      os_version: "26",
      device: "iPhone 15 Pro",
      real_mobile: "true",
    },
    webgpu: "needs-ios-26-or-newer",
    firstProgressMs: 180_000,
    notes:
      "Requires iOS 26+ Safari for WebGPU. BS may not have a 26 image yet.",
  },
};

export function listTargets() {
  return Object.entries(TARGETS).map(([k, v]) => ({
    key: k,
    label: v.label,
    webgpu: v.webgpu,
    notes: v.notes ?? "",
  }));
}

export function buildWorkerBody(targetKey, url, { name, build, timeoutSec }) {
  const t = TARGETS[targetKey];
  if (!t) {
    throw new Error(
      `unknown --target ${targetKey}. Known: ${Object.keys(TARGETS).join(", ")}`,
    );
  }
  return {
    ...t.worker,
    url,
    timeout: timeoutSec,
    name,
    build,
  };
}
