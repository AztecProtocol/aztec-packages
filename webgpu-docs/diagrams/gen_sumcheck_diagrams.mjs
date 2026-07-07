// Generates the dark-mode SVGs specific to SUMCHECK_ALGO.md:
//   sumcheck_math_flow.svg    — the sumcheck protocol as a flow of algebraic identities
//   sumcheck_gpu_round.svg    — one round as GPU passes, multi-pass vs single-submission
//   sumcheck_work_profile.svg — the geometric work profile and the hybrid GPU/WASM split
//   sumcheck_opt_map.svg      — every optimisation as a card, by status (landed/designed/dead)
//   sumcheck_skip_tiers.svg   — the skip-aware dispatch tiers on one relation
// Run: `node gen_sumcheck_diagrams.mjs` (MathJax comes from ../.build, shared
// with gen_msm_algo_diagrams.mjs).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ARROW,
  ARROW_ACCENT,
  MUT,
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
  title,
} from './diagram_kit.mjs';

const OUT = path.dirname(fileURLToPath(import.meta.url));

// ============================================================ DIAGRAM 1
// The protocol as algebra: a looped spine of the per-round identities, a Mega
// sizing column, a per-round cost column, and the Fr-multiply primitive callout.
function mathFlow() {
  reset();
  const W = 1180,
    H = 1028;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.purple.s, V.amber.s, V.teal.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'Sumcheck, as algebra',
    'Reduce “the batched relation vanishes on the whole trace” to one multilinear opening, one variable per round.',
  );

  const spineX = 248,
    spineW = 566,
    cX = spineX + spineW / 2;
  const H0 = 96;
  const stage = (y, { n, tag, variant, caption, tex, texEx = 9 }) => {
    const c = card(spineX, y, spineW, H0, { tag: (n != null ? n + ' · ' : '') + tag, variant, lines: [''] });
    if (caption) placeTex(cX, y + 50, caption, { color: MUT, ex: 6, maxW: spineW - 46 });
    if (tex) placeTex(cX, y + H0 - 24, tex, { color: variant.t, ex: texEx, maxW: spineW - 46 });
    return c;
  };

  // right-hand sizing column
  region(880, 96, 300, 396, { label: 'Mega sizing', color: V.slate });
  const szY = [150, 218, 286, 354, 422];
  texBullet(896, szY[0], 'N = 67', 'entities: 62 physical + 5 shift views', V.teal.s);
  texBullet(896, szY[1], 'K = 63', 'subrelations across 14 relations', V.teal.s);
  texBullet(896, szY[2], '\\deg \\tilde S^i = 7', 'sent as 8 evaluations per round', V.teal.s);
  texBullet(896, szY[3], 'n = 2^d,\\; d \\approx 14\\!-\\!17', 'trace rows / rounds (Chonk band)', V.teal.s);
  texBullet(896, szY[4], '\\alpha,\\ \\vec\\beta,\\ u_i', 'all challenges from one Poseidon2 transcript', V.teal.s);
  region(880, 518, 300, 486, { label: 'cost, per round', color: V.slate });
  bulletList(
    896,
    562,
    [
      ['accumulate', 'O(n) — ~1,817 Fr muls per edge, dense'],
      ['reduce', 'edge sums → 345-entry accumulator'],
      ['batch + hash', 'O(1) — 8 evals, ~3 Poseidon2 perms'],
      ['fold', 'O(n) — 67 columns halve'],
      ['total', 'geometric: round 0 = ½ of all work'],
      ['verifier', 'O(1)/round + one final relation eval'],
    ],
    68,
    V.blue.s,
  );

  // spine
  const boxes = [
    stage(98, {
      tag: 'input — the sumcheck claim',
      variant: V.slate,
      caption:
        '\\textsf{the } \\alpha\\textsf{-batched Mega relation, weighted by } \\mathrm{pow}_\\beta \\textsf{, sums to zero}',
      tex: '\\sum_{\\vec\\ell \\in \\{0,1\\}^d} \\mathrm{pow}_\\beta(\\vec\\ell)\\; F\\bigl(P_1(\\vec\\ell),\\dots,P_N(\\vec\\ell)\\bigr) = 0',
      texEx: 8,
    }),
    stage(234, {
      n: 1,
      tag: 'batch the subrelations',
      variant: V.green,
      caption: '\\textsf{63 subrelations; the 6 linearly-dependent lookups enter without } \\mathrm{pow}_\\beta',
      tex: 'F = R_0 + \\sum_{j\\ge 1} \\alpha_{j-1} R_j, \\qquad \\mathrm{pow}_\\beta(\\vec\\ell) = \\beta^{\\ell}',
    }),
    stage(370, {
      n: 2,
      tag: 'the round-i univariate',
      variant: V.green,
      caption:
        '\\mathrm{pow}_\\beta \\textsf{ factors: bound prefix } c_i \\times \\textsf{ degree-1 } \\times \\textsf{ per-edge tail weight}',
      tex: '\\tilde S^i(X) = c_i \\cdot \\bigl((1{-}X) + X\\beta_i\\bigr) \\cdot T^i(X)',
    }),
    stage(506, {
      n: 3,
      tag: 'extend the edges',
      variant: V.blue,
      caption: '\\textsf{each column is linear in } X_i \\textsf{: two table values give all 8 points, add-only}',
      tex: 'P_j(\\dots,k,\\vec\\ell) = P_j(\\dots,k{-}1,\\vec\\ell) + \\bigl(P_j(\\dots,1,\\vec\\ell) - P_j(\\dots,0,\\vec\\ell)\\bigr)',
      texEx: 7.5,
    }),
    stage(642, {
      n: 4,
      tag: 'check + challenge (Fiat–Shamir)',
      variant: V.purple,
      caption:
        '\\textsf{verifier: } \\tilde S^i(0) + \\tilde S^i(1) = \\sigma_i, \\quad \\sigma_{i+1} = \\tilde S^i(u_i)',
      tex: 'u_i = \\mathsf{Poseidon2}\\bigl(\\mathrm{state}_i \\,\\Vert\\, \\tilde S^i(0),\\dots,\\tilde S^i(7)\\bigr)',
    }),
    stage(778, {
      n: 5,
      tag: 'fold — bind the variable',
      variant: V.blue,
      caption: '\\textsf{partially evaluate every column at } u_i \\textsf{; the table halves}',
      tex: 'P[p] \\leftarrow P[2p] + u_i\\,\\bigl(P[2p{+}1] - P[2p]\\bigr)',
    }),
    stage(914, {
      tag: 'output — after d rounds',
      variant: V.slate,
      caption: '\\textsf{each column is one value: the multilinear opening claims the PCS consumes}',
      tex: 'P_j(u_0,\\dots,u_{d-1}), \\quad j = 1,\\dots,67',
    }),
  ];
  for (let i = 0; i < boxes.length - 1; i++) {
    arrow(boxes[i].bot, boxes[i + 1].top, { color: ARROW, width: 1.6, head: 'small' });
  }
  // the d-round loop: fold feeds the next round univariate
  poly(
    [
      { x: boxes[5].left.x, y: boxes[5].cy },
      { x: 226, y: boxes[5].cy },
      { x: 226, y: boxes[2].cy },
      { x: boxes[2].left.x, y: boxes[2].cy },
    ],
    {
      color: ARROW_ACCENT,
      dashed: true,
      width: 1.6,
      head: 'small',
      label: '× d rounds',
      lx: 226,
      ly: 730,
    },
  );

  // the primitive callout
  const prim = card(34, 462, 176, 208, {
    tag: 'the primitive',
    variant: V.amber,
    lines: ['every term costs one', 'emulated 254-bit'],
  });
  placeTex(prim.cx, 552, '\\mathbb{F}_r\\ \\textsf{Montgomery}', { color: V.amber.t, ex: 7.5, maxW: 150 });
  placeTex(prim.cx, 574, '\\textsf{product}', { color: V.amber.t, ex: 7.5, maxW: 150 });
  plain(prim.x + 14, 604, '20×13-bit limbs, R = 2²⁶⁰,', { color: MUT, size: 10.5 });
  plain(prim.x + 14, 620, 'Karatsuba–Yuval; relations', { color: MUT, size: 10.5 });
  plain(prim.x + 14, 636, 'are division-free — there is', { color: MUT, size: 10.5 });
  plain(prim.x + 14, 652, 'no inversion anywhere.', { color: MUT, size: 10.5 });
  arrow(prim.right, { x: spineX, y: boxes[3].cy }, { color: V.amber.s, dashed: true, width: 1.6, head: 'small' });

  fs.writeFileSync(`${OUT}/sumcheck_math_flow.svg`, svg(W, H, colors));
  console.log('wrote sumcheck_math_flow.svg');
}

