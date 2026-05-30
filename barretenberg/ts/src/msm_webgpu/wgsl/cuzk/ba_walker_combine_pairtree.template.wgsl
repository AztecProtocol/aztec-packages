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

// Pair-tree hot-bucket combine. One thread per bucket with N > HOT_THRESHOLD.
//
// Approach: each thread atomically claims a scratch slice of length 2N in
// pt_scratch (the 2x factor accommodates per-level shift — level k+1's
// partials live at the END of level k's range). It copies the bucket's N
// level-0 partials from partials_buf into the slice via partial_layout,
// then runs the pair-tree:
//
//   while N > 1:
//     n_pairs = N/2; odd = N & 1
//     for each batch of S pairs from level-current:
//       forward prefix on S dx's, ONE safegcd, backward — S affine adds
//       write S new partials at level-next
//     if odd: copy unpaired survivor to level-next tail
//     N = n_pairs + odd; advance level pointers
//   write final partial to bucket_sums[bid]
//
// Number of safegcds per thread = sum over levels of ceil(n_pairs/S).
// For N=64: 4+2+1+1+1+1 = 10. Sequential within thread; parallel across
// hot threads up to GPU saturation.
//
// pt_alloc[0]: atomic u32 — cleared to 0 each MSM. Each thread atomicAdds
// 2 * cnt to claim its slice start. M_scratch is the per-plane stride
// (must be sized for sum(2 * cnt) over all hot buckets in the MSM).
//
// params.x = M_partials
// params.y = M_buckets
// params.z = M_scratch
// params.w = HOT_THRESHOLD (= 8u in the cool path)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       sorted_slot_on:  array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(2) var<storage, read>       slot_on_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       partial_count:  array<u32>;
@group(0) @binding(4) var<storage, read>       partial_offset: array<u32>;
@group(0) @binding(5) var<storage, read>       partial_layout: array<u32>;
@group(0) @binding(6) var<storage, read>       partials_buf:   array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> pt_scratch:     array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> pt_alloc:       array<atomic<u32>>;
@group(0) @binding(9) var<storage, read_write> bucket_sums:    array<vec4<u32>>;
@group(0) @binding(10) var<uniform>            params:         vec4<u32>;

