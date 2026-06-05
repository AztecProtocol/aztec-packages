// MSM bucket-accumulate planner — pass B of 2: parallel plan emit.
//
// Dispatch (ceil(BW/TPB), NUM_WINDOWS): one workgroup per (bucket-group,
// window), one thread per bucket. Reads the per-bucket offsets pass A
// (ba_planner_v2_offsets) computed and emits the pair-block / scatter /
// carry plan entries — the O(pairs) work, now spread across NUM_GROUPS *
// NUM_WINDOWS workgroups instead of one workgroup per window.
//
// "pair_block": the unit of fused-affine-add work. The pair-tree level loop
// pulls pairs S at a time (one block) and feeds them through a shared
// batched inversion. Each window's pairs are packed into
// `pair_blocks_per_window` blocks of S pairs each; `pair_block_plan` holds
// 2*S u32 per block (S left-indices + S right-indices).
//
// The window-local pair prefix is derived as
//   new_offsets[b] - w*wstride - carry_off[b].
// After emitting, the window's NUM_GROUPS workgroups cooperatively pad
// the plan tail (lever-E self-pad) with the pad trio. The emit writes
// plan slots [0, total_pairs) and the pad writes [total_pairs, block
// slots) — disjoint ranges, so no ordering between them is needed.

// TPB (workgroup_size), PAIR_CAP (pool-invariant = ceil(srsN/2)+16, break-bounded)
// and S (fixed HIGH_MEM_S) stay baked. The window geometry (BW, num_windows;
// num_groups = BW/TPB) rides the `geom` uniform so the WGSL is one-program.
const TPB: u32 = {{ workgroup_size }}u;
const PAIR_CAP: u32 = {{ pair_cap }}u;
const S: u32 = {{ s }}u;

@group(0) @binding(0) var<storage, read>       counts:       array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:      array<u32>;
@group(0) @binding(2) var<storage, read>       carry_off:    array<u32>;
@group(0) @binding(3) var<storage, read>       new_offsets:  array<u32>;
@group(0) @binding(4) var<storage, read>       plan_meta:    array<u32>;
@group(0) @binding(5) var<storage, read_write> pair_block_plan: array<u32>;
@group(0) @binding(6) var<storage, read_write> scatter_plan:    array<u32>;
@group(0) @binding(7) var<storage, read_write> carry_plan:      array<u32>;
@group(0) @binding(8) var<uniform>             params:          vec4<u32>;
@group(0) @binding(9) var<uniform>             pad_params:      vec4<u32>;
@group(0) @binding(10) var<uniform>            geom:            vec4<u32>; // x=BW, y=num_windows

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let bg = wid.x;
    let w = wid.y;
    let BW = geom.x;
    let NUM_WINDOWS = geom.y;
    let NUM_GROUPS = BW / TPB;
    if (w >= NUM_WINDOWS) { return; }

    let pair_blocks_per_window = params.x;
    let carries_per_window     = params.y;
    let wstride                = params.w;
    let window_block_base      = w * pair_blocks_per_window;
    let window_carry_base      = w * carries_per_window;

    // Emit this bucket's pair / carry plan entries.
    let b_local = bg * TPB + tid;
    if (b_local < BW) {
        let b = w * BW + b_local;
        let n = counts[b];
        let pc = n / 2u;
        let cf = select(n & 1u, 0u, n == 1u);
        let bucket_base = offsets[b];
        let no = new_offsets[b];
        let co = carry_off[b];
        let po = (no - w * wstride) - co;   // window-local pair prefix

        for (var j: u32 = 0u; j < PAIR_CAP; j = j + 1u) {
            if (j >= pc) { break; }
            let slot_in_window = po + j;
            let global_block  = window_block_base + slot_in_window / S;
            let slot_in_block = slot_in_window % S;
            let flat_slot     = global_block * S + slot_in_block;
            pair_block_plan[2u * flat_slot + 0u] = bucket_base + 2u * j;
            pair_block_plan[2u * flat_slot + 1u] = bucket_base + 2u * j + 1u;
            scatter_plan[flat_slot] = no + j;
        }
        if (cf != 0u) {
            let cs = window_carry_base + co;
            carry_plan[2u * cs + 0u] = bucket_base + n - 1u;
            carry_plan[2u * cs + 1u] = no + pc;
        }
    }

    // Lever-E self-pad: the window's NUM_GROUPS workgroups cooperatively
    // fill the plan tail past the real entries with the pad trio.
    let pad_l = pad_params.x;
    let pad_r = pad_params.y;
    let pad_d = pad_params.z;
    let total_pairs   = plan_meta[3u * w + 0u];
    let total_carries = plan_meta[3u * w + 1u];
    let block_slots   = pair_blocks_per_window * S;
    let stripe = bg * TPB + tid;
    let pad_stride = NUM_GROUPS * TPB;
    for (var sp: u32 = total_pairs + stripe; sp < block_slots; sp = sp + pad_stride) {
        let flat = window_block_base * S + sp;
        pair_block_plan[2u * flat + 0u] = pad_l;
        pair_block_plan[2u * flat + 1u] = pad_r;
        scatter_plan[flat] = pad_d;
    }
    for (var sc: u32 = total_carries + stripe; sc < carries_per_window; sc = sc + pad_stride) {
        let cflat = window_carry_base + sc;
        carry_plan[2u * cflat + 0u] = pad_l;
        carry_plan[2u * cflat + 1u] = pad_d;
    }

    {{{ recompile }}}
}