// ============================================================ DIAGRAM 2
// One round as GPU passes: setup band on top, the six-kernel spine in the
// middle, the two engines as side columns annotating where the host sits.
function gpuRound() {
  reset();
  const W = 1180,
    H = 900;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.purple.s, V.amber.s, V.red.s, V.teal.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'One sumcheck round as WebGPU passes',
    'Shared six-kernel spine; the two engines differ only in where the host re-enters the loop.',
  );

  // --- setup band ---
  region(34, 78, 1112, 112, { label: 'setup — once per prove', color: V.purple });
  card(56, 112, 340, 62, {
    tag: 'upload 67 columns',
    variant: V.purple,
    lines: ['Montgomery bytes, column-major, resident', 'for all rounds; 5 shift columns materialised'],
  });
  card(420, 112, 340, 62, {
    tag: 'beta_products scan',
    variant: V.purple,
    lines: ['doubling subset-product on the GPU:', 'pass k writes beta[2^k + r] = beta[r]·β_k'],
  });
  card(784, 112, 340, 62, {
    tag: 'batch matrices M_LI / M_LD',
    variant: V.purple,
    lines: ['α-powers + barycentric extend-to-8', 'folded into two constant 8×345 matrices'],
  });

  // --- spine ---
  const spineX = 430,
    spineW = 320;
  region(396, 214, 388, 588, { label: 'per round i — six dispatch groups', color: V.blue });
  let y = 254;
  const step = (tag, variant, lines, h = 58) => {
    const c = card(spineX, y, spineW, h, { tag, variant, lines });
    y += h + 26;
    return c;
  };
  const g = step('gate_separator_gather', V.green, ['tail weights: beta_products at stride 2^(i+1)']);
  const a = step('accumulate (×14 or uber)', V.green, ['1 thread / edge-pair → 345-slot univariates']);
  const r = step('reduce — two levels', V.blue, ['sum over edges → exactly 345 Fr (~11 KB)']);
  const b = step('batch', V.blue, ['S(0..7) = (M·acc)·(a+bβᵢ)·cᵢ — 8 threads']);
  const t = step('poseidon2_transcript', V.purple, ['squeeze uᵢ resident; c ← c·(1−uᵢ+uᵢβᵢ)']);
  const f = step('fold', V.blue, ['columns halve at uᵢ, ping-pong buffers']);
  for (const [p, q] of [
    [g, a],
    [a, r],
    [r, b],
    [b, t],
    [t, f],
  ])
    arrow(p.bot, q.top, { color: ARROW, width: 1.6, head: 'small' });
  poly(
    [
      { x: f.right.x, y: f.cy },
      { x: 768, y: f.cy },
      { x: 768, y: g.cy },
      { x: g.right.x, y: g.cy },
    ],
    { color: ARROW_ACCENT, dashed: true, width: 1.6, head: 'small' },
  );
  plain(590, 775, "fold feeds the next round's gather — all state stays resident", {
    color: MUT,
    size: 11,
    anchor: 'middle',
  });

  // --- multi-pass column (left) ---
  region(34, 214, 330, 588, { label: 'multi-pass — host round loop', color: V.amber });
  const mp1 = card(56, 258, 286, 74, {
    tag: 'readback / round',
    variant: V.amber,
    lines: ['the 345-Fr accumulator maps to the', 'host after reduce — columns never leave'],
  });
  const mp2 = card(56, 356, 286, 74, {
    tag: 'host tail + challenge',
    variant: V.amber,
    lines: ['batch on CPU, supply uᵢ (no host FS),', 'submit the fold; d blocking syncs/prove'],
  });
  card(56, 454, 286, 74, {
    tag: 'unfenced fold',
    variant: V.amber,
    lines: ["the next round's readback covers it —", 'one sync per round, not two'],
  });
  card(56, 570, 286, 90, {
    tag: 'why it exists',
    variant: V.slate,
    lines: [
      'smallest protocol surface around the',
      'O(n) kernels; validated the math first;',
      'pays a d-round-trip latency floor',
    ],
  });
  arrow(r.left, mp1.right, { color: V.amber.s, dashed: true, width: 1.6, head: 'small' });
  arrow(mp2.right, { x: spineX, y: f.cy - 6 }, { color: V.amber.s, dashed: true, width: 1.6, head: 'small' });

  // --- single-submission column (right) ---
  region(816, 214, 330, 588, { label: 'single-submission — one submit', color: V.teal });
  card(838, 258, 286, 74, {
    tag: 'all d rounds, 1 buffer',
    variant: V.teal,
    lines: ['the whole protocol in one command', 'buffer; hazard tracking orders the chain'],
  });
  const ss2 = card(838, 356, 286, 74, {
    tag: 'on-GPU Fiat–Shamir',
    variant: V.teal,
    lines: ['uᵢ never visits the host; transcript', 'bit-identical to bb.js poseidon2Hash'],
  });
  card(838, 454, 286, 74, {
    tag: 'one readback at the end',
    variant: V.teal,
    lines: ['all d univariates + challenges +', 'claimed evaluations in one map'],
  });
  card(838, 570, 286, 90, {
    tag: 'why it exists',
    variant: V.slate,
    lines: [
      'drop-in transcript ownership; never',
      'blocks the prover thread; the resident',
      'stage of a GPU-resident prove',
    ],
  });
  arrow(ss2.left, t.right, { color: V.teal.s, dashed: true, width: 1.6, head: 'small' });

  // --- hybrid band ---
  region(34, 826, 1112, 52, { label: '', color: V.red });
  heading(50, 858, 'hybrid', V.red.s);
  plain(
    130,
    858,
    'run the first d−T rounds on the GPU, hand the 2^T-row columns to threaded WASM for the last T ≈ 9 —',
    {
      color: MUT,
      size: 12,
    },
  );
  plain(
    130,
    874,
    'the tail is latency-bound (a handful of edges still pays a full dispatch chain), the handoff is ~1–3 ms.',
    {
      color: MUT,
      size: 12,
    },
  );

  fs.writeFileSync(`${OUT}/sumcheck_gpu_round.svg`, svg(W, H, colors));
  console.log('wrote sumcheck_gpu_round.svg');
}

