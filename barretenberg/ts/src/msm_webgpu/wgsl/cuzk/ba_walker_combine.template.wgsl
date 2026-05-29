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

// Stream-walker split-bucket combine. After ba_stream_walker, buckets fully
// consumed within one task already hold their sum in bucket_sums; buckets
// split across task/thread boundaries instead have their pieces in
// partials_buf, each tagged with its bucket id in partial_dest. One thread
// per dense bucket scans the partial slots, affine-sums the pieces tagged
// for its bucket, and writes the result to bucket_sums.
//
// NOTE: this is a correctness-first O(num_dense * num_partial_slots) scan for
// the small-n gates (G2-G4). For large n the plan's host-side fixup (or an
// indexed GPU reduction) replaces it — see the PR's knob-variation notes.
//
// params.x = M_buckets   (bucket_sums plane stride)
// params.y = M_partials  (partials_buf plane stride = 2 * NUM_THREADS * S)
// params.z = num_partial_slots (= 2 * num_active_threads * S to scan)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const NO_BUCKET: u32 = 0xffffffffu;

@group(0) @binding(0) var<storage, read>       sorted_bucket_list: array<u32>;
@group(0) @binding(1) var<storage, read>       partial_dest:       array<u32>;
@group(0) @binding(2) var<storage, read>       partials_buf:       array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> bucket_sums:        array<vec4<u32>>;
@group(0) @binding(4) var<storage, read>       planner_meta:       array<u32>;
@group(0) @binding(5) var<uniform>             params:             vec4<u32>;

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
    // Scan only the active partial slots (2 per task over nwg*256 threads).
    let num_slots = 2u * (planner_meta[3] * 256u) * S;
    let bucket_id = sorted_bucket_list[t];

    var found: u32 = 0u;
    var acc_x: array<u32, 8>;
    var acc_y: array<u32, 8>;

    for (var slot: u32 = 0u; slot < num_slots; slot = slot + 1u) {
        if (partial_dest[slot] != bucket_id) { continue; }
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
