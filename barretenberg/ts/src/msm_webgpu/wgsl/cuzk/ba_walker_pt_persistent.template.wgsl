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

// Pair-tree v6 — packed-bin persistent kernel.
//
// Each workgroup processes a CHUNK of buckets (assigned by pt_packer via
// LPT bin-packing). Threads in the WG cooperate on the chunk's flat
// pair-task list per level. For low-N profiles, many small buckets share
// one WG (each thread takes pair-tasks from any bucket). For high-N
// profiles, one giant bucket may own a WG entirely — but its level-0
// pairs (e.g. 1600) still fan out across all TPB×S = 1024 task slots
// inside the WG.
//
// One dispatch, all log₂(N) levels processed inside via workgroupBarriers.
// No multi-dispatch overhead. Per-level pair-tasks distributed across
// threads via binary search on a workgroup-shared prefix sum.
//
// params.x = M_partials (partials_buf plane stride)
// params.y = M_buckets  (bucket_sums plane stride)
// params.z = M_pt       (pt_buf plane stride)

const TPB: u32 = {{ workgroup_size }}u;
const HOT_THRESHOLD: u32 = 8u;
const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const MAX_M: u32 = {{ max_m }}u;   // max buckets per WG
const MAX_LEVELS: u32 = 17u;       // covers N up to 2^17 = 131072

@group(0) @binding(0)  var<storage, read>       partial_count:        array<u32>;
@group(0) @binding(1)  var<storage, read>       partial_offset:       array<u32>;
@group(0) @binding(2)  var<storage, read>       partial_layout:       array<u32>;
@group(0) @binding(3)  var<storage, read>       partials_buf:         array<vec4<u32>>;
@group(0) @binding(4)  var<storage, read>       pt_wg_meta:           array<u32>;
@group(0) @binding(5)  var<storage, read>       pt_wg_bucket_list:    array<u32>;
@group(0) @binding(6)  var<storage, read>       pt_wg_bucket_starts:  array<u32>;
@group(0) @binding(7)  var<storage, read_write> pt_buf:               array<vec4<u32>>;
@group(0) @binding(8)  var<storage, read_write> bucket_sums:          array<vec4<u32>>;
@group(0) @binding(9)  var<uniform>             params:               vec4<u32>;

