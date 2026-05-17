{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Phase 2 of the tree-reduce SMVP (v2 — rearchitected for thread util).
// See `smvp_tree_phase1.template.wgsl` header for the rank_to_raw +
// prev_raw_for_pair preamble pattern. The only differences vs Phase 1
// are at the load_point boundary (Mont-form points already in place,
// no schedule decode or sign flip) and the bucket_id source (read from
// `input_bucket_id[]` instead of `entry_bucket_id[]`).

const TPB: u32 = {{ tpb }}u;
const MAX_SLICE_ENTRIES: u32 = {{ max_slice_entries }}u;
const MAX_PAIRS: u32 = {{ max_pairs }}u;
const PER_THREAD_PAIRS: u32 = {{ per_thread_pairs }}u;

@group(0) @binding(0)
var<storage, read> input_bucket_id: array<u32>;

@group(0) @binding(1)
var<storage, read> input_x: array<BigInt>;

@group(0) @binding(2)
var<storage, read> input_y: array<BigInt>;

@group(0) @binding(3)
var<storage, read> slice_bounds: array<u32>;

@group(0) @binding(4)
var<storage, read> wg_output_offset: array<u32>;

@group(0) @binding(5)
var<storage, read_write> prefix_scratch: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> output_bucket_id: array<u32>;

@group(0) @binding(7)
var<storage, read_write> output_x: array<BigInt>;

@group(0) @binding(8)
var<storage, read_write> output_y: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}
// `get_p()` is provided by the `montgomery_product_funcs` partial.

var<workgroup> pair_idx_a: array<u32, {{ max_pairs }}>;
var<workgroup> pair_idx_b: array<u32, {{ max_pairs }}>;
var<workgroup> prev_raw_for_pair: array<u32, {{ max_pairs }}>;
var<workgroup> rank_to_raw: array<u32, {{ max_pairs }}>;
var<workgroup> pair_count: u32;
var<workgroup> num_pairs_real: u32;

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

