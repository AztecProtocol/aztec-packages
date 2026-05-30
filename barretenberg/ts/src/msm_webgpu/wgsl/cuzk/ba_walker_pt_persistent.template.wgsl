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

// Pair-tree v3 — persistent single-workgroup kernel for the low-NUM_HOT,
// low-max-N case.
//
// One WG of TPB threads, one thread per hot bucket. Inside the kernel we
// advance every active bucket by ONE pair-add per outer iter — each thread
// computes its own dx, inverts it with a private safegcd, and does its
// own affine add. No cross-thread batched inversion (that would require
// both prefix AND suffix workgroup-shared scans for parallel inv_dx, and
// the wall time is dominated by the safegcd which runs in parallel across
// SIMD lanes anyway). Iter count is fixed at N_PERSISTENT_MAX − 1; threads
// whose bucket finishes early flip `done = 1` and no-op the remaining
// iters. No workgroupBarriers, no atomics — completely embarrassingly
// parallel inside the WG.
//
// Sort-scan decides whether to dispatch this kernel via indirect args
// (it knows NUM_HOT and whether any bucket has N ≥ MAX_N − 1). When this
// kernel runs, sort-scan has already zeroed pt_dispatch_args so the
// multi-dispatch sequence is a no-op.
//
// params.x = M_partials (partials_buf plane stride)
// params.y = M_buckets  (bucket_sums plane stride)

const TPB: u32 = {{ workgroup_size }}u;
const HOT_THRESHOLD: u32 = 8u;
const N_PERSISTENT_MAX: u32 = 64u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       sorted_active:    array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:      array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:     array<u32>;
@group(0) @binding(3) var<storage, read>       partial_count:    array<u32>;
@group(0) @binding(4) var<storage, read>       partial_offset:   array<u32>;
@group(0) @binding(5) var<storage, read>       partial_layout:   array<u32>;
@group(0) @binding(6) var<storage, read>       partials_buf:     array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> bucket_sums:      array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> pt_dispatch_args: array<u32>;
@group(0) @binding(9) var<uniform>             params:           vec4<u32>;

fn load_partial_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_partial_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_bucket_sum(bid: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * bid;
    bucket_sums[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    bucket_sums[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * bid;
    bucket_sums[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    bucket_sums[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    let NUM_HOT = NUM_ACTIVE - cool_end;
    let M_partials = params.x;
    let M_buckets = params.y;

    let live = l < NUM_HOT;
    var bid: u32 = 0u;
    var cnt: u32 = 0u;
    var p_off_global: u32 = 0u;
    var pos: u32 = 0u;
    var acc_x: array<u32, 8>;
    var acc_y: array<u32, 8>;
    var done: u32 = 1u;

    if (live) {
        bid = sorted_active[cool_end + l];
        cnt = partial_count[bid];
        if (cnt >= 1u) {
            p_off_global = partial_offset[bid];
            let slot0 = partial_layout[p_off_global];
            acc_x = load_partial_x(slot0);
            acc_y = load_partial_y(slot0, M_partials);
            if (cnt > 1u) { done = 0u; }
        }
    }

    // Fixed-count outer loop. Threads whose bucket reaches N-1 pair-adds
    // flip `done = 1` and short-circuit the body for remaining iters.
    for (var iter: u32 = 0u; iter + 1u < N_PERSISTENT_MAX; iter = iter + 1u) {
        if (done == 1u) { continue; }

        let next_slot = partial_layout[p_off_global + pos + 1u];
        let p_r_x = load_partial_x(next_slot);
        let p_r_y = load_partial_y(next_slot, M_partials);

        let dx = fr_sub_f8(p_r_x, acc_x);
        var dx20 = unpack256_to_limbs(dx);
        var inv20 = {{ inv_fn }}(dx20);
        let inv_dx = pack_limbs_to_256(&inv20);

        var lambda = fr_sub_f8(p_r_y, acc_y);
        lambda = montgomery_product_f8(lambda, inv_dx);
        var new_x = montgomery_product_f8(lambda, lambda);
        let x_sum = fr_add_f8(acc_x, p_r_x);
        new_x = fr_sub_f8(new_x, x_sum);
        var new_y = fr_sub_f8(acc_x, new_x);
        new_y = montgomery_product_f8(lambda, new_y);
        new_y = fr_sub_f8(new_y, acc_y);
        acc_x = new_x;
        acc_y = new_y;
        pos = pos + 1u;
        if (pos >= cnt - 1u) { done = 1u; }
    }

    if (live && cnt >= 1u) {
        store_bucket_sum(bid, M_buckets, acc_x, acc_y);
    }

    {{{ recompile }}}
}
