// Skip-path WGSL transforms + effective-size arithmetic. Pure string/number helpers with
// no WebGPU dependency (so they are unit-testable in node via skip_injection.test.ts), kept
// out of gpu_pipeline.ts which pulls in the device layer. The engines (gpu_pipeline.ts,
// single_submit.ts) import these and re-export injectSkipPrelude/injectCompaction/
// effPairsForRound so existing call sites are unchanged.

import type { RelationDescriptor } from './harness.js';

const ZERO8_WGSL = 'array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u)';

/**
 * Inject a relation's skip predicate (Tier 1) into its generated accumulate WGSL: a
 * per-edge early-out that mirrors C++ `Relation::skip()`. Each thread tests its own
 * edge-pair's selector via the existing `ld(row, j)` accessor (an entity column c's two
 * edge evals are `ld(row, 2c)` and `ld(row, 2c+1)`); Montgomery 0 is all-zero bytes, so
 * the test is `is_zero_f8` (no fromMont). On a skipped edge the prelude writes OUT_LEN
 * zeros and returns — the zero-write is REQUIRED because the reduce sums over every
 * edge slot and the per-edge scratch is reused across relations, so a skipped slot must
 * not carry stale data. For block-contiguous sparsity an entire workgroup of inactive
 * edges takes this cheap branch uniformly (no divergence); scattered sparsity diverges,
 * which is why it is the worst case. Inserted after the `row >= params.n` guard so
 * out-of-range threads are unaffected; the column stride (`ld`) is unchanged.
 */
export function injectSkipPrelude(code: string, desc: RelationDescriptor): string {
  const guard = 'if (row >= params.n) { return; }';
  if (!code.includes(guard)) throw new Error(`injectSkipPrelude: guard not found in ${desc.entry}`);
  // WGSL reserves the `__` identifier prefix, so injected names use `sk_`.
  const sk = desc.skip;
  let pred: string;
  let out = code;
  if (sk.kind === 'allZero') {
    pred = sk.cols.map(c => `is_zero_f8(ld(row, ${2 * c}u)) && is_zero_f8(ld(row, ${2 * c + 1}u))`).join(' && ');
  } else {
    const [a, b] = sk.cols;
    pred = `sk_eq8(ld(row, ${2 * a}u), ld(row, ${2 * b}u)) && sk_eq8(ld(row, ${2 * a + 1}u), ld(row, ${2 * b + 1}u))`;
    // eqPair needs a byte-equality helper; declare it before the (single) compute entry.
    const helper =
      'fn sk_eq8(a: array<u32, 8>, b: array<u32, 8>) -> bool {\n' +
      '  return a[0] == b[0] && a[1] == b[1] && a[2] == b[2] && a[3] == b[3] && a[4] == b[4] && a[5] == b[5] && a[6] == b[6] && a[7] == b[7];\n' +
      '}\n';
    out = out.replace('@compute', helper + '@compute');
  }
  const prelude =
    `\n  if (${pred}) {\n` +
    `    let sk_zero8 = ${ZERO8_WGSL};\n` +
    '    for (var sk_k: u32 = 0u; sk_k < OUT_LEN; sk_k = sk_k + 1u) { write_eval(row, sk_k, sk_zero8); }\n' +
    '    return;\n' +
    '  }';
  return out.replace(guard, guard + prelude);
}

/**
 * Inject active-edge compaction (Tier 2) into a relation's generated accumulate WGSL:
 * each thread handles one ACTIVE edge-pair, gathered from a precomputed dense index list,
 * instead of one grid position + a per-edge skip test. Reads stay indexed by the gathered
 * pair `row`, so the columns AND the gate-separator scaling — both read via `ld(row, ·)` —
 * are gathered for free; only the OUTPUT is redirected to the compacted slot, so the
 * reduce sums a dense `[0, count)` range. This removes the SIMD divergence that neuters
 * per-edge skip on scattered instances (no inactive lane is ever dispatched). The thread
 * bound becomes `params.sk_active` (the round's active count); `params.n` (= pairs, the
 * full column stride that `ld` uses) is unchanged. Mutually exclusive with injectSkipPrelude
 * and with the shared-67-column kernel (whose entity_map binding would collide with sk_active_idx).
 */
export function injectCompaction(code: string, desc: RelationDescriptor, hasParams: boolean): string {
  const ldSig = 'fn ld(row: u32, j: u32) -> array<u32, 8> {';
  const guard = 'if (row >= params.n) { return; }';
  if (!code.includes(ldSig) || !code.includes(guard)) throw new Error(`injectCompaction: anchors not found in ${desc.entry}`);
  const idxBinding = hasParams ? 5 : 4; // sk_active_idx after param_buf(4) or scaling(3) — must match the engine's bind-group layout
  let out = code;
  out = out.replace('@compute', `@group(0) @binding(${idxBinding}) var<storage, read> sk_active_idx: array<u32>;\n@compute`);
  // Round's active count + base offset into the index list.
  out = out.replace('struct Params {\n  n: u32,\n}', 'struct Params {\n  n: u32,\n  sk_active: u32,\n  sk_base: u32,\n}');
  // Thread bound is the compacted active count; `row` (= gid.x) stays the COMPACTED slot, so
  // writes (write_eval(row, ·), incl. those inside per-relation output helpers) land in a
  // dense [0, sk_active) range that the reduce sums unchanged.
  out = out.replace(guard, 'if (row >= params.sk_active) { return; }');
  // Only the READ path is gathered: `ld` maps the compacted `row` to its active edge-pair `g`,
  // so both the column reads (2u*g) and the gate-separator scaling (g*8u, the else branch) pull
  // the active pair. `params.n` (= pairs, the column stride in col_len) is unchanged.
  out = out.replace(ldSig, ldSig + '\n  let g = sk_active_idx[params.sk_base + row];');
  out = out.replace('2u * row + (j & 1u)', '2u * g + (j & 1u)');
  out = out.replace('let base = row * 8u;', 'let base = g * 8u;');
  return out;
}

/**
 * Active edge-pairs to accumulate this round under effective-size trimming (Tier 0,
 * mirrors `compute_effective_round_size`). After `round` folds, only the first
 * ceil(usedLen / 2^round) rows can be nonzero; the rest are the folded zero tail and
 * contribute exactly zero, so the accumulate/reduce/gather are trimmed to them. The
 * column stride (params.n = full `pairs`) is unchanged — this is purely a smaller
 * dispatch. Dense (usedLen == n) yields effPairs == pairs (no trim).
 */
export function effPairsForRound(usedLen: number, round: number, curLen: number): number {
  const usedThisRound = Math.ceil(usedLen / 2 ** round);
  const effLen = Math.min(curLen, usedThisRound + (usedThisRound & 1));
  return Math.max(1, effLen >> 1);
}
