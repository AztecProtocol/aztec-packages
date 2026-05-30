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

// Pair-tree v2: per-level pair-combine kernel.
//
// Indirect-dispatched. Each thread handles S=8 pair-tasks from the flat
// pt_tasks list. For each thread: load 8 (L, R) pairs → forward prefix
// of 8 dx → ONE safegcd → backward fused affine-add → 8 outputs to O.
//
// Cross-thread fan-out: pair-tasks from a SINGLE giant bucket spread
// across all threads in the dispatch. The bucket no longer serializes
// inside one thread — it parallelizes over all hot threads.
//
// Task kinds:
//   0 (PAIR) — combine partials at L,R → output at O
//   1 (COPY) — move partial at L → output at O (odd survivor)
// Copy tasks still participate in batched inversion (dx = mont-1, safe).
//
// params.x = M_pt (pt_buf plane stride)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const KIND_PAIR: u32 = 0u;
const KIND_COPY: u32 = 1u;

@group(0) @binding(0) var<storage, read>       pt_tasks:       array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       pt_total_tasks: array<u32>;
@group(0) @binding(2) var<storage, read_write> pt_buf:         array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params:         vec4<u32>;

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
    let NUM_TASKS = pt_total_tasks[0];
    if (task_base >= NUM_TASKS) { return; }

    let M_pt = params.x;

    // REGISTER-LEAN: don't pre-stage all 8 (L_x, L_y, R_x, R_y) operands in
    // private memory — at 4 × 32 B per slot × 8 slots = 1 KB per thread of
    // private-array state, the prior version was spilling out of M2's
    // ~256 B register budget per thread and tanking occupancy. Instead,
    // load the X coordinates in forward (need them for dx), and reload
    // everything (X+Y) on demand in backward. Doubles the device-memory
    // reads but pt_buf is small/hot — and ~4× fewer registers per thread
    // means ~4× more SIMD groups in flight.
    var L_idx: array<u32, {{ s }}>;
    var R_idx: array<u32, {{ s }}>;
    var O_idx: array<u32, {{ s }}>;
    var kind:  array<u32, {{ s }}>;
    var slot_on: array<u32, {{ s }}>;

    // Phase 1: read task tuples (cheap — 32 B per slot × 8 = 256 B).
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let id = task_base + k;
        var task: vec4<u32>;
        if (id < NUM_TASKS) {
            task = pt_tasks[id];
            slot_on[k] = 1u;
        } else {
            task = pt_tasks[0];
            slot_on[k] = 0u;
        }
        L_idx[k] = task.x;
        R_idx[k] = task.y;
        O_idx[k] = task.z;
        kind[k] = task.w;
    }

    // Phase 2: forward prefix on dx. Load (L_x, R_x) per slot, compute dx,
    // accumulate. Discard L_x/R_x after this loop — backward reloads them.
    var prefix: array<u32, 8> = get_r_f8();
    var pref: array<array<u32, 8>, {{ s }}>;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        var dx: array<u32, 8>;
        if (kind[k] == KIND_PAIR) {
            let lxk = load_x(L_idx[k]);
            let rxk = load_x(R_idx[k]);
            dx = fr_sub_f8(rxk, lxk);
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

    // Phase 3: ONE safegcd amortised across the 8 pair-tasks.
    var acc20 = unpack256_to_limbs(prefix);
    var inv20 = {{ inv_fn }}(acc20);
    var inv = pack_limbs_to_256(&inv20);

    // Phase 4: backward fused inverse + per-slot affine add (or copy).
    // Operands reloaded on demand — no pre-stored l/r arrays.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        // Load this slot's operands once for the whole iteration body.
        var lxk: array<u32, 8>;
        var lyk: array<u32, 8>;
        var rxk: array<u32, 8>;
        var ryk: array<u32, 8>;
        lxk = load_x(L_idx[k]);
        lyk = load_y(L_idx[k], M_pt);
        if (kind[k] == KIND_PAIR) {
            rxk = load_x(R_idx[k]);
            ryk = load_y(R_idx[k], M_pt);
        }

        var inv_dx: array<u32, 8>;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            inv_dx = montgomery_product_f8(inv, pref[k - 1u]);
            var dx_b: array<u32, 8>;
            if (kind[k] == KIND_PAIR) {
                dx_b = fr_sub_f8(rxk, lxk);
            } else {
                dx_b = get_r_f8();
            }
            inv = montgomery_product_f8(inv, dx_b);
        }
        if (slot_on[k] == 0u) { continue; }

        if (kind[k] == KIND_COPY) {
            store_x(O_idx[k], lxk);
            store_y(O_idx[k], lyk, M_pt);
            continue;
        }
        var lambda = fr_sub_f8(ryk, lyk);
        lambda = montgomery_product_f8(lambda, inv_dx);
        var new_x = montgomery_product_f8(lambda, lambda);
        let x_sum = fr_add_f8(lxk, rxk);
        new_x = fr_sub_f8(new_x, x_sum);
        var new_y = fr_sub_f8(lxk, new_x);
        new_y = montgomery_product_f8(lambda, new_y);
        new_y = fr_sub_f8(new_y, lyk);
        store_x(O_idx[k], new_x);
        store_y(O_idx[k], new_y, M_pt);
    }

    {{{ recompile }}}
}
