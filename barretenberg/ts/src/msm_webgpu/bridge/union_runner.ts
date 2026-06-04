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

import { MsmV2 } from '../msm_v2.js';
import { packByBudget, planBatch, unionFootprintBytes } from '../batch_scheduler.js';

type Pt = { x: bigint; y: bigint };

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

/** One member's result from the union path: its per-window sums sliced out of the
 *  pack's concatenated `windowSums`, plus the facts the caller writes back. */
export interface UnionMemberResult {
  /** Index into the original descriptor array (drives result/meta scatter position). */
  descIdx: number;
  windows: Pt[];
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

  // ── Split: the union assumes each member's points are the SRS prefix [0,n). A
  // nonzero srsOffset or reserved pointer means an off-prefix / off-SRS source —
  // exclude it (the caller's per-MSM path threads srsOffset / builds a one-off pool).
  interface Candidate {
    descIdx: number;
    n: number;
    scalarsOff: number;
    resultOff: number;
  }
  const candidates: Candidate[] = [];
  for (let i = 0; i < descriptors.length; i++) {
    const d = descriptors[i];
    if (d.srsOffset !== 0 || d.reserved !== 0) {
      fallback.push(i);
      continue;
    }
    candidates.push({ descIdx: i, n: d.n, scalarsOff: d.scalarsOff, resultOff: d.resultOff });
  }

  if (candidates.length === 0) {
    return { results, fallback, packCount: 0, totalUnionWindows: 0 };
  }

  // ── Pack against the runtime-accurate union footprint so the packer never picks a
  // pack the runtime then throws on. The greedy packer preserves candidate order, so
  // each emitted pack consumes the next `descs.length` candidates — recover the
  // candidate groups by walking a cursor.
  const layouts = packByBudget(
    candidates.map((c) => ({ n: c.n })),
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

  let packCount = 0;
  let totalUnionWindows = 0;

  // Process packs one at a time (peak GPU mem = pool + one pack's arena). A budget
  // miss by the host model degrades gracefully: drop the last member to its own solo
  // pack and retry the smaller pack, so a model error never errors the prove.
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    if (group.length === 0) continue;
    const members = group.map((ci) => candidates[ci]);
    const maxN = members.reduce((a, m) => Math.max(a, m.n), 0);

    const plan = planBatch(members.map((m) => ({ n: m.n, srsOffset: 0 })));
    // Concatenate the members' scalars into planBatch's layout. The descriptor's
    // scalarsOff is the C++ batch layout; planBatch computes its OWN scalarBase —
    // they are NOT equal, so this copy (reorder) is mandatory.
    const concat = new Uint8Array(plan.totalScalarBytes);
    for (let j = 0; j < members.length; j++) {
      const src = readScalars(members[j].scalarsOff, members[j].n * SCALAR_BYTES);
      concat.set(src, plan.descs[j].scalarBase);
    }
    const batchMembers = plan.descs.map((d) => ({
      n: d.n,
      scalarBaseBytes: d.scalarBase,
      schedOff: d.schedOff,
      numWindows: d.numWindows,
    }));

    const inst = await getUnionMsm(maxN);
    try {
      inst.prepareBatch(batchMembers, concat, plan.windowDescTable, plan.reduceOffsets);
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

    const { windowSums } = await inst.run();
    packCount++;
    totalUnionWindows += plan.totalWindows;

    // Scatter: member j owns windows [schedOff_j, schedOff_j + numWindows_j) of the
    // concatenated union output. `c` is per-member (the member's own geom.c, NOT the
    // envelope c of the maxN instance).
    for (let j = 0; j < members.length; j++) {
      const d = plan.descs[j];
      results.push({
        descIdx: members[j].descIdx,
        windows: windowSums.slice(d.schedOff, d.schedOff + d.numWindows),
        c: d.geom.c,
        resultOff: members[j].resultOff,
      });
    }
  }

  return { results, fallback, packCount, totalUnionWindows };
}