// ============================================================ DIAGRAM 3
// The geometric work profile: a stacked share-of-work bar, the per-round row
// counts, and the GPU-front / WASM-tail split with the latency-floor caption.
function workProfile() {
  reset();
  const W = 1180,
    H = 470;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.amber.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'Where the work lives — and why the tail moves to WASM',
    'Each round touches half the rows of the last: the O(n) work is front-loaded, the tail is pure per-round latency. Example: d = 17.',
  );

  const d = 17;
  const X0 = 34,
    BW = 1112;

  // --- stacked share-of-work bar ---
  heading(X0, 106, 'share of total O(n) field work, by round', MUT);
  const segs = [
    { label: 'round 0 — 50%', frac: 0.5, v: V.green },
    { label: 'round 1 — 25%', frac: 0.25, v: V.green },
    { label: 'r2 — 12.5%', frac: 0.125, v: V.blue },
    { label: 'r3', frac: 0.0625, v: V.blue },
    { label: '4…16', frac: 0.0625, v: V.slate },
  ];
  let sx = X0;
  for (const s of segs) {
    const w = BW * s.frac;
    push(`<rect x="${sx}" y="120" width="${w - 3}" height="52" rx="8" fill="${s.v.f}" stroke="${s.v.s}"/>`);
    if (w > 40)
      plain(sx + w / 2, 151, s.label, { color: s.v.t, size: 12.5, weight: 600, anchor: 'middle', mono: true });
    sx += w;
  }
  plain(X0 + BW * 0.375, 196, 'rounds 0–1 = 75% of everything', { color: V.green.t, size: 12, anchor: 'middle' });
  plain(X0 + BW * 0.97, 196, '≈ noise', { color: MUT, size: 12, anchor: 'end' });

  // --- per-round row counts + split ---
  heading(X0, 248, 'rows alive per round (n = 2^17)', MUT);
  const T = 9; // WASM-tail rounds
  const cellW = (BW - (d - 1) * 8) / d;
  region(X0 - 8, 262, (cellW + 8) * (d - T) + 4, 96, { label: '', color: V.blue });
  region(X0 - 8 + (cellW + 8) * (d - T) + 6, 262, (cellW + 8) * T + 2, 96, { label: '', color: V.amber });
  const rows = i => {
    const v = 2 ** (17 - i);
    return v >= 1024 ? `${v / 1024}k` : `${v}`;
  };
  for (let i = 0; i < d; i++) {
    const x = X0 + i * (cellW + 8);
    const inGpu = i < d - T;
    const v = inGpu ? V.blue : V.amber;
    push(`<rect x="${x}" y="278" width="${cellW}" height="44" rx="7" fill="${v.f}" stroke="${v.s}"/>`);
    plain(x + cellW / 2, 296, `r${i}`, { color: MUT, size: 10.5, anchor: 'middle' });
    plain(x + cellW / 2, 313, rows(i), { color: v.t, size: 11.5, weight: 600, anchor: 'middle', mono: true });
  }
  plain(X0 + ((cellW + 8) * (d - T)) / 2, 348, 'GPU front — edge-parallel, ~99.8% of the field work', {
    color: V.blue.t,
    size: 12,
    weight: 600,
    anchor: 'middle',
  });
  plain(X0 + (cellW + 8) * (d - T) + ((cellW + 8) * T) / 2, 348, 'WASM tail — last T ≈ 9 rounds, flat ~13 ms', {
    color: V.amber.t,
    size: 12,
    weight: 600,
    anchor: 'middle',
  });

  // --- the floor caption ---
  plain(
    X0,
    404,
    'The latency floor: a GPU round costs (submit + dispatch chain + sync) no matter how few edges remain, so the',
    {
      color: MUT,
      size: 12.5,
    },
  );
  plain(
    X0,
    422,
    'deepest rounds cost the same as a mid-depth round while doing ~0 work — multi-pass pays that floor d times, single-submission',
    {
      color: MUT,
      size: 12.5,
    },
  );
  plain(
    X0,
    440,
    'collapses it to one bubble, and the hybrid simply hands the floor-bound tail to a CPU that does not have one.',
    {
      color: MUT,
      size: 12.5,
    },
  );

  fs.writeFileSync(`${OUT}/sumcheck_work_profile.svg`, svg(W, H, colors));
  console.log('wrote sumcheck_work_profile.svg');
}

