// Generates the three dark-mode architecture SVGs referenced by MSM_ALGO.md / MSM_IMPL.md
// (wgpu_branch_map / wgpu_bridge / wgpu_pipeline). Run: `node gen_wgpu_diagrams.mjs`.
// Attribute-based styling only (no <style>, scripts, or external refs) so they
// render identically as <img> on GitHub, VS Code preview, and any viewer.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const OUT = path.dirname(fileURLToPath(import.meta.url));

const BG = '#0b0e14',
  PANEL_STROKE = '#212a39',
  TXT = '#e6e9ef',
  MUT = '#9aa4b2';
const ARROW = '#6b7688',
  ARROW_ACCENT = '#8aa0c0';
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const V = {
  blue: { s: '#4b9fff', f: '#0e1c30', t: '#a9ccff' },
  green: { s: '#34d399', f: '#0c2620', t: '#7be9c0' },
  purple: { s: '#a78bfa', f: '#1b1633', t: '#c9bafd' },
  amber: { s: '#f5b544', f: '#271e10', t: '#fbd38d' },
  red: { s: '#f87171', f: '#2a1416', t: '#fca5a5' },
  teal: { s: '#2dd4bf', f: '#0c2422', t: '#69ecd7' },
  slate: { s: '#5a6683', f: '#12161f', t: '#c3ccdb' },
};

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// deliberately conservative widths (wider than Liberation/Arial/SFMono) so a
// heavier browser font still fits inside the box.
const tw = (s, fs, mono = false) => s.length * fs * (mono ? 0.635 : 0.58);
let P = [];
const push = s => P.push(s);

