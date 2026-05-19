// Fused single-kernel batch-affine, minimal private storage + lean formula.
//
// Implements both register-pressure reductions:
//  1. Forward sweep stores ONLY the running prefix products (pref[]).
//     dx = (x2 - x1) is NOT stored — in the backward pass it is
//     recomputed as a single fr_sub from P.x,Q.x, which are loaded there
//     ANYWAY for the affine formula, so the recompute is free (one sub,
//     zero extra loads). Private array halved vs the two-array form
//     (CH BigInts instead of 2*CH).
//  2. Lean affine formula — only `lambda` survives across steps; r_x/r_y
//     are reused in place (no slope/dy/t1/dxb temporaries):
//       lambda = (y2-y1)*inv_dx ; x3 = lambda^2 - x1 - x2 ;
//       y3 = lambda*(x1-x3) - y1
//
// Single kernel: no inv_dx buffer round-trip, no double P,Q load. One
// fr_inv_by_a per CH-pair chunk. xs = inputs (4 BigInt/pair AoS),
// outputs = R.x,R.y (2/pair). params.x = n_threads (= #pairs / CH).

const CH: u32 = {{ ch }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

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

    var acc: BigInt = get_r();
    for (var i = 0u; i < CH; i = i + 1u) {
        let pb = (chunk_base + i) * 4u;
        var p_x = xs[pb + 0u];
        var q_x = xs[pb + 2u];
        var dx = fr_sub(&q_x, &p_x);
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
        let pb = g * 4u;
        var p_x = xs[pb + 0u];
        var p_y = xs[pb + 1u];
        var q_x = xs[pb + 2u];
        var q_y = xs[pb + 3u];

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda = fr_sub(&q_y, &p_y);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_x);
        r_x = fr_sub(&r_x, &q_x);
        var r_y = fr_sub(&p_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &p_y);

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;

        if (i != 0u) {
            var dx_back = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