fn load_partials_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_partials_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_scratch_x(idx: u32) -> array<u32, 8> {
    let q0 = pt_scratch[PG * idx + 0u];
    let q1 = pt_scratch[PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_scratch_y(idx: u32, M: u32) -> array<u32, 8> {
    let q0 = pt_scratch[PG * M + PG * idx + 0u];
    let q1 = pt_scratch[PG * M + PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_scratch_x(idx: u32, v: array<u32, 8>) {
    pt_scratch[PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_scratch[PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

fn store_scratch_y(idx: u32, v: array<u32, 8>, M: u32) {
    pt_scratch[PG * M + PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_scratch[PG * M + PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let hot_idx = gid.x;
    let HOT_THRESHOLD = params.w;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = slot_on_count[0];
    let task_id = cool_end + hot_idx;
    if (task_id >= NUM_ACTIVE) { return; }

    let bid = sorted_slot_on[task_id];
    var N: u32 = partial_count[bid];
    let p_off = partial_offset[bid];
    let M_partials = params.x;
    let M_buckets = params.y;
    let M_scratch = params.z;

    if (N == 0u) { return; }

    // Claim 2N scratch slots (need 2N because level-(k+1) lives just past
    // level-k inside the same slice).
    let slice_base = atomicAdd(&pt_alloc[0], 2u * N);

    // === Initial copy: read N partials via partial_layout into scratch[slice_base..slice_base+N).
    for (var i: u32 = 0u; i < N; i = i + 1u) {
        let slot = partial_layout[p_off + i];
        let x = load_partials_x(slot);
        let y = load_partials_y(slot, M_partials);
        store_scratch_x(slice_base + i, x);
        store_scratch_y(slice_base + i, y, M_scratch);
    }

    // === Pair-tree levels.
    var off_in:  u32 = slice_base;
    var off_out: u32 = slice_base + N;
    while (N > 1u) {
        let n_pairs = N / 2u;
        let odd = N & 1u;
        var batch_start: u32 = 0u;
        while (batch_start < n_pairs) {
            let remaining = n_pairs - batch_start;
            var batch_size: u32 = S;
            if (remaining < S) { batch_size = remaining; }

            // Phase 1: load operands. For IDLE slots (k >= batch_size), reuse
            // the first pair so dx remains nonzero (≠ 0 is required by safegcd).
            var l_x: array<array<u32, 8>, {{ s }}>;
            var l_y: array<array<u32, 8>, {{ s }}>;
            var r_x: array<array<u32, 8>, {{ s }}>;
            var r_y: array<array<u32, 8>, {{ s }}>;
            var slot_on: array<u32, {{ s }}>;
            for (var k: u32 = 0u; k < S; k = k + 1u) {
                var li: u32;
                var ri: u32;
                if (k < batch_size) {
                    li = off_in + (batch_start + k) * 2u;
                    ri = li + 1u;
                    slot_on[k] = 1u;
                } else {
                    // IDLE: reuse pair 0's slots (safe — dx = r_x - l_x of pair 0,
                    // which is the same nonzero dx we already compute for k=0).
                    li = off_in + 0u;
                    ri = off_in + 1u;
                    slot_on[k] = 0u;
                }
                l_x[k] = load_scratch_x(li);
                l_y[k] = load_scratch_y(li, M_scratch);
                r_x[k] = load_scratch_x(ri);
                r_y[k] = load_scratch_y(ri, M_scratch);
            }

            // Phase 2: forward prefix on dx.
            var prefix: array<u32, 8> = get_r_f8();
            var pref: array<array<u32, 8>, {{ s }}>;
            for (var k: u32 = 0u; k < S; k = k + 1u) {
                let dx = fr_sub_f8(r_x[k], l_x[k]);
                if (k == 0u) {
                    prefix = dx;
                } else {
                    prefix = montgomery_product_f8(prefix, dx);
                }
                if (k + 1u < S) { pref[k] = prefix; }
            }

            // Phase 3: ONE safegcd.
            var acc20 = unpack256_to_limbs(prefix);
            var inv20 = {{ inv_fn }}(acc20);
            var inv = pack_limbs_to_256(&inv20);

            // Phase 4: fused inverse + backward affine add.
            for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
                let k = S - 1u - jj;
                var inv_dx: array<u32, 8>;
                if (k == 0u) {
                    inv_dx = inv;
                } else {
                    inv_dx = montgomery_product_f8(inv, pref[k - 1u]);
                    let dx_b = fr_sub_f8(r_x[k], l_x[k]);
                    inv = montgomery_product_f8(inv, dx_b);
                }
                if (slot_on[k] == 0u) { continue; }
                var lambda = fr_sub_f8(r_y[k], l_y[k]);
                lambda = montgomery_product_f8(lambda, inv_dx);
                var new_x = montgomery_product_f8(lambda, lambda);
                let x_sum = fr_add_f8(l_x[k], r_x[k]);
                new_x = fr_sub_f8(new_x, x_sum);
                var new_y = fr_sub_f8(l_x[k], new_x);
                new_y = montgomery_product_f8(lambda, new_y);
                new_y = fr_sub_f8(new_y, l_y[k]);
                let out_idx = off_out + batch_start + k;
                store_scratch_x(out_idx, new_x);
                store_scratch_y(out_idx, new_y, M_scratch);
            }
            batch_start = batch_start + S;
        }

        // Odd handling: copy unpaired survivor to next-level tail.
        if (odd == 1u) {
            let x = load_scratch_x(off_in + N - 1u);
            let y = load_scratch_y(off_in + N - 1u, M_scratch);
            store_scratch_x(off_out + n_pairs, x);
            store_scratch_y(off_out + n_pairs, y, M_scratch);
        }

        N = n_pairs + odd;
        off_in = off_out;
        off_out = off_in + N;
    }

    // === Write final to bucket_sums.
    let final_x = load_scratch_x(off_in);
    let final_y = load_scratch_y(off_in, M_scratch);
    bucket_sums[PG * bid + 0u] = vec4<u32>(final_x[0], final_x[1], final_x[2], final_x[3]);
    bucket_sums[PG * bid + 1u] = vec4<u32>(final_x[4], final_x[5], final_x[6], final_x[7]);
    bucket_sums[PG * M_buckets + PG * bid + 0u] = vec4<u32>(final_y[0], final_y[1], final_y[2], final_y[3]);
    bucket_sums[PG * M_buckets + PG * bid + 1u] = vec4<u32>(final_y[4], final_y[5], final_y[6], final_y[7]);

    {{{ recompile }}}
}
