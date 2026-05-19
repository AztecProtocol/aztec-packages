// LADDER B rung 2: mbB2_inv — mbB1_fwd + the ONE fr_inv_by_a(acc).
//
// Same SoA+vec4 layout / S=16 chunk / 8192-thread geometry as mbB0/mbB1.
// Adds exactly the single amortised batched inversion of the real
// kernel: inv = fr_inv_by_a(acc) once per S-chunk. inv folds into the
// stored XOR sink so the inversion cannot be DCE'd. Delta (mbB2-mbB1) =
// the in-context cost of ONE fr_inv_by_a amortised over S pairs.

const S: u32 = {{ s }}u;
const VG: u32 = 5u;

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    var acc_x = load_be(ax_base, t, N);
    var acc_y = load_be(ay_base, t, N);

    var sink: BigInt;
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var dx = fr_sub(&p_x, &acc_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w] ^ p_x.limbs[w] ^ acc.limbs[w];
        }
        acc_x = p_x;
    }

    var inv: BigInt = fr_inv_by_a(acc);
    for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
        sink.limbs[w] = sink.limbs[w] ^ inv.limbs[w];
    }

    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);
        var pp = pref[i];
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w] ^ p_x.limbs[w] ^ p_y.limbs[w] ^ acc_y.limbs[w] ^ pp.limbs[w];
        }
        var r_x = sink;
        var r_y = p_y;
        store_be(0u * plane, e, N, &r_x);
        store_be(1u * plane, e, N, &r_y);
    }
}
