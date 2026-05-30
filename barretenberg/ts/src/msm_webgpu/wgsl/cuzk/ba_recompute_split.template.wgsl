{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Recompute ONLY the split-bucket sums sequentially. One thread per split.
// Reads partial_buckets_list[3*i] for the bucket index and uses offsets to
// derive the point range. Overwrites bucket_sums for those buckets so any
// garbage written by partial_sum is replaced with the correct value.

const PG: u32 = 2u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;
// GLV on-the-fly: value index >= GLV_HALF is a phi-term (gather idx - GLV_HALF,
// x *= Montgomery(beta)). Sentinel GLV_HALF disables it on the non-GLV path.
const GLV_HALF: u32 = {{ glv_half }}u;
fn beta_mont_f8() -> array<u32, 8> { return array<u32, 8>({{ beta8_csv }}); }

@group(0) @binding(0) var<storage, read>       partial_buckets_list: array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:              array<u32>;
@group(0) @binding(2) var<storage, read>       l0_index:             array<u32>;
@group(0) @binding(3) var<storage, read>       point_x:              array<vec4<u32>>;
@group(0) @binding(4) var<storage, read>       point_y:              array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> bucket_sums:          array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       planner_meta:         array<u32>;
@group(0) @binding(7) var<uniform>             params:               vec4<u32>;
// params.x = M_buckets (B_TOTAL)
// params.y = bucket_count_max (n: cap on the bucket scan)


fn ld_x(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let raw = packed & L0_IDX_MASK;
    let is_phi = raw >= GLV_HALF;
    let pt = select(raw, raw - GLV_HALF, is_phi);
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    let x = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if (is_phi) { return montgomery_product_f8(beta_mont_f8(), x); }
    return x;
}

fn ld_y(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let raw = packed & L0_IDX_MASK;
    let pt = select(raw, raw - GLV_HALF, raw >= GLV_HALF);
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) { return y; }
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let num_split = planner_meta[4];
    let M_buckets = params.x;
    let n_total = params.y;
    let t = gid.x;

    if (t >= num_split) { return; }

    let bucket_idx = partial_buckets_list[3u * t + 0u];
    let off = offsets[bucket_idx];
    // count = offsets[bucket_idx+1] - off; the very last bucket of the
    // batch has its count bounded by n_total.
    var next_off: u32 = n_total;
    if (bucket_idx + 1u < M_buckets) { next_off = offsets[bucket_idx + 1u]; }
    let count = next_off - off;

    if (count < 2u) { return; }

    var acc_x = ld_x(off);
    var acc_y = ld_y(off);
    var p_rx = ld_x(off + 1u);
    var p_ry = ld_y(off + 1u);

    var dx = fr_sub_f8(p_rx, acc_x);
    var acc20 = unpack256_to_limbs(dx);
    var inv20 = {{ inv_fn }}(acc20);
    var inv_dx = pack_limbs_to_256(&inv20);

    var lambda = fr_sub_f8(p_ry, acc_y);
    lambda = montgomery_product_f8(lambda, inv_dx);
    var r_x = montgomery_product_f8(lambda, lambda);
    var x_sum = fr_add_f8(acc_x, p_rx);
    r_x = fr_sub_f8(r_x, x_sum);
    var r_y = fr_sub_f8(acc_x, r_x);
    r_y = montgomery_product_f8(lambda, r_y);
    r_y = fr_sub_f8(r_y, acc_y);
    acc_x = r_x;
    acc_y = r_y;

    for (var j: u32 = 2u; j < count; j = j + 1u) {
        p_rx = ld_x(off + j);
        p_ry = ld_y(off + j);
        dx = fr_sub_f8(p_rx, acc_x);
        acc20 = unpack256_to_limbs(dx);
        inv20 = {{ inv_fn }}(acc20);
        inv_dx = pack_limbs_to_256(&inv20);
        lambda = fr_sub_f8(p_ry, acc_y);
        lambda = montgomery_product_f8(lambda, inv_dx);
        r_x = montgomery_product_f8(lambda, lambda);
        x_sum = fr_add_f8(acc_x, p_rx);
        r_x = fr_sub_f8(r_x, x_sum);
        r_y = fr_sub_f8(acc_x, r_x);
        r_y = montgomery_product_f8(lambda, r_y);
        r_y = fr_sub_f8(r_y, acc_y);
        acc_x = r_x;
        acc_y = r_y;
    }

    let bx = PG * bucket_idx;
    bucket_sums[bx + 0u] = vec4<u32>(acc_x[0], acc_x[1], acc_x[2], acc_x[3]);
    bucket_sums[bx + 1u] = vec4<u32>(acc_x[4], acc_x[5], acc_x[6], acc_x[7]);
    let by = PG * M_buckets + PG * bucket_idx;
    bucket_sums[by + 0u] = vec4<u32>(acc_y[0], acc_y[1], acc_y[2], acc_y[3]);
    bucket_sums[by + 1u] = vec4<u32>(acc_y[4], acc_y[5], acc_y[6], acc_y[7]);

    {{{ recompile }}}
}
