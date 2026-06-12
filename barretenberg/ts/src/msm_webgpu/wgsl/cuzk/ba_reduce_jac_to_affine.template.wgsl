{{> inverse_funcs }}

{{> field8_funcs }}

// Mid-schedule Jacobian -> affine convert of ALL live slots, batched. Used at a
// jac->affine boundary in the per-level reduction cut: the levels that ran
// Jacobian (red_z plane, Z==0 = infinity) must be normalised back to affine
// (x = X/Z^2, y = Y/Z^3, in red_buf) and have is_present restored before the
// next batch-affine level reads them.
//
// The whole point is to amortise the inversion: each thread takes a chunk of C
// slots, forms the forward prefix-product of their Z's (substituting R for
// Z==0 so infinities don't poison the product), does ONE safegcd inversion,
// then backward-peels the C individual 1/Z. So C slots cost 1 safegcd, not C.
// C is set by the host (cparams.z); larger C => fewer safegcds (but more serial
// prefix work / fewer threads). The prefix lives in conv_scratch (storage, one
// field element per slot) so C is not bounded by the private-array budget.
//
// Operates over the flat slot space [0, total_slots) — geometry-independent (no
// per-window schedule), so the same string serves every N (one-program safe).

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       red_z:        array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(3) var<storage, read_write> conv_scratch: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             cparams:      vec4<u32>; // (M, total_slots, chunk_C, nthreads)

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_z(idx: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_z[base + 0u];
    let q1 = red_z[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_y(idx: u32, M: u32, val: array<u32, 8>) {
    let base = PG * M + PG * idx;
    red_buf[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    red_buf[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn store_pref(slot: u32, val: array<u32, 8>) {
    let base = PG * slot;
    conv_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    conv_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}
fn load_pref(slot: u32) -> array<u32, 8> {
    let base = PG * slot;
    let q0 = conv_scratch[base + 0u];
    let q1 = conv_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let M = cparams.x;
    let total = cparams.y;
    let C = cparams.z;
    let nthreads = cparams.w;
    let tid = gid.x;
    if (tid >= nthreads) { return; }
    let R: array<u32, 8> = get_r_f8();
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

    // ---- forward: prefix product of the chunk's (infinity-substituted) Z ----
    var acc: array<u32, 8> = R;
    for (var k: u32 = 0u; k < C; k = k + 1u) {
        let slot = tid * C + k;
        var z: array<u32, 8> = R;
        if (slot < total) {
            let Z = load_z(slot);
            z = fr_select_f8(Z, R, is_zero_f8(Z));
        }
        acc = montgomery_product_f8(acc, z);
        if (slot < total) { store_pref(slot, acc); }
    }

    // ---- single inversion of the whole chunk's product (native f8 pk14, direct) ----
    var inv: array<u32, 8> = {{ inv_fn }}(acc);

    // ---- backward peel: recover each 1/Z, convert in place ----
    for (var kk: u32 = 0u; kk < C; kk = kk + 1u) {
        let k = C - 1u - kk;
        let slot = tid * C + k;
        if (slot >= total) { continue; }
        let Z = load_z(slot);
        let isinf = is_zero_f8(Z);
        let zsub = fr_select_f8(Z, R, isinf);
        let prev_slot = select(slot - 1u, 0u, k == 0u);
        let pp = fr_select_f8(load_pref(prev_slot), R, k == 0u);
        let zinv = montgomery_product_f8(inv, pp); // 1/zsub for this slot
        inv = montgomery_product_f8(inv, zsub);

        let X = load_x(slot, M);
        let Y = load_y(slot, M);
        let Z2inv = montgomery_square_f8(zinv);
        let Z3inv = montgomery_product_f8(Z2inv, zinv);
        let x = montgomery_product_f8(X, Z2inv);
        let y = montgomery_product_f8(Y, Z3inv);
        store_x(slot, M, fr_select_f8(x, zero, isinf));
        store_y(slot, M, fr_select_f8(y, zero, isinf));
        is_present[slot] = select(1u, 0u, isinf);
    }
}