function markerDefs(colors) {
  let d = '<defs>';
  for (const c of colors) {
    const id = c.replace('#', '');
    // `ah<color>` = default head; `ahs<color>` = small head (arrow({head:'small'})).
    d += `<marker id="ah${id}" viewBox="0 0 12 12" refX="9.4" refY="6" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0.5,0.5 L12,6 L0.5,11.5 L4,6 Z" fill="${c}"/></marker>`;
    d += `<marker id="ahs${id}" viewBox="0 0 12 12" refX="9.4" refY="6" markerWidth="6.4" markerHeight="6.4" orient="auto-start-reverse"><path d="M0.5,0.5 L12,6 L0.5,11.5 L4,6 Z" fill="${c}"/></marker>`;
  }
  return d + '</defs>';
}
function bgRect(w, h) {
  push(`<rect x="0" y="0" width="${w}" height="${h}" fill="${BG}"/>`);
  push(`<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="16" fill="none" stroke="${PANEL_STROKE}"/>`);
}
function heading(x, y, text, color = MUT, size = 11.5, spacing = 2) {
  push(
    `<text x="${x}" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="700" letter-spacing="${spacing}" fill="${color}">${esc(text.toUpperCase())}</text>`,
  );
}
function plain(x, y, text, { color = MUT, size = 12.5, weight = 400, anchor = 'start', mono = false } = {}) {
  push(
    `<text x="${x}" y="${y}" font-family="${mono ? MONO : SANS}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${esc(text)}</text>`,
  );
}
function title(x, y, main, sub) {
  push(
    `<text x="${x}" y="${y}" font-family="${SANS}" font-size="17" font-weight="700" fill="${TXT}">${esc(main)}</text>`,
  );
  if (sub) push(`<text x="${x}" y="${y + 19}" font-family="${SANS}" font-size="12.5" fill="${MUT}">${esc(sub)}</text>`);
}
function region(x, y, w, h, { label, color = V.slate, dash = true } = {}) {
  push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${color.f}" fill-opacity="0.32" stroke="${color.s}"${dash ? ' stroke-dasharray="6 5"' : ''}/>`,
  );
  if (label) heading(x + 16, y + 22, label, color.s);
}
function card(x, y, w, h, { tag, lines = [], variant = V.blue, star = false, tagSize = 13.5, center = false } = {}) {
  push(
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="${variant.f}" stroke="${variant.s}" stroke-width="${star ? 2.2 : 1.4}"/>`,
  );
  if (!center) push(`<path d="M${x + 3},${y + 9} a6,6 0 0 1 5,-6 v${h - 6} a6,6 0 0 1 -5,-6 Z" fill="${variant.s}"/>`);
  const cx = center ? x + w / 2 : x + 16;
  const anchor = center ? ' text-anchor="middle"' : '';
  let ty = y + (lines.length ? 25 : Math.round(h / 2) + 5);
  push(
    `<text x="${cx}" y="${ty}"${anchor} font-family="${MONO}" font-size="${tagSize}" font-weight="600" fill="${variant.t}">${esc((star ? '★ ' : '') + tag)}</text>`,
  );
  ty += 18;
  for (const ln of lines) {
    push(`<text x="${cx}" y="${ty}"${anchor} font-family="${SANS}" font-size="11" fill="${MUT}">${esc(ln)}</text>`);
    ty += 16;
  }
  const PAD = center ? 16 : 30; // left inset (16) + comfortable right margin
  const need = tw((star ? '★ ' : '') + tag, tagSize, true) + PAD;
  if (need > w) console.warn(`  ! tag overflow "${tag}": ${Math.round(need)} > ${w}`);
  for (const ln of lines) {
    const n = tw(ln, 11) + PAD;
    if (n > w) console.warn(`  ! line overflow "${ln}": ${Math.round(n)} > ${w}`);
  }
  return {
    x,
    y,
    w,
    h,
    cx: x + w / 2,
    cy: y + h / 2,
    top: { x: x + w / 2, y },
    bot: { x: x + w / 2, y: y + h },
    left: { x, y: y + h / 2 },
    right: { x: x + w, y: y + h / 2 },
    tr: { x: x + w - 15, y: y + 15 },
  };
}
function labelPill(x, y, text, color = MUT) {
  const w = tw(text, 11) + 16;
  push(`<rect x="${x - w / 2}" y="${y - 9.5}" width="${w}" height="19" rx="9" fill="${BG}" stroke="${PANEL_STROKE}"/>`);
  push(
    `<text x="${x}" y="${y + 3.8}" font-family="${SANS}" font-size="11" fill="${color}" text-anchor="middle">${esc(text)}</text>`,
  );
}
function arrow(a, b, { color = ARROW, dashed = false, label, elbow, mid = 0.5, lx, ly, width = 1.9, head } = {}) {
  let d;
  if (elbow === 'v') {
    const my = a.y + (b.y - a.y) * mid;
    d = `M${a.x},${a.y} L${a.x},${my} L${b.x},${my} L${b.x},${b.y}`;
  } else if (elbow === 'h') {
    const mx = a.x + (b.x - a.x) * mid;
    d = `M${a.x},${a.y} L${mx},${a.y} L${mx},${b.y} L${b.x},${b.y}`;
  } else d = `M${a.x},${a.y} L${b.x},${b.y}`;
  const mk = head === 'small' ? 'ahs' : 'ah';
  push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${mk}${color.replace('#', '')})"/>`,
  );
  if (label) labelPill(lx ?? (a.x + b.x) / 2, ly ?? (a.y + b.y) / 2, label);
}
function poly(pts, { color = ARROW, dashed = false, label, lx, ly, width = 1.9, head } = {}) {
  const d = 'M' + pts.map(p => `${p.x},${p.y}`).join(' L');
  const mk = head === 'small' ? 'ahs' : 'ah';
  push(
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#${mk}${color.replace('#', '')})"/>`,
  );
  if (label) labelPill(lx, ly, label);
}
function stepDot(x, y, n, color = ARROW_ACCENT) {
  push(`<circle cx="${x}" cy="${y}" r="10.5" fill="${BG}" stroke="${color}" stroke-width="1.7"/>`);
  push(
    `<text x="${x}" y="${y + 4}" font-family="${SANS}" font-size="12" font-weight="700" fill="${color}" text-anchor="middle">${n}</text>`,
  );
}
function bulletList(x, y, items, dh, accent) {
  let cy = y;
  for (const [t, s] of items) {
    push(`<circle cx="${x}" cy="${cy - 4}" r="3.5" fill="${accent}"/>`);
    plain(x + 16, cy, t, { color: V.slate.t, size: 12.5, weight: 600, mono: true });
    plain(x + 16, cy + 16, s, { color: MUT, size: 11 });
    cy += dh;
  }
}
function svg(w, h, colors) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">` +
    markerDefs(colors) +
    P.join('') +
    '</svg>'
  );
}
function reset() {
  P = [];
}