// ============================================================ DIAGRAM 4
// The optimisation map: every optimisation as a card, grouped into three
// status bands — landed, designed-but-not-landed, dead end — with the stage
// it touches in the tag.
function optMap() {
  reset();
  const W = 1180,
    H = 964;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.amber.s, V.red.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'The optimisation map — what landed, what is designed, what died',
    'Every optimisation tried or planned on the sumcheck branches, grouped by status. Detail in SUMCHECK_ALGO.md §4.',
  );

  const X0 = 34,
    RW = 1112,
    CW = 345,
    CH = 70,
    GAP = 16,
    PITCH = 82;
  const grid = (regionY, cards, variant) => {
    for (let i = 0; i < cards.length; i++) {
      const cx = X0 + 22 + (i % 3) * (CW + GAP);
      const cy = regionY + 40 + Math.floor(i / 3) * PITCH;
      card(cx, cy, CW, CH, { tag: cards[i][0], variant: cards[i][2] ?? variant, lines: cards[i][1] });
    }
  };

  region(X0, 96, RW, 378, { label: 'landed — built & validated in the prototype', color: V.green });
  grid(
    96,
    [
      ['mono / Lagrange bases', ['Karatsuba 3-mul products, add-only Newton', 'extension — fewer Fr muls per edge']],
      ['field8 live form', ['8×u32 packed add/sub everywhere; unpack', 'to 20×13 limbs only inside the multiply']],
      ['resident columns', ['witness uploads once, stays on the GPU;', 'accumulate reads it in place (fused gather)']],
      ['two-level reduce', ['345 Fr cross the bus per round —', 'not 64 partials × 345']],
      ['unfenced fold', ["the next round's readback covers the fold:", 'one blocking sync per round, not two']],
      ['shared 67-entity columns', ['one witness set, not per-relation copies:', '185 → 67 resident columns (2.76×)']],
      ['ping-pong fold buffers', ['reuse one full + one half buffer set:', '252 → 28 allocations per prove']],
      ['uber accumulate', ['register-light gates fused into one dispatch', '(band profiles); the heavy trio isolated']],
      ['constant-matrix batch', ['α-powers + barycentric extension folded', 'into 8×345 constants at setup']],
      [
        'parallel poseidon2',
        ['serial transcript measured ~27% of single-', 'submit GPU time; t=4 lanes — expected ~2×'],
      ],
      ['gpu beta_products scan', ['doubling subset-product scan kills the', 'O(n·log n) host bigint cliff at setup']],
      [
        'skip tiers 0/1 + band',
        ['size trim, per-edge early-out, band dispatch,', 'index-list compaction — see the skip figure'],
      ],
    ],
    V.green,
  );

  region(X0, 494, RW, 214, { label: 'designed — specified on the branches, not landed', color: V.amber });
  grid(
    494,
    [
      ['montgomery_square', ['x·x pays a full product today; ~64 → ~36', 'partial muls at sites in 7 of 14 kernels']],
      [
        'tier-2 indirect compaction',
        ['GPU-built active list + indirect dispatch;', 'landmine: load index ≠ write slot'],
      ],
      ['kill the 2nd readback', ['stage the final length-1 columns inside', 'the same command buffer']],
      ['build-once encode', ['bind groups are data-independent — a warm', 'handle: upload + 1 submit + 1 map']],
      [
        'in-place / streamed fold',
        ['write halves into the source buffer:', '~1 power of two more scale (VRAM ceiling)'],
      ],
      ['slot parallelism', ['fan the 8 eval points across lanes so the', 'tail needs no WASM (not a wall-clock win)']],
    ],
    V.amber,
  );

  region(X0, 728, RW, 214, { label: 'dead ends — measured or proven out, do not re-derive', color: V.red });
  grid(
    728,
    [
      ['workgroup-size sweep', ['flat 32–128 on Apple Silicon —', 'occupancy is not a lever here']],
      ['row-major transpose', ['strictly worse gather stride, and round 0', 'is ALU-bound anyway']],
      [
        'persistent megakernel',
        ['no portable cross-workgroup barrier: a round', 'boundary must be a dispatch boundary'],
      ],
      [
        'fuse all 14 relations',
        ['~11 KB live accumulator state per thread', 'collapses occupancy; fuse by register class'],
      ],
      [
        '"squares are Poseidon-only"',
        ['wrong — square sites in 7 kernels; ~25–35%', 'saving at sites, not 40% globally'],
      ],
    ],
    V.red,
  );

  fs.writeFileSync(`${OUT}/sumcheck_opt_map.svg`, svg(W, H, colors));
  console.log('wrote sumcheck_opt_map.svg');
}

