// Multi-MSM union runner — the bridge's pack→prepareBatch→scatter core
// (MULTI_MSM_PLAN.md rollout step 4 / BRIDGE_WIRING_HANDOFF.md "the recipe").
//
// A `batch_multi_scalar_mul` call arrives as K per-MSM descriptors. Instead of
// running them sequentially (one MsmV2 per n, the GPU starves on each small MSM),
// this runs each budget-sized PACK as ONE union dispatch over the concatenation of
// its members' windows (`MsmV2.prepareBatch`), then slices each member's per-window
// sums back out. The saturation win this realises is measured in MULTI_MSM_PERF.md
// (3.5–14× GPU-throughput for the n=128–4096 regime).
//
// This module is deliberately **I/O-free** — it reads scalars through a callback
// and returns per-member results rather than touching WASM memory or the SAB — so
// the exact descriptor-decode + scalars-reorder + per-member-scatter plumbing is
// driven identically by the production bridge (`bridge/main.ts`) and the dev
// validation harness (`msm-bridge-check`), keeping the byte-identical-bisection
// discipline on the new code.

import { MsmV2, pickC } from '../msm_v2.js';
import { packByBudget, planBatch, unionFootprintBytes } from '../batch_scheduler.js';

/** One decoded per-MSM descriptor (the C++ hook's 5×u32 row). Byte offsets are
 *  relative to the batch scalars / results regions. */
export interface BridgeDescriptor {
  n: number;
  srsOffset: number;
  /** Byte offset of this MSM's scalars within the batch scalars region. */
  scalarsOff: number;
  /** Byte offset of this MSM's result within the batch results region (echoed back). */
  resultOff: number;
  /** Reserved (off-SRS pointer); nonzero ⇒ excluded from packing. */
  reserved: number;
}

/** One member's result from the union path: its raw early-exit staged-partials
 *  bytes sliced out of the pack's concatenated staged region, plus the facts the
 *  caller writes back. `run()` ships staged partials (not host-decoded window
 *  sums — `windowSums` is empty), so the per-member slice is window-major:
 *  `partialsPerWindow * 96` bytes per window, mirroring `runSoloBridgeMember`. */
export interface UnionMemberResult {
  /** Index into the original descriptor array (drives result/meta scatter position). */
  descIdx: number;
  /** Raw staged-partials bytes for this member's windows (C++ finish_and_combine input). */
  stagedBytes: Uint8Array;
  numWindows: number;
  partialsPerWindow: number;
  /** This member's window width `c` (per-member in a heterogeneous pack). */
  c: number;
  resultOff: number;
}

export interface UnionRunOutput {
  results: UnionMemberResult[];
  /** Descriptor indices the union path could NOT take — caller runs them on the
   *  per-MSM path. Covers `srsOffset≠0`/`reserved≠0` (the union assumes the SRS
   *  prefix `[0,n)`) and any member too large to fit even a 1-member union dispatch
   *  (the per-MSM path window-stages it; the union path does not stage). */
  fallback: number[];
  packCount: number;
  totalUnionWindows: number;
}

/** True for the runtime's "this pack doesn't fit one dispatch" rejections (budget
 *  overflow or the 65k-workgroup cap) — the signal to shrink the pack / fall back,
 *  as opposed to a genuine bug which must propagate. */
function isPackOverflow(e: unknown): boolean {
  return e instanceof Error && e.message.startsWith('prepareBatch:') && e.message.includes('exceeds the');
}

/**
 * Run every packable descriptor through the union dispatch path.
 *
 * @param getUnionMsm   Provider of an `MsmV2` sized to a pack's max n, bound to the
 *                      shared SRS pool. Cached by the caller (reuse-by-maxN); created
 *                      with `combineOnHost:false` so it yields per-window sums.
 * @param descriptors   The decoded batch descriptors.
 * @param readScalars   `(scalarsOff, byteLen) → bytes` from the batch scalars region.
 *                      May return a zero-copy view; the bytes are copied into the
 *                      pack's concatenated buffer before any await.
 * @param opts.srsBytes The REAL shared-pool size (`poolX.size + poolY.size`). The
 *                      runtime counts it, so the packer must too (BRIDGE_WIRING_HANDOFF
 *                      "the srsBytes trap").
 */
