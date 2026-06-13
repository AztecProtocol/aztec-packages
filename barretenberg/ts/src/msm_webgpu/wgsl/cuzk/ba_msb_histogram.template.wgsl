// MSB histogram for the split-c variable-window decision (SPLIT_C_PLAN.md Phase 1).
//
// Each thread reads one scalar, finds its most-significant set bit, and bumps the
// matching bin in a workgroup-private 256-bin histogram; each workgroup then
// atomically merges its bins into the global msb_hist. Bin layout matches the C++
// reference (record_msb): bin 0 = #zero scalars, bin (k+1) = #{scalars with msb == k}.
//
// Also writes msb_per_scalar[i] = the scalar's msb (MSB_ZERO_SENTINEL=255 for zero)
// so Phase 2's idx_large compaction reuses the msb instead of re-reading the scalar.
// Scalars are normal (non-Montgomery) form, `scalar_words` u32 limbs, little-endian
// — the same layout decompose_scalars_booth reads.

@group(0) @binding(0) var<storage, read>       scalars:        array<u32>;
@group(0) @binding(1) var<storage, read_write> msb_hist:       array<atomic<u32>, 256>;
@group(0) @binding(2) var<storage, read_write> msb_per_scalar: array<u32>;
@group(0) @binding(3) var<uniform>             params:         vec4<u32>;
// params.x = n (scalar count), params.y = scalar_words (u32 words per scalar)

const MSB_ZERO_SENTINEL: u32 = 255u;

var<workgroup> local_hist: array<atomic<u32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(global_invocation_id) gid: vec3<u32>) {
    let tid = lid.x;
    atomicStore(&local_hist[tid], 0u);
    workgroupBarrier();

    let n = params.x;
    let scalar_words = params.y;
    let i = gid.x;
    if (i < n) {
        let base = i * scalar_words;
        // Scan limbs high→low; the first non-zero limb carries the msb.
        var msb: i32 = -1;
        var w = scalar_words;
        loop {
            if (w == 0u) { break; }
            w = w - 1u;
            let v = scalars[base + w];
            if (v != 0u) {
                msb = i32(w * 32u + 31u - countLeadingZeros(v));
                break;
            }
        }
        atomicAdd(&local_hist[u32(msb + 1)], 1u); // bin = msb + 1 (msb=-1 → bin 0)
        msb_per_scalar[i] = select(u32(msb), MSB_ZERO_SENTINEL, msb < 0);
    }
    workgroupBarrier();

    let c = atomicLoad(&local_hist[tid]);
    if (c != 0u) {
        atomicAdd(&msb_hist[tid], c);
    }

    {{{ recompile }}}
}