// Workgroup-shared per-bucket state (M ≤ MAX_M buckets per WG).
var<workgroup> wg_M:            u32;
var<workgroup> wg_scratch_base: u32;
var<workgroup> wg_bid:          array<u32, {{ max_m }}>;
var<workgroup> wg_off_in:       array<u32, {{ max_m }}>;
var<workgroup> wg_count:        array<u32, {{ max_m }}>;
var<workgroup> wg_n_pairs:      array<u32, {{ max_m }}>;
var<workgroup> wg_pair_prefix:  array<u32, {{ max_m_plus_1 }}>;
var<workgroup> wg_total_pairs:  u32;

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
    let q0 = pt_buf[PG * idx + 0u];
    let q1 = pt_buf[PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_scratch_y(idx: u32, M: u32) -> array<u32, 8> {
    let q0 = pt_buf[PG * M + PG * idx + 0u];
    let q1 = pt_buf[PG * M + PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_scratch_x(idx: u32, v: array<u32, 8>) {
    pt_buf[PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_buf[PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn store_scratch_y(idx: u32, v: array<u32, 8>, M: u32) {
    pt_buf[PG * M + PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_buf[PG * M + PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
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
fn main(@builtin(workgroup_id) wgid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let wg = wgid.x;
    let l = lid.x;
    let M_partials = params.x;
    let M_buckets = params.y;
    let M_pt = params.z;

    // === Init: load WG metadata + per-bucket state.
    // (packer wrote pt_wg_meta and pt_wg_bucket_starts/list before we ran)
    if (l == 0u) {
        wg_scratch_base = pt_wg_meta[wg * 4u + 0u];
        wg_M = pt_wg_meta[wg * 4u + 1u];
    }
    workgroupBarrier();
    let M_local = wg_M;
    let bucket_start_packed = pt_wg_bucket_starts[wg];

    // Each thread l < M_local loads one bucket's bid + count.
    if (l < M_local) {
        let bid = pt_wg_bucket_list[bucket_start_packed + l];
        wg_bid[l] = bid;
        wg_count[l] = partial_count[bid];
    }
    workgroupBarrier();

    // Compute per-bucket slice offsets. Each bucket needs ≥ 2N+log₂(N) slots
    // (shift layout). Packer reserved 2N+32 per bucket; mirror here.
    if (l == 0u) {
        var running = wg_scratch_base;
        for (var b: u32 = 0u; b < M_local; b = b + 1u) {
            wg_off_in[b] = running;
            running = running + 2u * wg_count[b] + 32u;
        }
    }
    workgroupBarrier();

    // === Initial copy: each bucket's thread copies its N partials in.
    if (l < M_local) {
        let bid = wg_bid[l];
        let N = wg_count[l];
        let p_off = partial_offset[bid];
        let base = wg_off_in[l];
        for (var i: u32 = 0u; i < N; i = i + 1u) {
            let slot = partial_layout[p_off + i];
            let x = load_partials_x(slot);
            let y = load_partials_y(slot, M_partials);
            store_scratch_x(base + i, x);
            store_scratch_y(base + i, y, M_pt);
        }
    }
    workgroupBarrier();

    // === Pair-tree levels (uniform fixed count).
    for (var level: u32 = 0u; level < MAX_LEVELS; level = level + 1u) {
        // Compute per-bucket n_pairs at this level.
        if (l < M_local) {
            let cur = wg_count[l];
            wg_n_pairs[l] = cur / 2u;
        }
        workgroupBarrier();

        // Single-thread prefix scan over n_pairs → pair_prefix.
        if (l == 0u) {
            var running = 0u;
            for (var b: u32 = 0u; b < M_local; b = b + 1u) {
                wg_pair_prefix[b] = running;
                running = running + wg_n_pairs[b];
            }
            wg_pair_prefix[M_local] = running;
            wg_total_pairs = running;
        }
        workgroupBarrier();

        let total_pairs = wg_total_pairs;

        // Each thread handles S=8 pair-tasks starting at l*S.
        // Pair tasks may cross bucket boundaries → resolve per-task.
        let my_task_start = l * S;

        var L_idx: array<u32, {{ s }}>;
        var R_idx: array<u32, {{ s }}>;
        var O_idx: array<u32, {{ s }}>;
        var slot_on: array<u32, {{ s }}>;

        // Resolve task → (bucket, local) for each slot in this thread.
        // Binary search wg_pair_prefix once for the first task; advance
        // linearly thereafter.
        var b_idx: u32 = 0u;
        if (my_task_start < total_pairs) {
            var lo: u32 = 0u;
            var hi: u32 = M_local;
            while (lo + 1u < hi) {
                let mid = (lo + hi) / 2u;
                if (wg_pair_prefix[mid] <= my_task_start) {
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            b_idx = lo;
        }
        var local_pair: u32 = 0u;
        if (my_task_start < total_pairs) {
            local_pair = my_task_start - wg_pair_prefix[b_idx];
        }

        for (var k: u32 = 0u; k < S; k = k + 1u) {
            let global_task = my_task_start + k;
            if (global_task >= total_pairs) {
                slot_on[k] = 0u;
                // Reuse bucket 0's pair 0 for IDLE batched-inv safety.
                L_idx[k] = wg_off_in[0];
                R_idx[k] = wg_off_in[0] + 1u;
                O_idx[k] = wg_off_in[0]; // unused
                continue;
            }
            // Advance b_idx if we've crossed a bucket boundary.
            while (b_idx + 1u < M_local && local_pair >= wg_n_pairs[b_idx]) {
                b_idx = b_idx + 1u;
                local_pair = 0u;
            }
            let in_off = wg_off_in[b_idx];
            let out_off = in_off + wg_count[b_idx]; // shift layout
            L_idx[k] = in_off + 2u * local_pair;
            R_idx[k] = in_off + 2u * local_pair + 1u;
            O_idx[k] = out_off + local_pair;
            slot_on[k] = 1u;
            local_pair = local_pair + 1u;
        }

        // Phase 1: load.
        var l_x: array<array<u32, 8>, {{ s }}>;
        var l_y: array<array<u32, 8>, {{ s }}>;
        var r_x: array<array<u32, 8>, {{ s }}>;
        var r_y: array<array<u32, 8>, {{ s }}>;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            l_x[k] = load_scratch_x(L_idx[k]);
            l_y[k] = load_scratch_y(L_idx[k], M_pt);
            r_x[k] = load_scratch_x(R_idx[k]);
            r_y[k] = load_scratch_y(R_idx[k], M_pt);
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

        // Phase 4: backward fused.
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
            store_scratch_x(O_idx[k], new_x);
            store_scratch_y(O_idx[k], new_y, M_pt);
        }
        workgroupBarrier();

        // Odd survivor handling: each bucket's thread copies if its count is odd.
        if (l < M_local) {
            let cur = wg_count[l];
            let n_pairs = cur / 2u;
            let odd = cur & 1u;
            if (odd == 1u) {
                let in_base = wg_off_in[l];
                let out_base = in_base + cur;
                let x = load_scratch_x(in_base + cur - 1u);
                let y = load_scratch_y(in_base + cur - 1u, M_pt);
                store_scratch_x(out_base + n_pairs, x);
                store_scratch_y(out_base + n_pairs, y, M_pt);
            }
            // Advance state for next level.
            let new_off = wg_off_in[l] + cur;
            wg_off_in[l] = new_off;
            wg_count[l] = n_pairs + odd;
        }
        workgroupBarrier();
    }

    // === Finalize: each bucket's thread writes final partial to bucket_sums.
    if (l < M_local) {
        let bid = wg_bid[l];
        let in_off = wg_off_in[l];
        let final_x = load_scratch_x(in_off);
        let final_y = load_scratch_y(in_off, M_pt);
        store_bucket_sum(bid, M_buckets, final_x, final_y);
    }

    {{{ recompile }}}
}