@compute
@workgroup_size({{ tpb }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let wg_id = wid.x;
    let slice_lo = slice_bounds[wg_id];
    let slice_hi = slice_bounds[wg_id + 1u];
    let out_base = wg_output_offset[wg_id];

    if (tid == 0u) {
        var count: u32 = 0u;
        var pair_real: u32 = 0u;
        var open_idx: u32 = 0xffffffffu;
        var open_bucket: u32 = 0xffffffffu;
        var last_pair_raw: u32 = 0xffffffffu;
        for (var i: u32 = 0u; i < MAX_SLICE_ENTRIES; i = i + 1u) {
            let entry_idx = slice_lo + i;
            if (entry_idx >= slice_hi) { break; }
            let b = input_bucket_id[entry_idx];
            if (open_idx != 0xffffffffu && b == open_bucket) {
                let raw = count;
                pair_idx_a[raw] = open_idx;
                pair_idx_b[raw] = entry_idx;
                prev_raw_for_pair[raw] = last_pair_raw;
                rank_to_raw[pair_real] = raw;
                output_bucket_id[out_base + raw] = b;
                count = count + 1u;
                pair_real = pair_real + 1u;
                last_pair_raw = raw;
                open_idx = 0xffffffffu;
                open_bucket = 0xffffffffu;
            } else {
                if (open_idx != 0xffffffffu) {
                    let raw = count;
                    pair_idx_a[raw] = open_idx;
                    pair_idx_b[raw] = 0xffffffffu;
                    prev_raw_for_pair[raw] = 0xffffffffu;
                    output_bucket_id[out_base + raw] = open_bucket;
                    count = count + 1u;
                }
                open_idx = entry_idx;
                open_bucket = b;
            }
        }
        if (open_idx != 0xffffffffu) {
            let raw = count;
            pair_idx_a[raw] = open_idx;
            pair_idx_b[raw] = 0xffffffffu;
            prev_raw_for_pair[raw] = 0xffffffffu;
            output_bucket_id[out_base + raw] = open_bucket;
            count = count + 1u;
        }
        pair_count = count;
        num_pairs_real = pair_real;
    }
    workgroupBarrier();

    let total_outputs = pair_count;
    let total_pairs = num_pairs_real;

    let chunk_start_rank = tid * PER_THREAD_PAIRS;
    var block_total: BigInt = get_r();
    for (var t: u32 = 0u; t < PER_THREAD_PAIRS; t = t + 1u) {
        let rank = chunk_start_rank + t;
        if (rank >= total_pairs) { break; }
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_a[raw];
        let idx_b = pair_idx_b[raw];
        var p_x: BigInt = input_x[idx_a];
        var q_x: BigInt = input_x[idx_b];
        var dx: BigInt = fr_sub(&q_x, &p_x);
        if (t == 0u) {
            block_total = dx;
        } else {
            block_total = montgomery_product(&block_total, &dx);
        }
        prefix_scratch[wg_id * MAX_PAIRS + raw] = block_total;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: BigInt = wg_fwd[tid];
        if (tid >= stride) {
            var lhs: BigInt = wg_fwd[tid - stride];
            fwd_x = montgomery_product(&lhs, &fwd_x);
        }
        var bwd_x: BigInt = wg_bwd[tid];
        if (tid + stride < TPB) {
            var rhs: BigInt = wg_bwd[tid + stride];
            bwd_x = montgomery_product(&bwd_x, &rhs);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        wg_bwd[tid] = bwd_x;
        workgroupBarrier();
    }

    if (tid == 0u) {
        if (total_pairs > 0u) {
            var global_total: BigInt = wg_fwd[TPB - 1u];
            wg_inv_total = fr_inv_by_a(global_total);
        }
    }
    workgroupBarrier();

    var block_excl_prefix: BigInt = get_r();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigInt = get_r();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }
    var inv_acc: BigInt;
    if (total_pairs == 0u) {
        inv_acc = get_r();
    } else {
        var inv_global: BigInt = wg_inv_total;
        inv_acc = montgomery_product(&inv_global, &block_excl_prefix);
        inv_acc = montgomery_product(&inv_acc, &block_excl_suffix);
    }

    var thread_pair_count: u32 = 0u;
    if (chunk_start_rank < total_pairs) {
        let avail = total_pairs - chunk_start_rank;
        if (avail >= PER_THREAD_PAIRS) {
            thread_pair_count = PER_THREAD_PAIRS;
        } else {
            thread_pair_count = avail;
        }
    }
    var inv_acc_local: BigInt = inv_acc;
    for (var off: u32 = 0u; off < PER_THREAD_PAIRS; off = off + 1u) {
        if (off >= thread_pair_count) { break; }
        let rank = chunk_start_rank + (thread_pair_count - 1u - off);
        let raw = rank_to_raw[rank];
        let idx_a = pair_idx_a[raw];
        let idx_b = pair_idx_b[raw];
        var p_x: BigInt = input_x[idx_a];
        var p_y: BigInt = input_y[idx_a];
        var q_x: BigInt = input_x[idx_b];
        var q_y: BigInt = input_y[idx_b];

        var inv_dx: BigInt;
        if (rank == chunk_start_rank) {
            inv_dx = inv_acc_local;
        } else {
            let prev_raw = prev_raw_for_pair[raw];
            var prev_prefix: BigInt = prefix_scratch[wg_id * MAX_PAIRS + prev_raw];
            inv_dx = montgomery_product(&inv_acc_local, &prev_prefix);
        }

        var dy: BigInt = fr_sub(&q_y, &p_y);
        var slope: BigInt = montgomery_product(&dy, &inv_dx);
        var slope_sq: BigInt = montgomery_product(&slope, &slope);
        var t1: BigInt = fr_sub(&slope_sq, &p_x);
        var r_x: BigInt = fr_sub(&t1, &q_x);
        var dx_back: BigInt = fr_sub(&p_x, &r_x);
        var ldx: BigInt = montgomery_product(&slope, &dx_back);
        var r_y: BigInt = fr_sub(&ldx, &p_y);

        output_x[out_base + raw] = r_x;
        output_y[out_base + raw] = r_y;

        if (rank > chunk_start_rank) {
            var dx_k: BigInt = fr_sub(&q_x, &p_x);
            inv_acc_local = montgomery_product(&inv_acc_local, &dx_k);
        }
    }

    for (var off: u32 = 0u; off < (MAX_PAIRS + TPB - 1u) / TPB; off = off + 1u) {
        let i = tid + off * TPB;
        if (i >= total_outputs) { break; }
        let idx_b = pair_idx_b[i];
        if (idx_b != 0xffffffffu) { continue; }
        let idx_a = pair_idx_a[i];
        output_x[out_base + i] = input_x[idx_a];
        output_y[out_base + i] = input_y[idx_a];
    }

    {{{ recompile }}}
}
