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

// Partial sum reduction for split buckets.
//
// One workgroup per split bucket. Reads (bucket_idx, first_thread,
// last_thread_exclusive) from partial_buckets_list. Reduces the
// partials using pairwise affine addition with S=8 batched inversion.
//
// Partial slot convention:
//   Thread first_thread's partial → partials_buf slot (2*first_thread + 1)
//   Thread t (for t > first_thread) → partials_buf slot (2*t)
//
// params.x = M_partials  (partials_buf stride = 2 * NUM_THREADS)
// params.y = M_buckets   (bucket_sums stride = B_TOTAL)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       partial_buckets_list: array<u32>;
@group(0) @binding(1) var<storage, read_write> partials_buf:         array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> bucket_sums:          array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       planner_meta:         array<u32>;
@group(0) @binding(4) var<storage, read_write> pref_scratch:         array<vec4<u32>>;
@group(0) @binding(5) var<uniform>             params:               vec4<u32>;

fn load_partial_x(slot: u32, M: u32) -> array<u32, 8> {
    let base = PG * slot;
    let q0 = partials_buf[base + 0u];
    let q1 = partials_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_partial_y(slot: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * slot;
    let q0 = partials_buf[base + 0u];
    let q1 = partials_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_partial(slot: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * slot;
    partials_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    partials_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * slot;
    partials_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    partials_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_pref_ps(slot: u32, val: array<u32, 8>) {
    let base = 2u * slot;
    pref_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref_ps(slot: u32) -> array<u32, 8> {
    let base = 2u * slot;
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

// Maps a logical partial index to its slot in partials_buf.
// Index 0 = the start-of-split piece (slot 2*ft+1).
// Index i>0 = continuation pieces (slot 2*(ft+i)).
fn get_partial_slot(first_thread: u32, i: u32) -> u32 {
    if (i == 0u) { return 2u * first_thread + 1u; }
    return 2u * (first_thread + i);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let sb_idx = wid.x;
    let tid = lid.x;
    let num_split = planner_meta[4];
    let M_partials = params.x;
    let M_buckets = params.y;

    if (sb_idx >= num_split) { return; }

    let bucket_idx = partial_buckets_list[3u * sb_idx + 0u];
    let first_thread = partial_buckets_list[3u * sb_idx + 1u];
    let last_thread = partial_buckets_list[3u * sb_idx + 2u];
    let n_partials = last_thread - first_thread;
    if (n_partials == 0u) { return; }

    let TPB = {{ workgroup_size }}u;
    var n_active = n_partials;
    var stride: u32 = 1u;

    while (n_active > 1u) {
        let n_pairs = n_active / 2u;
        let my_start = tid * S;
        if (my_start < n_pairs) {
            let my_end = min(my_start + S, n_pairs);
            let batch_size = my_end - my_start;
            let pref_off = sb_idx * TPB * S + tid * S;

            var acc: array<u32, 8> = get_r_f8();
            for (var k: u32 = 0u; k < batch_size; k = k + 1u) {
                let pair_idx = my_start + k;
                let left_logical = pair_idx * 2u * stride;
                let right_logical = left_logical + stride;
                let left_slot = get_partial_slot(first_thread, left_logical);
                let right_slot = get_partial_slot(first_thread, right_logical);
                let p_lx = load_partial_x(left_slot, M_partials);
                let p_rx = load_partial_x(right_slot, M_partials);
                let dx = fr_sub_f8(p_rx, p_lx);
                if (k == 0u) { acc = dx; } else { acc = montgomery_product_f8(acc, dx); }
                store_pref_ps(pref_off + k, acc);
            }

            var acc20 = unpack256_to_limbs(acc);
            var inv20 = {{ inv_fn }}(acc20);
            var inv_val = pack_limbs_to_256(&inv20);

            for (var jj: u32 = 0u; jj < batch_size; jj = jj + 1u) {
                let k = batch_size - 1u - jj;
                var inv_dx: array<u32, 8>;
                if (k == 0u) {
                    inv_dx = inv_val;
                } else {
                    let pp = load_pref_ps(pref_off + k - 1u);
                    inv_dx = montgomery_product_f8(inv_val, pp);
                    let pair_idx = my_start + k;
                    let left_logical = pair_idx * 2u * stride;
                    let right_logical = left_logical + stride;
                    let left_slot = get_partial_slot(first_thread, left_logical);
                    let right_slot = get_partial_slot(first_thread, right_logical);
                    let p_lx_b = load_partial_x(left_slot, M_partials);
                    let p_rx_b = load_partial_x(right_slot, M_partials);
                    let dx_b = fr_sub_f8(p_rx_b, p_lx_b);
                    inv_val = montgomery_product_f8(inv_val, dx_b);
                }
                store_pref_ps(pref_off + k, inv_dx);
            }

            for (var jj: u32 = 0u; jj < batch_size; jj = jj + 1u) {
                let k = batch_size - 1u - jj;
                let pair_idx = my_start + k;
                let left_logical = pair_idx * 2u * stride;
                let right_logical = left_logical + stride;
                let left_slot = get_partial_slot(first_thread, left_logical);
                let right_slot = get_partial_slot(first_thread, right_logical);
                let inv_dx = load_pref_ps(pref_off + k);
                let p_lx = load_partial_x(left_slot, M_partials);
                let p_ly = load_partial_y(left_slot, M_partials);
                let p_rx = load_partial_x(right_slot, M_partials);
                let p_ry = load_partial_y(right_slot, M_partials);

                var lambda = fr_sub_f8(p_ry, p_ly);
                lambda = montgomery_product_f8(lambda, inv_dx);

                var r_x = montgomery_product_f8(lambda, lambda);
                let x_sum_val = fr_add_f8(p_lx, p_rx);
                r_x = fr_sub_f8(r_x, x_sum_val);

                var r_y = fr_sub_f8(p_lx, r_x);
                r_y = montgomery_product_f8(lambda, r_y);
                r_y = fr_sub_f8(r_y, p_ly);

                store_partial(left_slot, M_partials, r_x, r_y);
            }
        }

        storageBarrier();
        n_active = (n_active + 1u) / 2u;
        stride *= 2u;
    }

    if (tid == 0u) {
        let final_slot = get_partial_slot(first_thread, 0u);
        let sum_x = load_partial_x(final_slot, M_partials);
        let sum_y = load_partial_y(final_slot, M_partials);
        let bx = PG * bucket_idx;
        bucket_sums[bx + 0u] = vec4<u32>(sum_x[0], sum_x[1], sum_x[2], sum_x[3]);
        bucket_sums[bx + 1u] = vec4<u32>(sum_x[4], sum_x[5], sum_x[6], sum_x[7]);
        let by = PG * M_buckets + PG * bucket_idx;
        bucket_sums[by + 0u] = vec4<u32>(sum_y[0], sum_y[1], sum_y[2], sum_y[3]);
        bucket_sums[by + 1u] = vec4<u32>(sum_y[4], sum_y[5], sum_y[6], sum_y[7]);
    }

    {{{ recompile }}}
}
