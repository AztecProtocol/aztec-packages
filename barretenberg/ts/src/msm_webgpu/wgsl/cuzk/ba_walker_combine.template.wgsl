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

// Stream-walker split-bucket combine, indexed variant.
//
// Replaces C-thread's O(num_dense × M_partials) scan over partial_dest.
// ba_walker_partials_index linked each bucket's used partial slots into a
// per-bucket singly-linked list; this kernel walks each list and
// affine-sums the pieces. Buckets with no partials short-circuit at the
// first bucket_head load.
//
// params.x = M_buckets   (bucket_sums plane stride = B_TOTAL)
// params.y = M_partials  (partials_buf plane stride = 2 * NUM_THREADS * S)
// params.z = bucket_base (global bucket offset for THIS batch = bi*batchBuckets;
//            0 at nb=1). sorted_bucket_list / bucket_head stay LOCAL in
//            [0, batchBuckets); only the bucket_sums write adds this base so
//            each batch fills its disjoint global slice.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const NO_NODE: u32 = 0u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
// WGSL requires atomic<T> to live in read_write storage even when only
// atomicLoad'd; the indexer kernel writes to it, this kernel only reads.
@group(0) @binding(1) var<storage, read_write> bucket_head:        array<atomic<u32>>;
@group(0) @binding(2) var<storage, read>       nodes_slot:         array<u32>;
@group(0) @binding(3) var<storage, read>       nodes_next:         array<u32>;
@group(0) @binding(4) var<storage, read>       partials_buf:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> bucket_sums:        array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(7) var<uniform>             params:             vec4<u32>;

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

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let num_dense = planner_meta[1];
    if (t >= num_dense) { return; }

    let M_buckets = params.x;
    let M_partials = params.y;
    let bucket_base = params.z;
    let bucket_id = sorted_bucket_list[t];

    var handle = atomicLoad(&bucket_head[bucket_id]);
    if (handle == NO_NODE) { return; }

    // First partial seeds the accumulator (no affine add needed).
    var node_idx = handle - 1u;
    let first_slot = nodes_slot[node_idx];
    var acc_x: array<u32, 8> = load_partial_x(first_slot);
    var acc_y: array<u32, 8> = load_partial_y(first_slot, M_partials);
    handle = nodes_next[node_idx];

    loop {
        if (handle == NO_NODE) { break; }
        node_idx = handle - 1u;
        let slot = nodes_slot[node_idx];
        let px = load_partial_x(slot);
        let py = load_partial_y(slot, M_partials);

        let dx = fr_sub_f8(px, acc_x);
        var dx20 = unpack256_to_limbs(dx);
        var inv20 = {{ inv_fn }}(dx20);
        let inv_dx = pack_limbs_to_256(&inv20);
        var lambda = fr_sub_f8(py, acc_y);
        lambda = montgomery_product_f8(lambda, inv_dx);
        var r_x = montgomery_product_f8(lambda, lambda);
        let x_sum = fr_add_f8(acc_x, px);
        r_x = fr_sub_f8(r_x, x_sum);
        var r_y = fr_sub_f8(acc_x, r_x);
        r_y = montgomery_product_f8(lambda, r_y);
        r_y = fr_sub_f8(r_y, acc_y);
        acc_x = r_x;
        acc_y = r_y;

        handle = nodes_next[node_idx];
    }

    // Write the combined sum back to bucket_sums (global slice for this batch).
    let g_bucket = bucket_id + bucket_base;
    let bx = PG * g_bucket;
    bucket_sums[bx + 0u] = vec4<u32>(acc_x[0], acc_x[1], acc_x[2], acc_x[3]);
    bucket_sums[bx + 1u] = vec4<u32>(acc_x[4], acc_x[5], acc_x[6], acc_x[7]);
    let by = PG * M_buckets + PG * g_bucket;
    bucket_sums[by + 0u] = vec4<u32>(acc_y[0], acc_y[1], acc_y[2], acc_y[3]);
    bucket_sums[by + 1u] = vec4<u32>(acc_y[4], acc_y[5], acc_y[6], acc_y[7]);

    {{{ recompile }}}
}