// ============================================================ DIAGRAM 1
function branchMap() {
  reset();
  const W = 1140,
    H = 760;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.amber.s, V.red.s, V.teal.s, V.blue.s, V.purple.s];
  bgRect(W, H);
  title(
    34,
    44,
    'WebGPU-in-Chonk — branch & directory map',
    'Zac originals  →  Suyash port  →  MsmV2 / BatchMsmV2  →  canonical integration  →  sumcheck',
  );

  region(34, 80, 606, 118, { label: 'Zac Williamson — original experiments', color: V.purple });
  const zc = card(50, 112, 216, 68, {
    tag: 'zw/webgpu-compilation',
    lines: ['field-arith + pk inverse', 'shader codegen'],
    variant: V.purple,
  });
  const ze = card(272, 112, 192, 68, {
    tag: 'zw/…experiments-v2',
    lines: ['addition-schedule', 'combine'],
    variant: V.purple,
  });
  const zw = card(470, 112, 154, 68, {
    tag: 'zw/webgpu-msm',
    lines: ['clean squashed v2', '(parallel line)'],
    variant: V.purple,
  });
  arrow(zc.right, ze.left, { color: V.purple.s, width: 1.4 });
  arrow(ze.right, zw.left, { color: V.purple.s, width: 1.4 });

  const port = card(690, 108, 400, 74, {
    tag: 'sb/msm-webgpu',
    lines: ['the first port — WebGPU BN254 bridge + bb.js binding', '+ standalone MSM dev page  ·  shared trunk'],
    variant: V.blue,
  });
  arrow({ x: 640, y: 145 }, { x: port.left.x, y: 145 }, { color: ARROW, dashed: true, width: 1.6 });
  plain(665, 133, 'ported', { color: MUT, size: 10.5, anchor: 'middle' });

  const sy = 262;
  const b1 = card(120, sy, 250, 74, {
    tag: 'worktree-batch-msm-webgpu',
    lines: ['BatchMsmV2 — Tier-2 virtualised', 'B·W-window single-shader dispatch'],
    variant: V.green,
  });
  const b2 = card(443, sy, 262, 74, {
    tag: 'sb/investigate-wgpu-static',
    lines: ['static level-plan (closed-form)', 'correct · net e2e wash — parked'],
    variant: V.amber,
  });
  const b3 = card(766, sy, 272, 74, {
    tag: 'wip/move-bucket-walk-to-gpu',
    lines: ['f2cc: bucket walk on GPU', 'BROKEN correctness — parked'],
    variant: V.red,
  });
  arrow(port.bot, b1.top, { color: ARROW, elbow: 'v' });
  arrow(port.bot, b2.top, { color: ARROW, elbow: 'v' });
  arrow(port.bot, b3.top, { color: ARROW, elbow: 'v' });

  const canon = card(330, 410, 470, 82, {
    tag: 'sb/integrate-wgpu-msm',
    star: true,
    tagSize: 15,
    lines: [
      'CANONICAL — MsmV2/BatchMsmV2 wired into the Chonk browser prover',
      '+ multi-device WASM/WebGPU bench harness  ·  dir: zac-webgpu',
    ],
    variant: V.green,
  });
  arrow(
    b1.bot,
    { x: canon.cx - 120, y: canon.top.y },
    { color: V.green.s, elbow: 'v', width: 1.9, label: 'ancestor', lx: 250, ly: 378 },
  );
  arrow(
    b2.bot,
    { x: canon.cx, y: canon.top.y },
    { color: ARROW, dashed: true, elbow: 'v', label: 'findings feed back', lx: 565, ly: 378 },
  );

  const fresh = card(96, 560, 250, 74, {
    tag: 'sb/webgpu-msm-fresh',
    lines: ['clean 6-commit PR-ready spine', 'on a fresh merge-train base'],
    variant: V.blue,
  });
  arrow(canon.bot, fresh.top, { color: ARROW, elbow: 'v', mid: 0.42, label: 're-port for PR', lx: 230, ly: 527 });

  region(470, 528, 636, 196, { label: 'WebGPU sumcheck — exploration (parked)', color: V.teal });
  const sc = card(700, 560, 260, 66, {
    tag: 'sb/sumcheck-webgpu',
    lines: ['GPU-resident single-submission', 'sumcheck + on-GPU Fiat-Shamir'],
    variant: V.teal,
  });
  const scm = card(500, 654, 250, 58, {
    tag: 'sb/multipass-sumcheck-opt',
    lines: ['ping-pong multi-pass fold'],
    variant: V.teal,
  });
  const scs = card(770, 654, 300, 58, {
    tag: 'sb/skipping-sumcheck-webgpu',
    lines: ['band / compaction / uber-gate skip'],
    variant: V.teal,
  });
  arrow(
    canon.bot,
    { x: sc.cx, y: sc.top.y },
    { color: ARROW, elbow: 'v', mid: 0.6, label: 'next GPU target', lx: sc.cx, ly: 527 },
  );
  arrow(sc.bot, scm.top, { color: V.teal.s, elbow: 'v', width: 1.7 });
  arrow(sc.bot, scs.top, { color: V.teal.s, elbow: 'v', width: 1.7 });

  fs.writeFileSync(`${OUT}/wgpu_branch_map.svg`, svg(W, H, colors));
  console.log('wrote wgpu_branch_map.svg');
}

