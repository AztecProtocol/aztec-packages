// Generates the dark-mode SVGs specific to MSM_ALGO.md:
//   msm_math_flow.svg          — the windowed-Pippenger algebra as a flow
//   msm_chonk_integration.svg  — where an MSM is delegated inside a Chonk prove
//   msm_booth_windows.svg      — bit-level worked example of the Booth recoding
//   msm_scalar_shapes.svg      — work-share heatmap of a real prove's scalar shapes
//   msm_window_matrix.svg      — one window's digits as a sparse matrix + column fold
// The pipeline / bridge / tensor-cube figures MSM_ALGO.md also uses are the
// existing ones from gen_wgpu_diagrams.mjs / tensor_cube.tex — not regenerated
// here. Run: `node gen_msm_algo_diagrams.mjs`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ARROW,
  ARROW_ACCENT,
  BG,
  MUT,
  SANS,
  V,
  arrow,
  bgRect,
  bulletList,
  card,
  heading,
  placeTex,
  plain,
  poly,
  push,
  region,
  reset,
  svg,
  texBullet,
  texPill,
  title,
} from './diagram_kit.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));

// ============================================================ DIAGRAM 1
// The math: one MSM as a sequence of algebraic rewrites, each stage a single
// box holding its typeset description + governing identity, with a running
// "how many of these" sizing column on the right. All math (captions and
// equations) is typeset LaTeX, matching MSM_ALGO.md's notation.
function mathFlow() {
  reset();
  const W = 1180,
    H = 1028;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.purple.s, V.amber.s, V.teal.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'The windowed-Pippenger MSM, as algebra',
    'Each stage rewrites the sum into a cheaper shape; description and identity are typeset in the doc’s notation.',
  );

  const spineX = 248,
    spineW = 566,
    cX = spineX + spineW / 2;

  // One combined stage box: mono tag (top), a sans+math caption, and the hero
  // identity below it — all in one card, no separate equation pill.
  const H0 = 96;
  const stage = (y, { n, tag, variant, caption, tex, texEx = 9 }) => {
    const c = card(spineX, y, spineW, H0, { tag: (n != null ? n + ' · ' : '') + tag, variant, lines: [''] });
    if (caption) placeTex(cX, y + 50, caption, { color: MUT, ex: 6, maxW: spineW - 46 });
    if (tex) placeTex(cX, y + H0 - 24, tex, { color: variant.t, ex: texEx, maxW: spineW - 46 });
    return c;
  };

  // right-hand sizing column
  region(880, 96, 300, 430, { label: 'BN254 sizing (Chonk band)', color: V.slate });
  const szY = [150, 222, 294, 366, 438];
  texBullet(896, szY[0], '\\lambda = 254', 'scalar & base-field width (bits)', V.teal.s);
  texBullet(896, szY[1], 'c \\in \\{8,\\dots,15\\}', 'window width pickC(n); 8–13 in band', V.teal.s);
  texBullet(896, szY[2], 'T = \\lceil \\lambda / c \\rceil', 'windows: ≈ 20–32 in the Chonk band', V.teal.s);
  texBullet(896, szY[3], 'B = 2^{c-1}', 'signed buckets / window: 128–4096', V.teal.s);
  texBullet(896, szY[4], 'n = 2^{14}\\,\\dots\\,2^{20}', 'input pairs (Pᵢ, sᵢ)', V.teal.s);
  region(880, 552, 300, 452, { label: 'cost, per stage', color: V.slate });
  bulletList(
    896,
    596,
    [
      ['decompose', 'T·n signed digits — O(n) parallel'],
      ['bucket', 'group n points into T·B buckets'],
      ['accumulate', 'Σ points/bucket: ⌈log₂N⌉ add-levels'],
      ['reduce', 'T suffix sums of B buckets each'],
      ['combine', 'T−1 doublings-by-c + T adds'],
    ],
    68,
    V.blue.s,
  );

  // spine — seven combined boxes, connected by long thin arrows
  const boxes = [
    stage(98, {
      tag: 'input — the multi-scalar multiplication',
      variant: V.slate,
      caption: '\\textsf{a commitment: } n \\textsf{ SRS points } P_i \\textsf{ and } n \\textsf{ scalars } s_i',
      tex: 'S = \\sum_i [s_i]\\, P_i',
    }),
    stage(234, {
      n: 1,
      tag: 'window the scalars',
      variant: V.green,
      caption:
        '\\textsf{split each } s_i \\textsf{ into } T \\textsf{ digits of } c \\textsf{ bits; the sum factors per window}',
      tex: 's_i = \\sum_j s_{i,j}\\, 2^{jc} \\;\\Rightarrow\\; S = \\sum_j 2^{jc} W_j',
    }),
    stage(370, {
      n: 2,
      tag: 'signed-Booth recode',
      variant: V.green,
      caption:
        '\\textsf{carry-free: } c \\textsf{ bits} + 1 \\textsf{ lookback bit off } s_i \\textsf{; a negative digit adds } {-}P_i',
      tex: 's_{i,j} \\in [-2^{c-1},\\, 2^{c-1}], \\quad k = |s_{i,j}|',
    }),
    stage(506, {
      n: 3,
      tag: 'accumulate buckets',
      variant: V.blue,
      caption: '\\textsf{per window, sum the points that share a digit magnitude } k',
      tex: 'B_{j,k} = \\sum_{s_{i,j}=k} P_i \\;-\\; \\sum_{s_{i,j}=-k} P_i',
    }),
    stage(642, {
      n: 4,
      tag: 'weight the buckets (suffix sum)',
      variant: V.blue,
      caption: '\\textsf{a running suffix sum turns } B \\textsf{ scalar-weights into } B \\textsf{ additions}',
      tex: 'W_j = \\sum_k k\\, B_{j,k} = \\sum_k \\sum_{\\ell \\ge k} B_{j,\\ell}',
    }),
    stage(778, {
      n: 5,
      tag: 'Horner-combine the windows',
      variant: V.purple,
      caption:
        '\\textsf{fold high}\\to\\textsf{low, one } {\\times}\\, 2^{c} \\textsf{ per step, inversion-free in Jacobian}',
      tex: 'S = \\sum_j 2^{jc} W_j',
    }),
    stage(914, {
      tag: 'output — the commitment',
      variant: V.slate,
      caption: '\\textsf{returned to the prover as one affine point}',
      tex: 'S \\in \\mathbb{G}_1',
    }),
  ];
  for (let i = 0; i < boxes.length - 1; i++) {
    arrow(boxes[i].bot, boxes[i + 1].top, { color: ARROW, width: 1.6, head: 'small' });
  }

  // the affine-add primitive callout, tied to step 3 (accumulate)
  const prim = card(34, 476, 190, 200, {
    tag: 'the primitive',
    variant: V.amber,
    lines: ['every bucket sum is', 'a batched affine add:'],
  });
  placeTex(
    prim.cx,
    582,
    '\\begin{aligned} \\mu &= \\tfrac{y_2 - y_1}{x_2 - x_1} \\\\[2pt] x_3 &= \\mu^2 - x_1 - x_2 \\\\[2pt] y_3 &= \\mu(x_1 - x_3) - y_1 \\end{aligned}',
    { color: V.amber.t, ex: 7.5, display: true, maxW: 156 },
  );
  plain(prim.x + 16, 638, 'the ÷ is one inverse,', { color: MUT, size: 11 });
  plain(prim.x + 16, 654, 'shared over the pairs.', { color: MUT, size: 11 });
  arrow(prim.right, { x: spineX, y: boxes[3].cy }, { color: V.amber.s, dashed: true, width: 1.6, head: 'small' });

  fs.writeFileSync(`${OUT}/msm_math_flow.svg`, svg(W, H, colors));
  console.log('wrote msm_math_flow.svg');
}

