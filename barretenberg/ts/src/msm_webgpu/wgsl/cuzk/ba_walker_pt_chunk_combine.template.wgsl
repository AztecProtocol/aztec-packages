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

// Chunk-pass combine — stream_walker-shaped reducer.
//
// Each thread handles S chunks. Per outer iter: 1 affine-add on each
// chunk's running accumulator via S-way batched inversion (1 safegcd
// amortised across S chunks). The accumulator is kept in registers
// for the whole chunk — no scratch round-trip per add.
//
// Pass output: each chunk's final accumulator is written at out_off in
// pt_buf. Next pass treats those outputs as the new partials list and
// chunks them again.
//
// params.x = M_pt (pt_buf plane stride)

const S: u32 = {{ s }}u;
const CHUNK_SIZE: u32 = 16u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       pt_chunks:        array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       pt_chunks_total:  array<u32>;
@group(0) @binding(2) var<storage, read_write> pt_buf:           array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:           vec4<u32>;

fn load_x(idx: u32) -> array<u32, 8> {
    let q0 = pt_buf[PG * idx + 0u];
    let q1 = pt_buf[PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let q0 = pt_buf[PG * M + PG * idx + 0u];
    let q1 = pt_buf[PG * M + PG * idx + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, v: array<u32, 8>) {
    pt_buf[PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_buf[PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn store_y(idx: u32, v: array<u32, 8>, M: u32) {
    pt_buf[PG * M + PG * idx + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    pt_buf[PG * M + PG * idx + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let task_base = t * S;
    let TOTAL = pt_chunks_total[0];
    if (task_base >= TOTAL) { return; }

    let M_pt = params.x;

    // === Load S chunk descriptors. Idle slots reuse chunk 0 for safe dx.
    var in_off:  array<u32, {{ s }}>;
    var cnt:     array<u32, {{ s }}>;
    var out_off: array<u32, {{ s }}>;
    var slot_on: array<u32, {{ s }}>;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let id = task_base + k;
        var desc: vec4<u32>;
        if (id < TOTAL) {
            desc = pt_chunks[id];
            slot_on[k] = 1u;
        } else {
            desc = pt_chunks[0];
            slot_on[k] = 0u;
        }
        in_off[k]  = desc.x;
        cnt[k]     = desc.y;
        out_off[k] = desc.z;
    }

    // === Initialise accumulators with each chunk's partial[0].
    var acc_x: array<array<u32, 8>, {{ s }}>;
    var acc_y: array<array<u32, 8>, {{ s }}>;
    var pos:   array<u32, {{ s }}>;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        acc_x[k] = load_x(in_off[k]);
        acc_y[k] = load_y(in_off[k], M_pt);
        pos[k] = 0u;
    }

    // Find max iters needed across this thread's S chunks. Skip iters
    // entirely when no slot has more partials to add. This is the per-thread
    // analogue of "stop when done"; barrier-free since each thread's break
    // is independent. Saves passes-1..4 where chunks are small (<<16) from
    // burning 15 safegcds each.
    var max_iters: u32 = 0u;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        if (slot_on[k] == 1u && cnt[k] > 1u) {
            let needed = cnt[k] - 1u;
            if (needed > max_iters) { max_iters = needed; }
        }
    }

    // === Outer loop: 1 add per chunk per iter. max_iters bounds the loop.
    for (var iter: u32 = 0u; iter < max_iters; iter = iter + 1u) {
        // Per slot: is there another partial to add in this chunk?
        var slot_active: array<u32, {{ s }}>;
        var r_x: array<array<u32, 8>, {{ s }}>;
        var r_y: array<array<u32, 8>, {{ s }}>;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if (slot_on[k] == 1u && pos[k] + 1u < cnt[k]) {
                slot_active[k] = 1u;
                let next = in_off[k] + pos[k] + 1u;
                r_x[k] = load_x(next);
                r_y[k] = load_y(next, M_pt);
            } else {
                slot_active[k] = 0u;
            }
        }

        // === Forward prefix on dx (idle slots contribute mont-1 via get_r_f8).
        var prefix: array<u32, 8> = get_r_f8();
        var pref:   array<array<u32, 8>, {{ s }}>;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var dx: array<u32, 8>;
            if (slot_active[k] == 1u) {
                dx = fr_sub_f8(r_x[k], acc_x[k]);
            } else {
                dx = get_r_f8();
            }
            if (k == 0u) {
                prefix = dx;
            } else {
                prefix = montgomery_product_f8(prefix, dx);
            }
            if (k + 1u < S) { pref[k] = prefix; }
        }

        // === ONE safegcd.
        var acc20 = unpack256_to_limbs(prefix);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

        // === Backward fused inverse + per-slot affine add.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                inv_dx = montgomery_product_f8(inv, pref[k - 1u]);
                var dx_b: array<u32, 8>;
                if (slot_active[k] == 1u) {
                    dx_b = fr_sub_f8(r_x[k], acc_x[k]);
                } else {
                    dx_b = get_r_f8();
                }
                inv = montgomery_product_f8(inv, dx_b);
            }
            if (slot_active[k] == 0u) { continue; }
            var lambda = fr_sub_f8(r_y[k], acc_y[k]);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var new_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(acc_x[k], r_x[k]);
            new_x = fr_sub_f8(new_x, x_sum);
            var new_y = fr_sub_f8(acc_x[k], new_x);
            new_y = montgomery_product_f8(lambda, new_y);
            new_y = fr_sub_f8(new_y, acc_y[k]);
            acc_x[k] = new_x;
            acc_y[k] = new_y;
            pos[k] = pos[k] + 1u;
        }
    }

    // === Write final accumulators.
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        if (slot_on[k] == 1u) {
            store_x(out_off[k], acc_x[k]);
            store_y(out_off[k], acc_y[k], M_pt);
        }
    }

    {{{ recompile }}}
}
