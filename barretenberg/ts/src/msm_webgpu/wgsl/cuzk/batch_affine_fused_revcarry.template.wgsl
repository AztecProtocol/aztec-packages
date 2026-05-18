{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Fused batch-affine round kernel — the ba_rev_packed_carry scheme
// applied in-place to the cuZK Pippenger bucket round.
//
// Replaces the separate batch_inverse_parallel + apply_scatter dispatches
// with ONE kernel per round. Per subtask, each thread owns a contiguous
// SCHUNK-slot slice of that subtask's scheduled pair pool and runs the
// single-inversion batch-affine trick over its slice:
//   descending: suf[k] = prod_{j>=k} dx_j   (dx_j = Q.x_j - P.x_j)
//   one fr_inv_by_a(suf[base]) for the whole slice
//   ascending : inv_dx_k recovered from suf, lean affine add, scatter
//
// Field values are stored PACKED (8x u32 = two vec4<u32>) and unpacked to
// limbs only in-register via the decoupled (full-ILP) pack/unpack. montmul
// is Karatsuba+Yuval and the inversion is BY-safegcd fr_inv_by_a (injected
// partials), exactly as in ba_rev_packed_carry.
//
// Slots in one subtask pool are distinct buckets (the scheduler pulls one
// pair per active bucket per round), so there is no intra-slice RAW hazard
// and every dx is independent — the suffix-product single inversion is
// exact. Linearly-independent generators ⇒ no doubling / ∞, so the
// unconditional lean formula is correctness-valid. Empty buckets never
// enter the pool (handled by the scheduler), so no per-pair branch.

const SCHUNK: u32 = {{ schunk }}u;

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> running_x: array<vec4<u32>>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<vec4<u32>>;
@group(0) @binding(5)
var<storage, read> pair_target_meta: array<u32>;
@group(0) @binding(6)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = num_columns ; params[1] = input_size
@group(0) @binding(7)
var<uniform> params: vec4<u32>;

{{{ dec_unpack }}}

{{{ dec_pack }}}

fn load_packed(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * base_elem];
    let q1 = (*src)[2u * base_elem + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_packed(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*src)[2u * base_elem] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*src)[2u * base_elem + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let subtask_idx = global_id.z;
    let num_columns = params[0];
    let input_size = params[1];

    let n = atomicLoad(&count_buf[subtask_idx]);
    let base = global_id.x * SCHUNK;
    if (base >= n) {
        return;
    }
    var len = SCHUNK;
    if (base + len > n) {
        len = n - base;
    }

    let vi_offset = subtask_idx * input_size;
    let pool_base = subtask_idx * num_columns;

    // Descending suffix-product of the slice's dx values; one inversion.
    var suf: array<BigInt, {{ schunk }}>;
    var acc: BigInt;
    var jj = 0u;
    loop {
        if (jj >= len) { break; }
        let k = len - 1u - jj;
        let slot = pool_base + base + k;
        let bucket = pair_target_meta[2u * slot];
        let q_cursor = pair_target_meta[2u * slot + 1u];
        let pt_idx = val_idx[vi_offset + q_cursor];
        var p_x = load_packed(bucket, &running_x);
        var q_x = load_packed(pt_idx, &new_point_x);
        var dx = fr_sub(&q_x, &p_x);
        if (jj == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        suf[k] = acc;
        jj = jj + 1u;
    }

    var inv: BigInt = fr_inv_by_a(suf[0]);

    // Ascending lean apply: recover 1/dx_k, affine-add, scatter.
    var i = 0u;
    loop {
        if (i >= len) { break; }
        let slot = pool_base + base + i;
        let bucket = pair_target_meta[2u * slot];
        let q_cursor = pair_target_meta[2u * slot + 1u];
        let pt_idx = val_idx[vi_offset + q_cursor];

        var p_x = load_packed(bucket, &running_x);
        var p_y = load_packed(bucket, &running_y);
        var q_x = load_packed(pt_idx, &new_point_x);
        var q_y = load_packed(pt_idx, &new_point_y);

        var inv_dx: BigInt;
        if (i + 1u < len) {
            var sp = suf[i + 1u];
            inv_dx = montgomery_product(&inv, &sp);
        } else {
            inv_dx = inv;
        }

        var dy = fr_sub(&q_y, &p_y);
        var lambda = montgomery_product(&dy, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_x);
        r_x = fr_sub(&r_x, &q_x);
        var dxb = fr_sub(&p_x, &r_x);
        var r_y = montgomery_product(&lambda, &dxb);
        r_y = fr_sub(&r_y, &p_y);

        store_packed(bucket, &running_x, &r_x);
        store_packed(bucket, &running_y, &r_y);

        if (i + 1u < len) {
            var dx_fwd = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dx_fwd);
        }
        i = i + 1u;
    }

    {{{ recompile }}}
}