// ============================================================ DIAGRAM 2
// Integration: how one Chonk commit's MSM is routed. Left = one-time browser
// wiring; center = the per-MSM delegation decision in C++; right = the two
// destinations (GPU pipeline vs native Pippenger).
function chonkIntegration() {
  reset();
  const W = 1280,
    H = 812;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.amber.s, V.red.s, V.purple.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'Integrating the MSM into Chonk — one commit, one routing decision',
    'bb.js wires the bridge once at init; thereafter every CommitmentKey MSM is gated to the GPU or falls back to the native Pippenger.',
  );

  // --- one-time setup band (top) ---
  region(34, 78, 1212, 116, {
    label: 'one-time — bb.js init (browser worker + main thread)',
    color: V.purple,
    dash: false,
  });
  const w1 = card(52, 110, 286, 66, {
    tag: 'setupWebGpuMsmBridge(worker)',
    variant: V.purple,
    lines: ['main thread: create GPUDevice +', 'WebGpuMsmHost · post control SAB'],
  });
  const w2 = card(352, 110, 232, 66, {
    tag: 'installWorkerStub',
    variant: V.purple,
    lines: ['worker: env-imports for', 'bb_external_(batch_)msm_bn254'],
  });
  const w3 = card(598, 110, 286, 66, {
    tag: 'bb_set_webgpu_msm_enabled(1)',
    variant: V.purple,
    lines: ['flips the runtime gate on', '(gated on navigator.gpu)'],
  });
  const w4 = card(898, 110, 332, 66, {
    tag: 'webgpu_register_full_srs_bn254',
    variant: V.purple,
    lines: ['CommitmentKey publishes a 2¹⁸-pt SRS prefix,', 'GPU→Montgomery once, doubling-grown as needed'],
  });
  arrow(w1.right, w2.left, { color: V.purple.s, width: 1.4 });
  arrow(w2.right, w3.left, { color: V.purple.s, width: 1.4 });
  arrow(w3.right, w4.left, { color: V.purple.s, width: 1.4 });

  // --- per-MSM call path (left column) ---
  region(34, 214, 326, 566, { label: 'Chonk prove — worker (WASM)', color: V.amber, dash: false });
  const c1 = card(52, 250, 292, 60, {
    tag: 'ClientIVC prove',
    variant: V.amber,
    lines: ['~11 circuits · Mega + ECCVM + Translator'],
  });
  const c2 = card(52, 336, 292, 60, {
    tag: 'CommitmentKey::batch_commit',
    variant: V.amber,
    lines: ['~91 MSMs / proof, batched ~10 at a time'],
  });
  const c3 = card(52, 422, 292, 64, {
    tag: 'MSM<BN254>::batch_multi_scalar_mul',
    tagSize: 12,
    variant: V.amber,
    lines: ['the single delegation point'],
  });
  arrow(c1.bot, c2.top, { color: V.amber.s });
  arrow(c2.bot, c3.top, { color: V.amber.s });

  // --- the gate (center) ---
  const gate = card(410, 250, 366, 236, {
    tag: 'delegate to WebGPU?',
    star: true,
    tagSize: 14,
    variant: V.blue,
    lines: [
      'ALL must hold, else native Pippenger:',
      '',
      '• curve = BN254   (WASM hook TU)',
      '• runtime gate enabled',
      '• !handle_edge_cases  (commits qualify:',
      '   SRS points are independent)',
      '• n ≥ threshold  (default 2¹⁴)',
      '• points are an SRS prefix (range-checked)',
      '• label not on the block-list',
    ],
  });
  arrow(c3.right, gate.left, { color: ARROW_ACCENT, width: 2 });

  const gy = gate.bot.y;
  // yes → bridge → GPU
  const bridge = card(410, 548, 366, 70, {
    tag: 'C++ ↔ GPU bridge',
    variant: V.green,
    lines: ['marshal scalars (LE) → SAB + shared heap', 'postMessage · Atomics.wait (worker parks)'],
  });
  const gpu = card(410, 648, 366, 78, {
    tag: 'MsmV2 / BatchMsmV2  (main thread GPU)',
    tagSize: 12.5,
    variant: V.green,
    lines: ['the compute pipeline · per-window sums W_j', 'Atomics.notify wakes the worker'],
  });
  arrow(gate.bot, bridge.top, { color: V.green.s, width: 2, label: 'yes', lx: gate.cx, ly: gy + 22 });
  arrow(bridge.bot, gpu.top, { color: V.green.s });

  // no → native
  const nativeBox = card(852, 322, 372, 92, {
    tag: 'native affine/Jacobian Pippenger',
    variant: V.red,
    lines: [
      'in-tree multithreaded WASM MSM · same result',
      'n < 2¹⁴, edge-case callers, off-SRS, blocked labels',
      'and every non-BN254 / non-browser build',
    ],
  });
  poly(
    [
      { x: gate.right.x, y: gate.cy - 40 },
      { x: 814, y: gate.cy - 40 },
      { x: 814, y: nativeBox.cy },
      { x: nativeBox.left.x, y: nativeBox.cy },
    ],
    { color: V.red.s, width: 2, label: 'no', lx: 800, ly: gate.cy - 40 },
  );

  // combine (both paths converge) → back into prove
  const combine = card(852, 548, 372, 92, {
    tag: 'combine_windows — native bb::g1',
    variant: V.blue,
    lines: ['de-Montgomery the T window sums, then Horner-fold:'],
  });
  placeTex(combine.cx, 617, 'S = \\sum_j 2^{jc} W_j \\quad(\\text{inversion-free Jacobian})', {
    color: V.blue.t,
    ex: 6.8,
    maxW: 344,
  });
  arrow(gpu.right, { x: combine.left.x, y: combine.cy }, { color: V.green.s, width: 2, elbow: 'h', mid: 0.5 });
  arrow(nativeBox.bot, combine.top, {
    color: V.red.s,
    dashed: true,
    width: 1.6,
    label: 'result',
    lx: nativeBox.cx,
    ly: 470,
  });
  poly(
    [
      { x: combine.right.x, y: combine.cy },
      { x: 1256, y: combine.cy },
      { x: 1256, y: 792 },
      { x: 46, y: 792 },
      { x: 46, y: c2.cy },
      { x: c2.left.x, y: c2.cy },
    ],
    { color: ARROW_ACCENT, dashed: true, width: 1.6, label: 'commitment → prove', lx: 700, ly: 792 },
  );

  fs.writeFileSync(`${OUT}/msm_chonk_integration.svg`, svg(W, H, colors));
  console.log('wrote msm_chonk_integration.svg');
}

