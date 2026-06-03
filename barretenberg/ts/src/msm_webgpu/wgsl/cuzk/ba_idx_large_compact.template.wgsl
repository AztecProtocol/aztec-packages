// idx_large compaction for split-c region-split (Phase 2). Compacts the indices of
// scalars whose MSB lands in the upper region (msb >= b_star-1; the boundary bit is
// included so the upper region cancels the negative-signed digit the lower region's
// last window emits) into idx_large[0..n_large). Reuses msb_per_scalar from the
// histogram kernel — the MSB is computed once, never re-read from the scalar.
//
// b_star comes from the decide kernel's summary (GPU-resident). For NO_SPLIT
// (b_star == 0) every thread early-returns and n_large stays 0. Output order is
// arbitrary (atomic claim order); the final MSM is order-invariant since each
// bucket is a sum of points, so the upper region's point ordering doesn't matter.
//
// idx_large_count must be cleared to 0 before dispatch; it ends == summary[4].

@group(0) @binding(0) var<storage, read>            msb_per_scalar:  array<u32>;
@group(0) @binding(1) var<storage, read>            summary:         array<u32>;       // [1] = b_star
@group(0) @binding(2) var<storage, read_write>      idx_large:       array<u32>;
@group(0) @binding(3) var<storage, read_write>      idx_large_count: atomic<u32>;
@group(0) @binding(4) var<uniform>                  params:          vec4<u32>;        // .x = n

const MSB_ZERO_SENTINEL: u32 = 255u;

// Workgroup-aggregated claim: one global atomicAdd per workgroup (not per thread)
// to cut contention when n_large is large.
var<workgroup> wg_count: atomic<u32>;
var<workgroup> wg_base: u32;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    if (lid.x == 0u) { atomicStore(&wg_count, 0u); }
    workgroupBarrier();

    let i = gid.x;
    let b_star = summary[1];
    let n = params.x;
    var is_large = false;
    var slot_local = 0u;
    if (b_star != 0u && i < n) {
        let msb = msb_per_scalar[i];
        // threshold = b_star - 1 (b_star >= 16 from the grid, so no underflow).
        if (msb != MSB_ZERO_SENTINEL && msb >= b_star - 1u) {
            is_large = true;
            slot_local = atomicAdd(&wg_count, 1u);
        }
    }
    workgroupBarrier();

    if (lid.x == 0u) {
        wg_base = atomicAdd(&idx_large_count, atomicLoad(&wg_count));
    }
    workgroupBarrier();

    if (is_large) {
        idx_large[wg_base + slot_local] = i;
    }

    {{{ recompile }}}
}