// ============================================================ DIAGRAM 2
function bridge() {
  reset();
  const W = 1240,
    H = 700;
  const colors = [ARROW, ARROW_ACCENT, V.amber.s, V.blue.s, V.green.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'The C++ ↔ GPU bridge — exact data movement across two threads',
    'The worker marshals a request into shared memory and parks; the main thread runs the GPU and writes results back. Amber = scalars in · green = results out · grey = control.',
  );

  region(32, 78, 306, 590, { label: 'Web Worker — WASM prover · blocks', color: V.amber, dash: false });
  region(467, 78, 306, 590, { label: 'Shared memory — SharedArrayBuffer', color: V.slate });
  region(902, 78, 306, 590, { label: 'Main thread — owns GPUDevice', color: V.blue, dash: false });

  // --- boxes (narrow; roomy 147px gutters on each side) ---
  const W1 = card(50, 128, 270, 92, {
    tag: 'webgpu_msm_hook.cpp',
    lines: ['marshal scalars → LE canonical', 'opcode · ptrs · srs_offset'],
    variant: V.amber,
  });
  const W2 = card(50, 306, 270, 74, {
    tag: 'worker_stub',
    lines: ['postMessage · Atomics.wait', '⏸ worker parks (UI stays live)'],
    variant: V.amber,
  });
  const W3 = card(50, 462, 270, 82, {
    tag: 'combine_windows (native)',
    lines: ['per-window sums → bb::g1', 'Horner fold → commitment'],
    variant: V.amber,
  });

  const SAB = card(485, 128, 270, 110, {
    tag: '16-slot control SAB',
    lines: ['opcode · ptrs · srs_offset', 'num_windows · c · SLOT_STATE'],
    variant: V.slate,
  });
  const HEAP = card(485, 316, 270, 176, {
    tag: 'shared WASM heap',
    lines: ['scalars · descriptors   (in)', 'per-window sums   (out)', 'zero-copy · both threads see it'],
    variant: V.slate,
  });

  const M1 = card(920, 128, 270, 92, {
    tag: 'WebGpuMsmHost',
    lines: ['handleMessage · read op', 'write meta · Atomics.notify'],
    variant: V.blue,
  });
  const M2 = card(920, 306, 270, 92, {
    tag: 'MsmV2 / BatchMsmV2',
    lines: ['GPU compute pipeline', 'queue.submit + mapAsync'],
    variant: V.green,
  });

  // --- REQUEST (upper half: worker → shared → main) ---
  arrow(
    { x: W1.right.x, y: 160 },
    { x: SAB.left.x, y: 160 },
    { color: ARROW, label: '1 · opcode + ptrs', lx: 402, ly: 148 },
  );
  arrow(
    { x: W1.right.x, y: 198 },
    { x: SAB.left.x, y: 352 },
    { color: V.amber.s, elbow: 'h', label: '2 · scalars → heap', lx: 402, ly: 292 },
  );
  arrow({ x: SAB.right.x, y: 160 }, { x: M1.left.x, y: 160 }, { color: ARROW, label: '3 · read op', lx: 838, ly: 148 });
  arrow(
    { x: HEAP.right.x, y: 352 },
    { x: M2.left.x, y: 340 },
    { color: V.amber.s, elbow: 'h', label: '4 · read scalars', lx: 838, ly: 330 },
  );

  // --- RESPONSE (lower half: main → shared → worker) ---
  arrow(
    { x: M2.left.x, y: 372 },
    { x: HEAP.right.x, y: 452 },
    { color: V.green.s, elbow: 'h', label: '5 · per-window sums', lx: 838, ly: 430 },
  );
  arrow(
    { x: M1.left.x, y: 200 },
    { x: SAB.right.x, y: 208 },
    { color: ARROW, elbow: 'h', label: '6 · meta + DONE', lx: 838, ly: 222 },
  );
  arrow(
    { x: HEAP.left.x, y: 452 },
    { x: W3.right.x, y: 500 },
    { color: V.green.s, elbow: 'h', label: '7 · results → combine', lx: 402, ly: 490 },
  );

  // --- wake signals routed around the outer margins (clear of all data) ---
  poly(
    [
      { x: W2.left.x, y: 343 },
      { x: 44, y: 343 },
      { x: 44, y: 112 },
      { x: 1130, y: 112 },
      { x: 1130, y: M1.top.y },
    ],
    { color: ARROW_ACCENT, dashed: true, label: 'postMessage → wake main', lx: 402, ly: 112 },
  );
  poly(
    [
      { x: M1.right.x, y: 190 },
      { x: 1196, y: 190 },
      { x: 1196, y: 622 },
      { x: 44, y: 622 },
      { x: 44, y: 362 },
      { x: W2.left.x, y: 362 },
    ],
    { color: ARROW_ACCENT, dashed: true, label: 'Atomics.notify → wake worker', lx: 402, ly: 622 },
  );

  fs.writeFileSync(`${OUT}/wgpu_bridge.svg`, svg(W, H, colors));
  console.log('wrote wgpu_bridge.svg');
}