// ============================================================ DIAGRAM 3
// Bit-level worked example of the carry-free signed-Booth recoding for s = 31.
// The teaching point is the shared amber bit (bit 2): it is window 0's sign
// bit AND window 1's lookback, so no carry propagates between windows.
function boothWindows() {
  reset();
  const W = 900,
    H = 590;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.amber.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'Signed-Booth recoding — the s = 31 worked example',
    "Each window's digit is its own c = 3 bits plus one lookback bit read off the scalar — so windows never wait on a carry.",
  );

  // --- bit strip: s = 31 = (011111)_2, drawn bit 5 … bit 0 ---
  const bit = [0, 1, 1, 1, 1, 1];
  const bnum = [5, 4, 3, 2, 1, 0];
  const cw = 58,
    ch = 60,
    ig = 10,
    wg = 118,
    x0 = 164,
    yb = 138;
  const cellX = i => x0 + i * (cw + ig) + (i >= 3 ? wg - ig : 0);
  placeTex((cellX(0) + cellX(5) + cw) / 2, yb - 44, 's = 31 = (011111)_2', { color: V.slate.t, ex: 8 });

  // window bands behind the cells (grouping, so it doesn't rely on cell colour)
  const band = (i0, i1, v) => {
    const L = cellX(i0) - 13,
      R = cellX(i1) + cw + 13;
    push(
      `<rect x="${L}" y="${yb - 10}" width="${R - L}" height="${ch + 20}" rx="15" fill="${v.f}" fill-opacity="0.5" stroke="${v.s}" stroke-dasharray="6 5"/>`,
    );
  };
  band(0, 2, V.blue);
  band(3, 5, V.green);

  for (let i = 0; i < 6; i++) {
    const x = cellX(i),
      b = bnum[i];
    const shared = b === 2; // bit 2: window 0's sign AND window 1's lookback
    const v = shared ? V.amber : b <= 2 ? V.green : V.blue;
    push(
      `<rect x="${x}" y="${yb}" width="${cw}" height="${ch}" rx="10" fill="${shared ? v.f : BG}" stroke="${v.s}" stroke-width="${shared ? 2.6 : 1.5}"/>`,
    );
    plain(x + cw / 2, yb + ch / 2 + 11, String(bit[i]), {
      color: v.t,
      size: 31,
      weight: 700,
      anchor: 'middle',
      mono: true,
    });
    plain(x + cw / 2, yb - 20, 'bit ' + b, { color: MUT, size: 10.5, anchor: 'middle' });
  }
  // window labels on the outer edges (leave the centre clear for the fork)
  plain(cellX(0), yb + ch + 30, 'window j = 1  ·  bits 5–3', { color: V.blue.s, size: 12.5, weight: 700 });
  plain(cellX(5) + cw, yb + ch + 30, 'window j = 0  ·  bits 2–0', {
    color: V.green.s,
    size: 12.5,
    weight: 700,
    anchor: 'end',
  });

  // --- per-window recoding panels ---
  const py = 288,
    ph = 190;
  const p1 = card(100, py, 320, ph, { tag: 'window j = 1  (high)', variant: V.blue, lines: [''] });
  placeTex(p1.cx, py + 58, '\\mathrm{win}_1 = (011)_2 = 3', { color: MUT, ex: 7.5 });
  placeTex(p1.cx, py + 89, '{+}\\ \\text{lookback } \\mathrm{lb}_1 = 1 \\ (\\text{bit } 2)', {
    color: V.amber.t,
    ex: 7.5,
  });
  placeTex(p1.cx, py + 120, '\\mathrm{neg}_1 = 0 \\ \\ (\\text{from bit } 5)', { color: MUT, ex: 7.5 });
  placeTex(p1.cx, py + 158, 's_1 = +(3{+}1) = +4', { color: V.blue.t, ex: 9.5 });

  const p0 = card(480, py, 320, ph, { tag: 'window j = 0  (low)', variant: V.green, lines: [''] });
  placeTex(p0.cx, py + 58, '\\mathrm{win}_0 = (111)_2 = 7', { color: MUT, ex: 7.5 });
  placeTex(p0.cx, py + 89, '\\mathrm{lb}_0 = 0 \\ \\ (\\text{no window below})', { color: MUT, ex: 7.5 });
  placeTex(p0.cx, py + 120, '\\text{sign } \\mathrm{neg}_0 = 1 \\ (\\text{from bit } 2)', {
    color: V.amber.t,
    ex: 7.5,
  });
  placeTex(p0.cx, py + 158, 's_0 = -(2^3{-}7) = -1', { color: V.green.t, ex: 9.5 });

  // the shared amber bit (bit 2) forks into both roles
  const fx = cellX(3) + cw / 2,
    fy = 250;
  push(`<path d="M${fx},${yb + ch} L${fx},${fy}" stroke="${V.amber.s}" stroke-width="1.8" fill="none"/>`);
  push(`<circle cx="${fx}" cy="${fy}" r="4.2" fill="${V.amber.s}"/>`);
  poly(
    [
      { x: fx, y: fy },
      { x: p1.cx, y: fy },
      { x: p1.cx, y: py },
    ],
    {
      color: V.amber.s,
      dashed: true,
      width: 1.7,
      head: 'small',
      label: "window 1's lookback",
      lx: (fx + p1.cx) / 2,
      ly: fy - 11,
    },
  );
  poly(
    [
      { x: fx, y: fy },
      { x: p0.cx, y: fy },
      { x: p0.cx, y: py },
    ],
    {
      color: V.amber.s,
      dashed: true,
      width: 1.7,
      head: 'small',
      label: "window 0's sign",
      lx: (fx + p0.cx) / 2,
      ly: fy - 11,
    },
  );

  // reconstruction bar
  push(`<rect x="100" y="502" width="700" height="66" rx="12" fill="${V.slate.f}" stroke="${V.slate.s}"/>`);
  placeTex(450, 528, 's = s_0\\, 2^{0} + s_1\\, 2^{3} = -1 + 4 \\cdot 8 = 31 \\;\\checkmark', {
    color: V.slate.t,
    ex: 8.5,
  });
  plain(
    450,
    554,
    "window 0's borrow is repaid by window 1's lookback — every digit is computed independently, one GPU thread each.",
    {
      color: MUT,
      size: 11,
      anchor: 'middle',
    },
  );

  fs.writeFileSync(`${OUT}/msm_booth_windows.svg`, svg(W, H, colors));
  console.log('wrote msm_booth_windows.svg');
}

