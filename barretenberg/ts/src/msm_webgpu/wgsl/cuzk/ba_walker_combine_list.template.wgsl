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

// Stream-walker split-bucket combine (indexed linked-list variant). After
// ba_walker_indexer has threaded each split partial onto its bucket's list,
// one thread per dense bucket walks bucket_head[bucket_id] and affine-sums
// the pieces. This replaces the O(num_dense * num_slots) scan in
// ba_walker_combine: total work is O(num_split_partials) instead of
// O(num_dense * num_slots), and each thread touches only its own pieces.
//
// Node layout matches ba_walker_indexer: NODE_STRIDE u32 per node,
// [next_handle, partial_slot, bucket_id], handles 1-indexed (0 == NO_NODE).
// Affine addition is commutative, so the list's (reverse-insertion) order
// does not affect the sum — bit-exact with the scan combine.
//
// params.x = M_buckets   (bucket_sums plane stride)
// params.y = M_partials  (partials_buf plane stride = 2 * NUM_THREADS * S)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const NODE_STRIDE: u32 = 3u;
const NO_NODE: u32 = 0u;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       bucket_head:        array<u32>;
@group(0) @binding(2) var<storage, read>       nodes:              array<u32>;
@group(0) @binding(3) var<storage, read>       partials_buf:       array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> bucket_sums:        array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(6) var<uniform>             params:             vec4<u32>;

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
    let bucket_id = sorted_bucket_list[t];

    var found: u32 = 0u;
    var acc_x: array<u32, 8>;
    var acc_y: array<u32, 8>;

    var handle = bucket_head[bucket_id];
    loop {
        if (handle == NO_NODE) { break; }
        let base = (handle - 1u) * NODE_STRIDE;
        let slot = nodes[base + 1u];
        let px = load_partial_x(slot);
        let py = load_partial_y(slot, M_partials);
        if (found == 0u) {
            acc_x = px;
            acc_y = py;
        } else {
            // Affine add acc += p (single inversion; pieces are few per bucket).
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
        }
        found = found + 1u;
        handle = nodes[base + 0u];
    }

    if (found > 0u) {
        let bx = PG * bucket_id;
        bucket_sums[bx + 0u] = vec4<u32>(acc_x[0], acc_x[1], acc_x[2], acc_x[3]);
        bucket_sums[bx + 1u] = vec4<u32>(acc_x[4], acc_x[5], acc_x[6], acc_x[7]);
        let by = PG * M_buckets + PG * bucket_id;
        bucket_sums[by + 0u] = vec4<u32>(acc_y[0], acc_y[1], acc_y[2], acc_y[3]);
        bucket_sums[by + 1u] = vec4<u32>(acc_y[4], acc_y[5], acc_y[6], acc_y[7]);
    }

    {{{ recompile }}}
}
