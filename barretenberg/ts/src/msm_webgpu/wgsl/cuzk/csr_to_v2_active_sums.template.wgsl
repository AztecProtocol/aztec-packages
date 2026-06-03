// Layout converter for the v2 pair-tree MSM bucket-accumulate path.
//
// Materializes the bucket-major active_sums buffer — in the 2-plane SoA
// layout the v2 pair-tree consumes — by copying packed 8-u32 base coords
// from new_point_x / new_point_y at the indices listed in val_idx (cuZK
// transpose output, bucket-major per subtask).
//
// active_sums layout: ONE buffer, two planes. PG = 2 vec4 per element;
// plane p (0 = x, 1 = y) base = p * PG * M, where M is the element
// stride. Element e of plane p occupies vec4 indices p*PG*M + PG*e + {0,1}.
//
// Per slot k in [0, total_slots): pt_idx = val_idx[k]; copy
// new_point_x[pt_idx] -> plane 0 slot k, new_point_y[pt_idx] -> plane 1.
// The slot index is global: subtask s contributes slots
// [s*input_size, (s+1)*input_size), and input_size matches the v2
// per-window stride, so the slot IS the active_sums element index.
//
// Sign handling: rendered with `with_sign` when fed by the carry-free
// signed-Booth decompose, which emits a per-(window, point) packed entry
// in `bucket_and_sign`. The sign lives at bit 31; a 1 means the point
// is added negated, so the y plane is sourced from new_point_y_neg (the
// precomputed field negation -y); x is unchanged. Without `with_sign`
// the converter is a plain copy (cuZK's signed-slice path folds the
// sign into the bucket).
//
// Lever B (`index_mode`): instead of materializing a 64-byte point per
// slot, write a 4-byte value — the point index in the low 31 bits, the
// sign bit in bit 31. active_sums is then a flat u32 array, 16x smaller.
// The level-0 pair-tree kernels (fused / carry / finalize, l0_index_mode)
// gather the actual point from the pool and negate y on the sign bit.
{{#index_mode}}
@group(0) @binding(0) var<storage, read>       val_idx:     array<u32>;
@group(0) @binding(1) var<storage, read_write> active_sums: array<u32>;
// params[0] = total_slots
// params[1] = base_offset (added to every pt_idx so the L0 pair-tree shaders
//             gather from `pool[pt_idx + base_offset]`; lets a single uploaded
//             SRS pool serve every commit regardless of the polynomial's
//             start_index in the C++ SRS)
// params[2] = wstride
// params[3] = input_size
@group(0) @binding(2) var<uniform>             params:          vec4<u32>;
// One u32 per (window, point): low 31 bits = bucket index (we don't need
// it here), bit 31 = sign. Replaces the old `signs: array<u32>` buffer —
// the bucket and sign are packed at decompose time to halve the working set.
@group(0) @binding(3) var<storage, read>       bucket_and_sign: array<u32>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    if (slot >= params[0]) {
        return;
    }
    // val_idx packs the point index (low 31 bits) + the digit sign (bit 31), set
    // by the transpose scatter. Reading the sign here (not via bucket_and_sign)
    // keeps this region-agnostic: the split-c upper region stores ORIGINAL
    // indices (idx_large[i]) that differ from the bucket_and_sign slot i.
    let packed = val_idx[slot];
    let pt_idx = packed & 0x7FFFFFFFu;
    let neg = packed >> 31u;
    // Bake the SRS base_offset into the index BEFORE storing — downstream L0
    // shaders (ba_fused_super, ba_carry_copy, ba_finalize) gather points via
    // `point_x[2 * (active_sums[idx] & L0_IDX_MASK)]` without touching the
    // offset themselves. 31 bits of address space (max ~2.1B) is plenty for
    // any realistic SRS size.
    let pt_real = pt_idx + params[1];
    active_sums[slot] = pt_real | (neg << 31u);

    {{{ recompile }}}
}
{{/index_mode}}
{{^index_mode}}
@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> active_sums: array<vec4<u32>>;

// params[0] = total_slots (num_subtasks * input_size)
// params[1] = M           (active_sums element stride; plane stride = PG*M)
// params[2] = wstride     (per-window slot stride; with_sign only)
// params[3] = input_size  (bucket_and_sign stride = per-window point count; with_sign)
@group(0) @binding(4)
var<uniform> params: vec4<u32>;
{{#with_sign}}
// Precomputed field negation -y of every pool point, same layout as
// new_point_y; selected per slot when the digit sign bit is set.
@group(0) @binding(5)
var<storage, read> new_point_y_neg: array<vec4<u32>>;
// bucket_and_sign[window*input_size + pt_idx]: bit 31 = sign (1 => negate y).
// We only consume the sign here; the bucket bits were used by the transpose
// to build the CSR. See decompose_scalars_booth header for the packing.
@group(0) @binding(6)
var<storage, read> bucket_and_sign: array<u32>;
{{/with_sign}}

const PG: u32 = 2u;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let total = params[0];
    if (slot >= total) {
        return;
    }
    let m = params[1];

    let pt_idx = val_idx[slot];
    let x_base = PG * slot;
    let y_base = PG * m + PG * slot;

    active_sums[x_base]      = new_point_x[2u * pt_idx];
    active_sums[x_base + 1u] = new_point_x[2u * pt_idx + 1u];
{{#with_sign}}
    let window = slot / params[2];
    // Sign bit lives at bit 31 of the packed entry; constant-shift extract.
    let neg = bucket_and_sign[window * params[3] + pt_idx] >> 31u;
    if (neg == 1u) {
        active_sums[y_base]      = new_point_y_neg[2u * pt_idx];
        active_sums[y_base + 1u] = new_point_y_neg[2u * pt_idx + 1u];
    } else {
        active_sums[y_base]      = new_point_y[2u * pt_idx];
        active_sums[y_base + 1u] = new_point_y[2u * pt_idx + 1u];
    }
{{/with_sign}}
{{^with_sign}}
    active_sums[y_base]      = new_point_y[2u * pt_idx];
    active_sums[y_base + 1u] = new_point_y[2u * pt_idx + 1u];
{{/with_sign}}

    {{{ recompile }}}
}
{{/index_mode}}
