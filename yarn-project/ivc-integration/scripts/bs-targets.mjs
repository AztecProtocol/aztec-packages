// BrowserStack capability presets for the headless Chonk e2e WebGPU prove matrix.
//
// Self-contained copy of barretenberg/ts/dev/msm-webgpu/scripts/bs-targets.mjs (the
// repo already duplicates this between wasm-bench and msm-webgpu); a local copy keeps
// the chonk runner from cross-importing across the bb/yarn-project boundary. The two
// extra fields here vs the msm copy — `firstProgressMs` and `deadlineMs` — are sized
// for a full Chonk prove (multi-thread WASM compile + SRS load + one or two
// minutes-long proves) rather than a sub-second MSM, and a `windows` preset is added.
//
// WebGPU support matrix (as of 2026-06):
// - macOS Tahoe/Sequoia · Chrome: WebGPU GA since Chrome 113.
// - Windows 11 · Chrome: WebGPU GA (D3D12 backend).
// - Android Chrome (S25 Ultra, Pixel 9 Pro XL): WebGPU shipped in stable Chrome on
//   Android in 2024.
// - iOS Safari 26+ on iPhone 15 Pro: WebGPU shipped in Safari 26.0. iOS < 26 does NOT
//   expose `navigator.gpu`, so this target is best-effort — it reports no-webgpu (and
//   the prove falls back to all-CPU) if BrowserStack lacks a 26+ image.

export const TARGETS = {
  macos: {
    label: 'macOS Sequoia · Chrome 148',
    worker: {
      browser: 'chrome',
      browser_version: '148.0',
      os: 'OS X',
      os_version: 'Sequoia',
      resolution: '1920x1080',
    },
    webgpu: 'supported',
    firstProgressMs: 150_000,
    deadlineMs: 1_500_000,
    notes: 'Reference laptop. Apple M2 base, Metal backend.',
  },
  windows: {
    label: 'Windows 11 · Chrome 148',
    worker: {
      browser: 'chrome',
      browser_version: '148.0',
      os: 'Windows',
      os_version: '11',
      resolution: '1920x1080',
    },
    webgpu: 'supported',
    firstProgressMs: 150_000,
    deadlineMs: 1_500_000,
    notes: 'Reference Windows laptop. D3D12 backend; GPU depends on the BS host.',
  },
  's25-ultra': {
    label: 'Galaxy S25 Ultra · Android 15 · Chrome',
    worker: {
      browser: 'android',
      browserName: 'chrome',
      os: 'android',
      os_version: '15.0',
      device: 'Samsung Galaxy S25 Ultra',
      real_mobile: 'true',
    },
    webgpu: 'supported',
    firstProgressMs: 300_000,
    deadlineMs: 2_400_000,
    notes: 'Snapdragon 8 Elite, Adreno. Heavy prove — may need a lighter flow.',
  },
  'pixel-9-pro-xl': {
    label: 'Pixel 9 Pro XL · Android 15 · Chrome',
    worker: {
      browser: 'android',
      browserName: 'chrome',
      os: 'android',
      os_version: '15.0',
      device: 'Google Pixel 9 Pro XL',
      real_mobile: 'true',
    },
    webgpu: 'supported',
    firstProgressMs: 300_000,
    deadlineMs: 2_400_000,
    notes: 'Tensor G4, Mali. Heavy prove — may need a lighter flow.',
  },
  'iphone-15-pro': {
    label: 'iPhone 15 Pro · iOS 26 · Safari',
    worker: {
      browser: 'iphone',
      browserName: 'safari',
      os: 'ios',
      os_version: '26',
      device: 'iPhone 15 Pro',
      real_mobile: 'true',
    },
    webgpu: 'needs-ios-26-or-newer',
    firstProgressMs: 300_000,
    deadlineMs: 2_400_000,
    notes: 'Requires iOS 26+ Safari for WebGPU. BS may not have a 26 image yet.',
  },
};

export function listTargets() {
  return Object.entries(TARGETS).map(([k, v]) => ({
    key: k,
    label: v.label,
    webgpu: v.webgpu,
    notes: v.notes ?? '',
  }));
}

export function buildWorkerBody(targetKey, url, { name, build, timeoutSec }) {
  const t = TARGETS[targetKey];
  if (!t) {
    throw new Error(`unknown target ${targetKey}. Known: ${Object.keys(TARGETS).join(', ')}`);
  }
  return {
    ...t.worker,
    url,
    timeout: timeoutSec,
    name,
    build,
  };
}