// ============================================================ DIAGRAM 4
// The shape of a real prove's MSM scalars: a 3×3 work-share heatmap over
// (sparsity × nonzero magnitude). Data from the MSM_PROFILE capture of one
// Chonk prove (deploy_schnorr flow, 659 MSMs): per-bin share of total MSM
// work + MSM count.
function scalarShapes() {
  reset();
  const W = 1180,
    H = 576;
  const colors = [ARROW, ARROW_ACCENT, V.amber.s, V.green.s, V.blue.s, V.purple.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'What a real prove asks the MSM kernel to do',
    "659 MSMs from one Chonk prove, binned by scalar shape; each cell = that bin's share of total MSM work.",
  );

  // rows: nonzero magnitude (top = mostly full-width), cols: sparsity
  const rows = [
    { label: ['mostly', 'full-width'], sum: '29%' },
    { label: ['mixed'], sum: '20%' },
    { label: ['mostly', 'small'], sum: '49%' },
  ];
  const cols = [
    { label: ['dense', '< 25% zeros'], sum: '46%' },
    { label: ['semi', '25–75% zeros'], sum: '29%' },
    { label: ['sparse', '≥ 75% zeros'], sum: '23%' },
  ];
  const cells = [
    [
      { p: 4, n: 28 },
      { p: 7, n: 37 },
      { p: 18, n: 39 },
    ],
    [
      { p: 1, n: 8 },
      { p: 18, n: 21 },
      { p: 1, n: 24 },
    ],
    [
      { p: 41, n: 234 },
      { p: 4, n: 61 },
      { p: 4, n: 37 },
    ],
  ];

  const gx = 210,
    gy = 158,
    cw = 176,
    ch = 106,
    gap = 8;
  const gridW = 3 * cw + 2 * gap,
    gridH = 3 * ch + 2 * gap;

  // axis titles
  plain(gx + gridW / 2, gy - 62, 'scalar sparsity (share of zero scalars) →', {
    color: MUT,
    size: 11.5,
    anchor: 'middle',
  });
  push(
    `<text x="${gx - 152}" y="${gy + gridH / 2}" font-family="${SANS}" font-size="11.5" fill="${MUT}" text-anchor="middle" transform="rotate(-90 ${gx - 152} ${gy + gridH / 2})">nonzero magnitude (share that is full 254-bit) →</text>`,
  );

  // column headers + column work-share totals underneath the grid
  cols.forEach((c, j) => {
    const x = gx + j * (cw + gap) + cw / 2;
    plain(x, gy - 34, c.label[0], { color: V.slate.t, size: 12.5, weight: 600, anchor: 'middle' });
    plain(x, gy - 18, c.label[1], { color: MUT, size: 10.5, anchor: 'middle' });
    plain(x, gy + gridH + 24, c.sum + ' of work', { color: MUT, size: 10.5, anchor: 'middle' });
  });
  // row headers + row totals on the right edge
  rows.forEach((r, i) => {
    const y = gy + i * (ch + gap) + ch / 2;
    r.label.forEach((ln, k) =>
      plain(gx - 16, y - 6 + 15 * k - (r.label.length - 1) * 4, ln, {
        color: V.slate.t,
        size: 12.5,
        weight: 600,
        anchor: 'end',
      }),
    );
    plain(gx + gridW + 16, y + 4, r.sum, { color: V.amber.t, size: 13, weight: 700 });
    plain(gx + gridW + 16, y + 20, 'of work', { color: MUT, size: 10 });
  });

  // cells — amber heat scaled by work share
  const pMax = 41;
  cells.forEach((row, i) =>
    row.forEach((c, j) => {
      const x = gx + j * (cw + gap),
        y = gy + i * (ch + gap);
      const heat = 0.06 + 0.72 * (c.p / pMax);
      const hot = c.p >= 18;
      push(
        `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="10" fill="${V.amber.s}" fill-opacity="${heat.toFixed(2)}" stroke="${hot ? V.amber.s : V.slate.s}" stroke-width="${hot ? 1.8 : 1}"/>`,
      );
      plain(x + cw / 2, y + ch / 2 + 2, `${c.p}%`, {
        color: hot ? '#fff2dc' : V.slate.t,
        size: c.p >= 18 ? 27 : 21,
        weight: 700,
        anchor: 'middle',
      });
      plain(x + cw / 2, y + ch / 2 + 26, `${c.n} MSMs`, {
        color: c.p >= 30 ? '#4a3812' : MUT,
        size: 10.5,
        anchor: 'middle',
      });
    }),
  );

  // the three scalar populations, tagged on their home cells
  const tag = (i, j, color, text, dark = false) => {
    const x = gx + j * (cw + gap),
      y = gy + i * (ch + gap);
    push(`<circle cx="${x + 13}" cy="${y + 15}" r="4" fill="${color.s}"/>`);
    plain(x + 23, y + 19, text, { color: dark ? '#4a3812' : color.t, size: 10.5, weight: 600 });
  };
  tag(0, 0, V.green, 'wires · z_perm');
  tag(2, 0, V.blue, 'tags · selectors · lookups', true);
  tag(2, 2, V.purple, 'translator masking band');

  // takeaway column
  const tx = 852;
  heading(tx, gy - 34, 'HOW TO READ IT', V.amber.s);
  const notes = [
    ['Only 29% of the work (top row) is the', 'uniform full-width regime a bucket', 'pipeline is happiest in.'],
    [
      '49% is mostly-small scalars — MsmV2',
      'still runs full 254-bit windows on',
      'them, so none of that is exploited.',
    ],
    ['The single biggest bin (41%) is dense', 'but small-valued: lookup counts,', 'tags, selector columns.'],
    ['This structure is what motivated the', 'masking / skew-split / compaction', 'experiments — MSM_IMPL.md §7.'],
  ];
  let ny = gy - 4;
  for (const lines of notes) {
    push(`<circle cx="${tx}" cy="${ny - 4}" r="3.5" fill="${V.amber.s}"/>`);
    lines.forEach((ln, k) => plain(tx + 16, ny + 16 * k, ln, { color: k ? MUT : V.slate.t, size: 11.5 }));
    ny += 16 * lines.length + 22;
  }

  fs.writeFileSync(`${OUT}/msm_scalar_shapes.svg`, svg(W, H, colors));
  console.log('wrote msm_scalar_shapes.svg');
}