// ============================================================ DIAGRAM 3
function pipeline() {
  reset();
  const W = 1180,
    H = 1046;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.purple.s, V.amber.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'The MsmV2 GPU pipeline — a cuZK-derived Pippenger MSM',
    'One BN254 MSM as WebGPU compute passes: Booth recode → counting-sort transpose → pair-tree accumulate → bucket reduction → Horner combine.',
  );

  const spineX = 470,
    spineW = 320,
    cX = spineX + spineW / 2;

  const pool = card(60, 96, 320, 78, {
    tag: 'SRS pool — once per session',
    variant: V.purple,
    lines: ['convert_points_only', 'canonical → 8×u32 Montgomery poolX/poolY'],
  });

  region(60, 210, 320, 150, { label: 'prepare() — untimed · identity-cached', color: V.amber });
  const hist = card(78, 244, 284, 54, {
    tag: 'bucket_histogram',
    variant: V.amber,
    lines: ['signed-Booth counts → host readback'],
  });
  const plan = card(78, 306, 284, 44, { tag: 'host per-level plan walk', variant: V.amber });
  arrow(hist.bot, plan.top, { color: V.amber.s, head: 'small' });

  region(446, 210, 396, 720, { label: 'run() — timed · one submit', color: V.blue });

  let y = 250;
  const gap = 32;
  const d = card(spineX, y, spineW, 58, {
    tag: 'decompose_scalars_booth',
    variant: V.green,
    lines: ['carry-free signed-Booth · bucket+sign / pair'],
  });
  y += 58 + gap;

  const tB = y;
  region(spineX - 8, tB, spineW + 16, 92, { label: 'transpose — tiled counting sort', color: V.slate });
  const mw = (spineW - 8 - 30) / 4;
  const tn = ['count', 'reduce', 'scan', 'scatter'];
  const tb = tn.map((n, i) =>
    card(spineX + 4 + i * (mw + 10), tB + 34, mw, 44, { tag: n, variant: V.green, tagSize: 11.5, center: true }),
  );
  for (let i = 0; i < 3; i++) arrow(tb[i].right, tb[i + 1].left, { color: V.green.s, width: 1.6, head: 'small' });
  y = tB + 92 + gap;

  const csr = card(spineX, y, spineW, 58, {
    tag: 'csr_to_v2',
    variant: V.green,
    lines: ['active_sums (bucket-major) + planner meta'],
  });
  y += 58 + gap;

  const pY = y;
  region(spineX - 8, pY, spineW + 16, 196, { label: 'pair-tree bucket accumulate — per level', color: V.slate });
  const pl = card(spineX + 8, pY + 34, spineW - 16, 46, {
    tag: 'planner: offsets + emit',
    variant: V.green,
    lines: ['bin-pack pairs'],
  });
  const fused = card(spineX + 8, pY + 90, spineW - 16, 48, {
    tag: 'ba_fused_super',
    variant: V.green,
    lines: ['batch affine-add · 1 inverse / S pairs'],
  });
  const cf = card(spineX + 8, pY + 148, spineW - 16, 34, {
    tag: 'carry_copy + finalize',
    variant: V.green,
    tagSize: 12.5,
  });
  arrow(pl.bot, fused.top, { color: V.green.s, width: 1.6, head: 'small' });
  arrow(fused.bot, cf.top, { color: V.green.s, width: 1.6, head: 'small' });
  poly(
    [
      { x: fused.left.x, y: fused.cy },
      { x: 452, y: fused.cy },
      { x: 452, y: pl.cy },
      { x: pl.left.x, y: pl.cy },
    ],
    { color: ARROW_ACCENT, width: 1.6, head: 'small', label: '× levels', lx: 420, ly: (pl.cy + fused.cy) / 2 },
  );
  y = pY + 196 + gap;

  const red = card(spineX, y, spineW, 58, {
    tag: 'reduce_init + reduce_level',
    variant: V.green,
    lines: ['branchless per-window suffix sum  Σ k·Bₖ'],
  });
  y += 58 + gap;
  const gather = card(spineX, y, spineW, 46, { tag: 'gather window sums → staging', variant: V.blue });
  y += 46 + gap;

  arrow(d.bot, { x: cX, y: tB }, { color: V.green.s, head: 'small' });
  arrow({ x: cX, y: tB + 92 }, csr.top, { color: V.green.s, head: 'small' });
  arrow(csr.bot, { x: cX, y: pY }, { color: V.green.s, head: 'small' });
  arrow({ x: cX, y: pY + 196 }, red.top, { color: V.green.s, head: 'small' });
  arrow(red.bot, gather.top, { color: V.green.s, head: 'small' });

  // both inputs to decompose converge on the same point on its left edge
  arrow(
    pool.right,
    { x: d.left.x, y: d.cy },
    {
      color: V.purple.s,
      dashed: true,
      head: 'small',
      label: 'SRS points',
      lx: 425,
      ly: 205,
    },
  );
  arrow(
    plan.right,
    { x: d.left.x, y: d.cy },
    {
      color: V.amber.s,
      dashed: true,
      head: 'small',
      label: 'plan',
      lx: 410,
      ly: 300,
    },
  );

  const comb = card(410, gather.bot.y + 24, 440, 62, {
    tag: 'combine_windows — native bb::g1',
    variant: V.blue,
    lines: ['Horner fold  S = Σⱼ Wⱼ · 2^(j·c)  in inversion-free Jacobian'],
  });
  arrow(gather.bot, comb.top, { color: V.blue.s, head: 'small' });

  region(862, 210, 286, 300, { label: 'field arithmetic', color: V.slate });
  bulletList(
    878,
    252,
    [
      ['20 × 13-bit limbs', 'canonical Fp · Barrett in point-convert only'],
      ['8 × u32 “live form”', 'inside fused / reduce kernels'],
      ['Karatsuba + Yuval', 'register-light Montgomery multiply'],
      ['safegcd (pk)', 'Bernstein–Yang inverse · 1 per S-pair block'],
      ['Montgomery batched', 'prefix-product → 1 inverse amortized'],
    ],
    52,
    V.green.s,
  );

  region(862, 528, 286, 402, { label: 'lifecycle · caching', color: V.slate });
  bulletList(
    878,
    576,
    [
      ['MsmV2Pool.create()', 'SRS upload + Montgomery convert, once'],
      ['MsmV2.create(n)', 'compile ~17 pipelines (cached)'],
      ['prepare()', 'histogram + plan · ~1 ms fast / ~150 ms slow'],
      ['run()', 'encode → submit → mapAsync → combine'],
    ],
    74,
    V.blue.s,
  );

  fs.writeFileSync(`${OUT}/wgpu_pipeline.svg`, svg(W, H, colors));
  console.log('wrote wgpu_pipeline.svg');
}

branchMap();
bridge();
pipeline();
console.log('done');