// ============================================================ DIAGRAM 5
// The skip-aware dispatch tiers: the same 36 edge-pairs of one relation under
// each dispatch mode; filled cells do field work, dim cells do none.
function skipTiers() {
  reset();
  const W = 1180,
    H = 560;
  const colors = [ARROW, ARROW_ACCENT, V.green.s, V.blue.s, V.amber.s, V.slate.s];
  bgRect(W, H);
  title(
    34,
    44,
    'Skip-aware dispatch — the same relation, five ways',
    'One relation over 36 edge-pairs; filled cells run the ~1,817-mul accumulate body, dim cells cost (almost) nothing. Mega applies ~2 of 14 relations per active row.',
  );

  const X0 = 300,
    N = 36,
    CS = 20,
    GP = 4;
  const bar = (y, activeSet, { launchedOutline = false, cells = N, x0 = X0 } = {}) => {
    for (let i = 0; i < cells; i++) {
      const x = x0 + i * (CS + GP);
      const on = activeSet.has(i);
      if (on)
        push(`<rect x="${x}" y="${y}" width="${CS}" height="${CS}" rx="4" fill="${V.green.f}" stroke="${V.green.s}"/>`);
      else
        push(
          `<rect x="${x}" y="${y}" width="${CS}" height="${CS}" rx="4" fill="#12161f" stroke="${launchedOutline ? V.slate.s : '#212a39'}"${launchedOutline ? ' stroke-dasharray="3 2"' : ''}/>`,
        );
    }
  };
  const label = (y, tag, sub, variant = V.green) => {
    plain(34, y + 10, tag, { color: variant.t, size: 12.5, weight: 600, mono: true });
    plain(34, y + 27, sub, { color: MUT, size: 10.5 });
  };
  const caption = (y, text) => plain(X0, y + 40, text, { color: MUT, size: 11 });

  const all = new Set(Array.from({ length: N }, (_, i) => i));
  const scattered = new Set([2, 3, 7, 8, 9, 14, 15, 21, 22, 23, 24, 29]);

  let y = 118;
  label(y, 'dense (baseline)', 'no skip model');
  bar(y, all);
  caption(y, 'every edge-pair runs the full body, active or not — a data-parallel machine pays for zeros.');

  y += 88;
  label(y, 'tier 0 — size trim', 'landed');
  bar(y, new Set(Array.from({ length: 24 }, (_, i) => i)));
  caption(y, 'after i folds only ⌈used / 2^i⌉ rows can be nonzero — the dispatch shrinks to that prefix.');

  y += 88;
  label(y, 'band dispatch', 'landed');
  bar(y, new Set(Array.from({ length: 12 }, (_, i) => i + 9)));
  caption(
    y,
    'the execution trace groups each gate type contiguously: dispatch [start, end) by arithmetic, reads stay coalesced.',
  );

  y += 88;
  label(y, 'tier 1 — early-out', 'landed');
  bar(y, scattered, { launchedOutline: true });
  caption(
    y,
    'every thread launches (dashed = launched, exits on a zero selector after writing zeros) — cheap, but threads still occupy the machine.',
  );

  y += 88;
  label(y, 'compaction', 'landed (host list, multi-pass) /', V.amber);
  plain(34, y + 42, 'tier 2 = GPU list + indirect (designed)', { color: MUT, size: 10.5 });
  const scattered20 = new Set([2, 3, 7, 8, 9, 14, 15, 18, 19]);
  bar(y, scattered20, { cells: 20 });
  const gx = X0 + 20 * (CS + GP) + 30;
  arrow(
    { x: X0 + 20 * (CS + GP) + 4, y: y + CS / 2 },
    { x: gx + 6, y: y + CS / 2 },
    { color: V.amber.s, width: 1.7, head: 'small' },
  );
  bar(y, new Set(Array.from({ length: 9 }, (_, i) => i)), { cells: 12, x0: gx + 14 });
  caption(
    y,
    'an index list gathers the actives into a dense prefix; only relations under ~0.2 density — gathered reads cost more per cell.',
  );

  fs.writeFileSync(`${OUT}/sumcheck_skip_tiers.svg`, svg(W, H, colors));
  console.log('wrote sumcheck_skip_tiers.svg');
}

mathFlow();
gpuRound();
workProfile();
optMap();
skipTiers();
