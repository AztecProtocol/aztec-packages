// Generates the MSM_IMPL.md §8 operational SVGs (wgpu_bench_topology /
// wgpu_profiling_ladder). Run: `node gen_impl_diagrams.mjs`.
// Uses the shared dark-mode kit (attribute-based styling only, so the SVGs
// render identically as <img> on GitHub, VS Code preview, and any viewer).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  V,
  ARROW,
  ARROW_ACCENT,
  MUT,
  reset,
  svg,
  bgRect,
  title,
  region,
  card,
  arrow,
  plain,
  labelPill,
} from './diagram_kit.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));

// ---- §8.1 multi-device bench topology ---------------------------------------
function benchTopology() {
  reset();
  const W = 960,
    H = 500;
  const colors = [ARROW, ARROW_ACCENT, V.blue.s, V.green.s, V.purple.s, V.slate.s];
  bgRect(W, H);
  title(24, 38, 'Multi-device bench — one command from the box', 'all four channels ride SSH tunnels the Mac opens');

  region(24, 78, 356, 396, { label: 'dev box — headless, no GPU', color: V.blue });
  const chonk = card(48, 118, 308, 56, {
    tag: 'chonk page :8080',
    lines: ['serve-chonk-webgpu.mjs · /results'],
    variant: V.blue,
  });
  const msm = card(48, 190, 308, 56, {
    tag: 'MSM page :5173',
    lines: ['vite · dev/msm-webgpu'],
    variant: V.blue,
  });
  const bench = card(48, 262, 308, 72, {
    tag: 'bench.mjs',
    lines: ['devices | probe | chonk | msm', 'watchdogs · report + history'],
    variant: V.green,
    star: true,
  });
  const adbc = card(48, 350, 308, 50, {
    tag: 'adb client (ADB_BIN)',
    variant: V.purple,
  });
  plain(48, 436, 'reports → /tmp/zac-webgpu/bench-*.md', { size: 11, mono: true });
  plain(48, 454, 'rows   → bench-history.jsonl', { size: 11, mono: true });

  region(576, 78, 360, 396, { label: 'Mac — real GPU, phones on USB', color: V.slate });
  const chrome = card(600, 118, 312, 56, {
    tag: 'debug Chrome :9222',
    lines: ['anti-occlusion flags required'],
    variant: V.slate,
  });
  const adbs = card(600, 190, 312, 50, {
    tag: 'adb server :5037',
    variant: V.purple,
  });
  region(600, 258, 312, 144, { label: 'phones (USB)', color: V.amber });
  const s23 = card(618, 296, 84, 44, { tag: 'S23', variant: V.red, center: true });
  const s26 = card(714, 296, 88, 44, { tag: 'S26U', variant: V.amber, center: true });
  const p10 = card(814, 296, 84, 44, { tag: 'Pixel10', variant: V.amber, center: true, tagSize: 11.5 });
  plain(618, 372, 'S23 = device-lost → GPU runs skip it', { size: 10.5 });
  plain(618, 388, 'threads=4–6 (16t WASM crashes phones)', { size: 10.5 });

  // channels
  arrow(bench.right, chrome.left, {
    color: V.slate.s,
    elbow: 'h',
    mid: 0.45,
    label: 'CDP · ssh -R 9222',
    lx: 468,
    ly: 208,
  });
  arrow(adbc.right, adbs.left, {
    color: V.purple.s,
    elbow: 'h',
    mid: 0.62,
    label: 'adb · ssh -R 5037',
    lx: 468,
    ly: 336,
  });
  arrow(adbs.bot, { x: adbs.bot.x, y: 296 }, { color: V.purple.s, label: 'am start ?autorun=', lx: 810, ly: 268 });
  arrow(chrome.left, chonk.right, {
    color: V.blue.s,
    dashed: true,
    elbow: 'h',
    mid: 0.55,
    label: 'pages · ssh -L 8080/5173',
    lx: 468,
    ly: 118,
  });
  arrow({ x: 618, y: 340 }, msm.right, {
    color: V.green.s,
    dashed: true,
    elbow: 'h',
    mid: 0.35,
    label: 'adb reverse → load page, POST /results',
    lx: 464,
    ly: 424,
  });
  labelPill(700, 56, '127.0.0.1 everywhere — localhost may hit ::1 and HANG', MUT);

  fs.writeFileSync(`${OUT}/wgpu_bench_topology.svg`, svg(W, H, colors));
  console.log('wrote wgpu_bench_topology.svg');
}

// ---- §8.2 profiling ladder ---------------------------------------------------
function profilingLadder() {
  reset();
  const W = 960,
    H = 312;
  const colors = [ARROW, ARROW_ACCENT, V.blue.s, V.teal.s, V.amber.s, V.red.s];
  bgRect(W, H);
  title(
    24,
    38,
    'Profiling ladder — coarse → fine',
    'descend a level only when the one above has localised the question',
  );

  const y = 96,
    h = 118,
    w = 213,
    xs = [24, 258, 492, 726];
  const c1 = card(xs[0], y, w, h, {
    tag: '1 · e2e phase trace',
    lines: ['perfetto_trace.ts', 'cdp-trace / attribution', '→ ui.perfetto.dev'],
    variant: V.blue,
    tagSize: 12.5,
  });
  const c2 = card(xs[1], y, w, h, {
    tag: '2 · per-pass GPU ns',
    lines: ['?autorun=msm-trace', 'passTimes, GPU clock', 'needs timestamp-query'],
    variant: V.teal,
    tagSize: 12.5,
  });
  const c3 = card(xs[2], y, w, h, {
    tag: '3 · workload shape',
    lines: ['MSM_PROFILE=1 (native)', '[msm-dist] hook mode', 'bucket-histogram stats'],
    variant: V.amber,
    tagSize: 12.5,
  });
  const c4 = card(xs[3], y, w, h, {
    tag: '4 · HW counters',
    lines: ['webgpu-gpu-trace (Zac)', 'AGI/gapit · Mac-side', 'Adreno / Mali ONLY'],
    variant: V.red,
    tagSize: 12.5,
  });
  arrow(c1.right, c2.left, { color: ARROW_ACCENT });
  arrow(c2.right, c3.left, { color: ARROW_ACCENT });
  arrow(c3.right, c4.left, { color: ARROW_ACCENT });

  labelPill(c1.cx, y + h + 24, 'which phase?', V.blue.t);
  labelPill(c2.cx, y + h + 24, 'which kernel?', V.teal.t);
  labelPill(c3.cx, y + h + 24, 'what inputs?', V.amber.t);
  labelPill(c4.cx, y + h + 24, 'WHY is it slow?', V.red.t);

  plain(
    24,
    H - 26,
    'L1 trap: WASM trace clocks can dilate — check span ≈ prove time before trusting per-phase numbers.',
    {
      size: 11,
    },
  );
  fs.writeFileSync(`${OUT}/wgpu_profiling_ladder.svg`, svg(W, H, colors));
  console.log('wrote wgpu_profiling_ladder.svg');
}

benchTopology();
profilingLadder();
