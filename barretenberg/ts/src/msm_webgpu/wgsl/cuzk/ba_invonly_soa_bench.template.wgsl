// Two-kernel pipeline stage 1 (SoA): inverse-only.
//
// Per-thread serial Montgomery batch-inverse over a chunk of {{ ch }}
// pairs; prefix products + dx values in private register arrays (no
// global prefix buffer, no cross-thread scan, no workgroup memory). One
// fr_inv_by_a per chunk. Emits inv_dx per pair.
//
// SoA (limb-major) I/O, stride S = params.z = #pairs:
//   xs (P.x at coord0, Q.x at coord2): idx = coord*(S*NUM_WORDS) + limb*S + pair
//   outputs (inv_dx)                 : idx =                       limb*S + pair
// params = (n_threads, ch, stride, 0). {{ skip_dxs }}=true recomputes dx
// in the backward pass instead of caching it (halves the private array).

const CH: u32 = {{ ch }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<u32>;
@group(0) @binding(1) var<storage, read>       ys:      array<u32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<u32>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn load_px(g: u32, S: u32) -> BigInt {
    var b: BigInt;
    for (var j = 0u; j < NUM_WORDS; j = j + 1u) { b.limbs[j] = xs[j * S + g]; }
    return b;
}
fn load_qx(g: u32, S: u32) -> BigInt {
    let plane = S * NUM_WORDS;
    var b: BigInt;
    for (var j = 0u; j < NUM_WORDS; j = j + 1u) { b.limbs[j] = xs[2u * plane + j * S + g]; }
    return b;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let S = params.z;
    let tid = gid.x;
    if (tid >= n) { return; }

    let chunk_base = tid * CH;

    var pref: array<BigInt, {{ ch }}>;
{{^skip_dxs}}
    var dxs: array<BigInt, {{ ch }}>;
{{/skip_dxs}}

    var acc: BigInt = get_r();
    for (var i = 0u; i < CH; i = i + 1u) {
        let g = chunk_base + i;
        var p_x = load_px(g, S);
        var q_x = load_qx(g, S);
        var dx = fr_sub(&q_x, &p_x);
{{^skip_dxs}}
        dxs[i] = dx;
{{/skip_dxs}}
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
    }

    var inv: BigInt = fr_inv_by_a(acc);

    for (var jj = 0u; jj < CH; jj = jj + 1u) {
        let i = CH - 1u - jj;
        let g = chunk_base + i;

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }
        for (var j = 0u; j < NUM_WORDS; j = j + 1u) {
            outputs[j * S + g] = inv_dx.limbs[j];
        }

        if (i != 0u) {
{{#skip_dxs}}
            var p_x2 = load_px(g, S);
            var q_x2 = load_qx(g, S);
            var dxi = fr_sub(&q_x2, &p_x2);
{{/skip_dxs}}
{{^skip_dxs}}
            var dxi = dxs[i];
{{/skip_dxs}}
            inv = montgomery_product(&inv, &dxi);
        }
    }
}