// ============================================================ DIAGRAM 5
// One window's digits as a sparse matrix: fix window j, list each point's
// signed Booth digit, mark column |s_ij| in an n×B grid, and fold the
// highlighted bucket column (k=3, five points — the red column of the
// tensor-cube figure) up its pair tree. Bridges §1.3 (digits) → §1.6 (tensor).
function windowMatrix() {
  reset();
  const W = 1180,
    H = 744;
  const colors = [ARROW, ARROW_ACCENT, V.red.s, V.green.s, V.amber.s, V.teal.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'One window of digits, as a sparse matrix',
    "Fix a window j: each point's signed Booth digit names one bucket — row i marks column |s_ij|, the sign rides along.",
  );

  // The exact slice drawn in the tensor-cube figure: 20 rows, buckets 0..9,
  // row i occupied at column k = pattern[i]; the five k=3 rows are
  // i = 0, 3, 8, 11, 14. Signs are this figure's addition.
  const ks = [3, 8, 1, 3, 0, 7, 2, 9, 3, 6, 1, 3, 7, 0, 3, 2, 8, 6, 9, 4];
  const sg = [+1, -1, +1, -1, 0, +1, -1, +1, +1, -1, +1, +1, -1, 0, -1, +1, +1, +1, -1, +1];
  const B = 10,
    HL = 3; // highlighted bucket
  const gy = 168,
    rowH = 24;
  const labX = 84,
    digX = 152,
    mx = 246,
    colW = 42;

  // column headers + the M^(j) tag
  placeTex(mx + (B * colW) / 2 - colW / 2, gy - 78, 'M^{(j)}\\;\\in\\;\\{0,\\pm 1\\}^{\\,n\\times B}', {
    color: V.slate.t,
    ex: 8.5,
  });
  for (let k = 0; k < B; k++)
    placeTex(mx + k * colW, gy - 24, `${k}`, { color: k === HL ? V.red.t : MUT, ex: 7 });
  plain(mx + (B * colW) / 2 - colW / 2, gy - 44, 'bucket k', { color: MUT, size: 10, anchor: 'middle' });
  plain(labX, gy - 24, 'point', { color: MUT, size: 10, anchor: 'middle' });
  plain(digX, gy - 24, 'digit', { color: MUT, size: 10, anchor: 'middle' });

  // faint vertical guides so empty columns still read as columns
  for (let k = 0; k < B; k++)
    push(
      `<line x1="${mx + k * colW}" y1="${gy - 12}" x2="${mx + k * colW}" y2="${gy + (ks.length - 1) * rowH + 12}" stroke="${V.slate.s}" stroke-opacity="0.22"/>`,
    );
  // highlighted bucket column — the tensor figure's red column
  push(
    `<rect x="${mx + HL * colW - 17}" y="${gy - 14}" width="34" height="${ks.length * rowH + 2}" rx="8" fill="${V.red.s}" fill-opacity="0.10" stroke="${V.red.s}" stroke-width="1.5"/>`,
  );

  // rows: P_i label, digit, one mark per row at column |d|
  ks.forEach((k, i) => {
    const y = gy + i * rowH;
    const s0 = sg[i];
    placeTex(labX, y, `P_{${i}}`, { color: V.slate.t, ex: 6.5 });
    plain(digX, y + 3.5, s0 === 0 ? '0' : (s0 > 0 ? '+' : '−') + k, {
      color: s0 === 0 ? MUT : s0 > 0 ? V.green.s : V.red.s,
      size: 10.5,
      weight: s0 === 0 ? 500 : 700,
      anchor: 'middle',
      mono: true,
    });
    const cx = mx + k * colW;
    if (s0 === 0) {
      // digit 0 lands in bucket 0 — drawn muted; the weighting k·B_k zeroes it
      push(`<circle cx="${cx}" cy="${y}" r="7.5" fill="none" stroke="${V.slate.s}" stroke-width="1.4"/>`);
      plain(cx, y + 3.5, '0', { color: MUT, size: 10, anchor: 'middle' });
    } else {
      push(`<circle cx="${cx}" cy="${y}" r="7.5" fill="${(s0 > 0 ? V.green : V.red).s}"/>`);
      plain(cx, y + 3.5, s0 > 0 ? '+' : '−', { color: BG, size: 11, weight: 700, anchor: 'middle' });
    }
    push(
      `<line x1="${mx - colW / 2}" y1="${y}" x2="${mx + (B - 0.5) * colW}" y2="${y}" stroke="${V.slate.s}" stroke-opacity="0.18"/>`,
    );
  });
  plain(mx + (B * colW) / 2 - colW / 2, gy + ks.length * rowH + 12, 'exactly one nonzero per (point, window)', {
    color: MUT,
    size: 10.5,
    anchor: 'middle',
  });
  plain(mx + (B * colW) / 2 - colW / 2, gy + ks.length * rowH + 28, 'digit 0 → bucket 0, whose weight in W_j = Σ k·B_k is zero — never accumulated', {
    color: MUT,
    size: 10.5,
    anchor: 'middle',
  });

  // ── the highlighted column folds up its pair tree (the tensor's tree) ──
  const tx0 = 736,
    tw = 410;
  heading(tx0, gy - 52, `BUCKET k = ${HL} — THE TENSOR'S RED COLUMN`, V.red.s);
  const leaves = [
    { t: '+P_0', s: V.green },
    { t: '-P_3', s: V.red },
    { t: '+P_8', s: V.green },
    { t: '+P_{11}', s: V.green },
    { t: '-P_{14}', s: V.red },
  ];
  const ly = 600,
    lx = i => tx0 + 26 + i * ((tw - 52) / 4);
  const node = (x, y, latex, color, ex = 8) => {
    texPill(x, y, latex, { color, ex, padX: 11, minH: 26 });
    return { x, y };
  };

  // Montgomery batch inversion, once per level (§1.5): the inset spells the
  // trick; each dotted row below marks one batch of pair-adds sharing it.
  heading(tx0, 152, 'ONE BATCHED INVERSION PER LEVEL — §1.5', V.teal.s);
  texBullet(tx0, 182, '\\Delta_i = x_{2,i} - x_{1,i}', 'one denominator per pair-add at this level', V.teal.s, { ex: 7.5 });
  texBullet(
    tx0,
    218,
    '\\pi_m = \\Delta_1 \\cdots \\Delta_m,\\quad \\rho_m = \\pi_m^{-1}',
    "forward prefix products, then the level's ONLY inversion",
    V.teal.s,
    { ex: 7.5 },
  );
  texBullet(
    tx0,
    254,
    '\\Delta_i^{-1} = \\pi_{i-1}\\,\\rho_i,\\quad \\rho_{i-1} = \\rho_i\\,\\Delta_i',
    'peeled back out, pair by pair — no more inversions',
    V.teal.s,
    { ex: 7.5 },
  );

  // one dotted "batch" row per add-level, tagged with its single inversion
  for (const [dy, m] of [
    [-98, '2 pairs'],
    [-196, '1 pair'],
    [-294, '1 pair'],
  ]) {
    const y = ly + dy;
    push(
      `<line x1="${tx0 - 2}" y1="${y}" x2="${tx0 + tw}" y2="${y}" stroke="${V.teal.s}" stroke-opacity="0.45" stroke-dasharray="2 5"/>`,
    );
    plain(tx0 - 10, y - 8, m, { color: MUT, size: 9.5, anchor: 'end' });
    plain(tx0 - 10, y + 6, '1 inv', { color: V.teal.s, size: 10, weight: 700, anchor: 'end', mono: true });
  }

  const leafN = leaves.map((l, i) => node(lx(i), ly, l.t, l.s));
  const a = node((lx(0) + lx(1)) / 2, ly - 98, 'P_0 - P_3', V.amber);
  const b = node((lx(2) + lx(3)) / 2, ly - 98, 'P_8 + P_{11}', V.amber);
  const ab = node((a.x + b.x) / 2, ly - 196, '(P_0{-}P_3) + (P_8{+}P_{11})', V.amber);
  const root = node((ab.x + lx(4)) / 2, ly - 294, 'B_{j,3}', V.red, 9.5);
  const edge = (from, to, dashed = false) =>
    arrow(
      { x: from.x, y: from.y - 14 },
      { x: to.x, y: to.y + 15 },
      { color: dashed ? V.slate.s : V.amber.s, dashed, width: 1.6, head: 'small' },
    );
  edge(leafN[0], a);
  edge(leafN[1], a);
  edge(leafN[2], b);
  edge(leafN[3], b);
  edge(a, ab);
  edge(b, ab);
  edge(ab, root);
  edge(leafN[4], root, true);
  placeTex(tx0 + tw / 2, ly + 44, 'B_{j,3} = P_0 - P_3 + P_8 + P_{11} - P_{14}', { color: V.slate.t, ex: 8.5 });
  plain(tx0 + tw / 2, ly + 68, 'dashed edge = odd-count carry; in the kernel each', {
    color: MUT,
    size: 10,
    anchor: 'middle',
  });
  plain(tx0 + tw / 2, ly + 83, 'batch spans every bucket of every window at that level', {
    color: MUT,
    size: 10,
    anchor: 'middle',
  });

  fs.writeFileSync(`${OUT}/msm_window_matrix.svg`, svg(W, H, colors));
  console.log('wrote msm_window_matrix.svg');
}

mathFlow();
chonkIntegration();
boothWindows();
scalarShapes();
windowMatrix();
console.log('done');
