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
    let n_threads = last_thread - first_thread;

    // Build slot list: first_thread → slot 2*first_thread+1,
    // subsequent threads → slot 2*t.
    // n_partials = n_threads (one partial per thread in the range).
    let n_partials = n_threads;

    // Sequential reduction by thread 0 using batched inversion.
    if (tid != 0u) { return; }
    if (n_partials == 0u) { return; }

    // Load first partial as the accumulator.
    let slot0 = 2u * first_thread + 1u;
    var sum_x = load_partial_x(slot0, M_partials);
    var sum_y = load_partial_y(slot0, M_partials);

    // Add remaining partials in batches of S.
    var i: u32 = 1u;
    while (i < n_partials) {
        let batch_end = min(i + S, n_partials);
        let batch_size = batch_end - i;

        // Forward prefix.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < batch_size; k = k + 1u) {
            let thread_idx = first_thread + i + k;
            let slot = 2u * thread_idx;
            let p_rx = load_partial_x(slot, M_partials);
            let dx = fr_sub_f8(p_rx, sum_x);
            if (k == 0u) {
                acc = dx;
            } else {
                acc = montgomery_product_f8(acc, dx);
            }
            store_pref_ps(k, acc);
        }

        // Single inversion.
        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        var inv_val = pack_limbs_to_256(&inv20);

        // Inverse pass.
        for (var jj: u32 = 0u; jj < batch_size; jj = jj + 1u) {
            let k = batch_size - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv_val;
            } else {
                let pp = load_pref_ps(k - 1u);
                inv_dx = montgomery_product_f8(inv_val, pp);
                let thread_idx = first_thread + i + k;
                let slot = 2u * thread_idx;
                let p_rx = load_partial_x(slot, M_partials);
                let dx_b = fr_sub_f8(p_rx, sum_x);
                inv_val = montgomery_product_f8(inv_val, dx_b);
            }
            store_pref_ps(k, inv_dx);
        }

        // Backward peel: add each partial to sum.
        for (var jj: u32 = 0u; jj < batch_size; jj = jj + 1u) {
            let k = batch_size - 1u - jj;
            let thread_idx = first_thread + i + k;
            let slot = 2u * thread_idx;
            let inv_dx = load_pref_ps(k);
            let p_rx = load_partial_x(slot, M_partials);
            let p_ry = load_partial_y(slot, M_partials);

            var lambda = fr_sub_f8(p_ry, sum_y);
            lambda = montgomery_product_f8(lambda, inv_dx);

            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum_val = fr_add_f8(sum_x, p_rx);
            r_x = fr_sub_f8(r_x, x_sum_val);

            var r_y = fr_sub_f8(sum_x, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, sum_y);

            sum_x = r_x;
            sum_y = r_y;
        }

        i = batch_end;
    }

    // Write final sum to bucket_sums.
    let bx = PG * bucket_idx;
    bucket_sums[bx + 0u] = vec4<u32>(sum_x[0], sum_x[1], sum_x[2], sum_x[3]);
    bucket_sums[bx + 1u] = vec4<u32>(sum_x[4], sum_x[5], sum_x[6], sum_x[7]);
    let by = PG * M_buckets + PG * bucket_idx;
    bucket_sums[by + 0u] = vec4<u32>(sum_y[0], sum_y[1], sum_y[2], sum_y[3]);
    bucket_sums[by + 1u] = vec4<u32>(sum_y[4], sum_y[5], sum_y[6], sum_y[7]);

    {{{ recompile }}}
}