export async function runUnionPacks(
  getUnionMsm: (maxN: number) => Promise<MsmV2>,
  descriptors: BridgeDescriptor[],
  readScalars: (scalarsOff: number, byteLen: number) => Uint8Array,
  opts: { srsBytes: number; budgetBytes: number },
): Promise<UnionRunOutput> {
  const SCALAR_BYTES = 32;
  const results: UnionMemberResult[] = [];
  const fallback: number[] = [];

  // ── Split + group by (srsOffset, c). Only an off-SRS pointer (`reserved≠0`) is
  // excluded. A nonzero `srsOffset` is fine: members sharing an SRS start pack into
  // one union whose point-fetch `base_offset` is that offset (the SAME mechanism the
  // solo path uses — `val_idx` stays member-local, the pool index is `srsOffset +
  // val_idx`). In the real Chonk prove srsOffsets cluster into a few values (the
  // structured-trace shifted wires sit at srsOffset=1), so grouping engages the
  // union on ~all commitments instead of falling 77% of them back.
  //
  // c MUST also be part of the key: prepareBatch's different-c "envelope" path
  // (members of unequal `pickC(n)` sharing one maxN instance) computes wrong
  // (on-curve but incorrect) per-member sums — verified by `msm-union-validate`
  // (same-c packs ≡ CPU MSM, mixed-c packs diverge). Grouping by c keeps every
  // pack same-c (the validated path); cross-c members just land in separate packs.
  interface Candidate {
    descIdx: number;
    n: number;
    srsOffset: number;
    scalarsOff: number;
    resultOff: number;
  }
  const byGroup = new Map<string, Candidate[]>();
  for (let i = 0; i < descriptors.length; i++) {
    const d = descriptors[i];
    if (d.reserved !== 0) {
      fallback.push(i);
      continue;
    }
    const cand: Candidate = {
      descIdx: i,
      n: d.n,
      srsOffset: d.srsOffset,
      scalarsOff: d.scalarsOff,
      resultOff: d.resultOff,
    };
    const key = `${d.srsOffset}:${pickC(d.n)}`;
    const arr = byGroup.get(key);
    if (arr) arr.push(cand);
    else byGroup.set(key, [cand]);
  }

  let packCount = 0;
  let totalUnionWindows = 0;

  for (const candidates of byGroup.values()) {
    const srsOffset = candidates[0].srsOffset; // every candidate in a group shares (srsOffset, c)
    if (candidates.length === 0) continue;
    // Pack this srsOffset group against the runtime-accurate union footprint so the
    // packer never picks a pack the runtime then throws on. The greedy packer
    // preserves candidate order, so each emitted pack consumes the next
    // `descs.length` candidates — recover the candidate groups by walking a cursor.
    const layouts = packByBudget(
      candidates.map(c => ({ n: c.n })),
      { budgetBytes: opts.budgetBytes, srsBytes: opts.srsBytes, estimator: unionFootprintBytes },
    );
    const groups: number[][] = []; // candidate indices per pack
    let cursor = 0;
    for (const layout of layouts) {
      const grp: number[] = [];
      for (let j = 0; j < layout.descs.length; j++) grp.push(cursor + j);
      groups.push(grp);
      cursor += layout.descs.length;
    }

    // Process packs one at a time (peak GPU mem = pool + one pack's arena). A budget
    // miss by the host model degrades gracefully: drop the last member to its own
    // solo pack and retry the smaller pack, so a model error never errors the prove.
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      if (group.length === 0) continue;
      const members = group.map(ci => candidates[ci]);
      const maxN = members.reduce((a, m) => Math.max(a, m.n), 0);

      const plan = planBatch(members.map(m => ({ n: m.n, srsOffset: 0 })));
      // Concatenate the members' scalars into planBatch's layout. The descriptor's
      // scalarsOff is the C++ batch layout; planBatch computes its OWN scalarBase —
      // they are NOT equal, so this copy (reorder) is mandatory.
      const concat = new Uint8Array(plan.totalScalarBytes);
      for (let j = 0; j < members.length; j++) {
        const src = readScalars(members[j].scalarsOff, members[j].n * SCALAR_BYTES);
        concat.set(src, plan.descs[j].scalarBase);
      }
      const batchMembers = plan.descs.map(d => ({
        n: d.n,
        scalarBaseBytes: d.scalarBase,
        schedOff: d.schedOff,
        numWindows: d.numWindows,
      }));

      const inst = await getUnionMsm(maxN);
      try {
        // Every member of this pack shares `srsOffset` → applied as the union's
        // point-fetch base_offset (val_idx stays member-local).
        inst.prepareBatch(batchMembers, concat, plan.windowDescTable, plan.reduceOffsets, srsOffset);
      } catch (e) {
        if (isPackOverflow(e)) {
          if (group.length > 1) {
            // Host over-packed: peel the last member into its own solo pack and retry.
            const dropped = group[group.length - 1];
            groups[gi] = group.slice(0, -1);
            groups.push([dropped]);
            gi--; // re-process the (now smaller) group
            continue;
          }
          // A single member that won't fit one union dispatch → per-MSM path stages it.
          fallback.push(candidates[group[0]].descIdx);
          continue;
        }
        throw e;
      }

      const { stagedPartials, partialsPerWindow } = await inst.run();
      if (stagedPartials === null || partialsPerWindow <= 0) {
        throw new Error(`union pack returned no staged partials (maxN=${maxN}, members=${members.length})`);
      }
      packCount++;
      totalUnionWindows += plan.totalWindows;

      // Scatter: member j owns windows [schedOff_j, schedOff_j + numWindows_j) of the
      // concatenated union output. The reduce ships early-exit staged partials
      // (window-major: `partialsPerWindow * 96` bytes per global window), so slice
      // this member's window range out of the pack's staged region — the C++ hook
      // runs finish_and_combine_windows on it, exactly as the per-MSM path does.
      // `c` is per-member (the member's own geom.c, NOT the envelope c of maxN).
      const perWindowBytes = partialsPerWindow * 96;
      for (let j = 0; j < members.length; j++) {
        const d = plan.descs[j];
        const start = d.schedOff * perWindowBytes;
        const len = d.numWindows * perWindowBytes;
        results.push({
          descIdx: members[j].descIdx,
          stagedBytes: stagedPartials.slice(start, start + len),
          numWindows: d.numWindows,
          partialsPerWindow,
          c: d.geom.c,
          resultOff: members[j].resultOff,
        });
      }
    }
  }

  return { results, fallback, packCount, totalUnionWindows };
}
