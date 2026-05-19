// Two-kernel pipeline, stage 1: inverse-only.
//
// Per-thread serial Montgomery batch-inverse over a chunk of CH pairs,
// prefix products in a private register array (no global prefix buffer,
// no cross-thread scan, no workgroup memory). Emits inv_dx_i = 1/(Q.x-P.x)
// for every pair into the outputs buffer (1 BigInt/pair). It does NOT do
// the affine formula — that is stage 2 (ba_affine_only), a separate
// register-light kernel. Splitting the two means the affine-apply kernel
// holds NO prefix array live across its montmul calls, so its occupancy
// is set by montmul alone (the whole point of the split).
//
// xs = inputs (4 BigInt/pair AoS: P.x,P.y,Q.x,Q.y; only x's are read).
// outputs = inv_dx (1 BigInt/pair). params = (n_threads, CH). One
// fr_inv_by_a per CH pairs. CH = compile-time {{ ch }}.

const CH: u32 = {{ ch }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec2<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
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
        let pb = g * 4u;
        var p_x = xs[pb + 0u];
        var q_x = xs[pb + 2u];
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

    for (var j = 0u; j < CH; j = j + 1u) {
        let i = CH - 1u - j;
        let g = chunk_base + i;

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }
        outputs[g] = inv_dx;

        if (i != 0u) {
{{#skip_dxs}}
            let pb2 = g * 4u;
            var p_x2 = xs[pb2 + 0u];
            var q_x2 = xs[pb2 + 2u];
            var dxi = fr_sub(&q_x2, &p_x2);
{{/skip_dxs}}
{{^skip_dxs}}
            var dxi = dxs[i];
{{/skip_dxs}}
            inv = montgomery_product(&inv, &dxi);
        }
    }
}
