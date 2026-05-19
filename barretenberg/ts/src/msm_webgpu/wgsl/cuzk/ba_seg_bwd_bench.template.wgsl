// Segmented batch-affine, kernel 3/3: backward peel + affine formula.
//
// Each thread owns the same segment of S = params.y pairs. seed =
// seg_seed[t] = 1/(product of dx in segment). Walks the segment backward
// reading the within-segment prefix products from GLOBAL memory (no
// private array, O(1) register state), recomputing dx = x2-x1 for free
// (P,Q are loaded here for the formula anyway), and emitting R via the
// lean formula. NO inversion code in this kernel ⇒ small footprint ⇒
// maximal occupancy ⇒ the per-pair loads are latency-hidden.
//
//   inv_dx_i = (i==0) ? seed : seed * prefix[g-1]
//   lambda = (y2-y1)*inv_dx ; x3 = lambda^2 - x1 - x2 ;
//   y3 = lambda*(x1-x3) - y1
//   seed *= dx_i   (advance, i>0)
//
// bindings: 0 inputs (AoS 4/pair, read), 1 prefix (1/pair, read),
// 2 segseed (1/segment, read) + outputs packed: see runner. To stay
// within 4 bindings, outputs reuses binding 1's buffer region is NOT
// safe; instead binding layout is:
//   0 inputs(read) 1 prefix(read) 2 segseed(read) 3 params
// and R is written back into a separate `outp` aliased via binding 2's
// buffer is also unsafe — so this kernel uses 5 bindings.
@group(0) @binding(0) var<storage, read>       inp:     array<BigInt>;
@group(0) @binding(1) var<storage, read>       prefixb: array<BigInt>;
@group(0) @binding(2) var<storage, read>       segseed: array<BigInt>;
@group(0) @binding(3) var<storage, read_write> outp:    array<BigInt>;
@group(0) @binding(4) var<uniform>             params:  vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let S = params.y;
    let t = gid.x;
    if (t >= n) { return; }

    let base = t * S;
    var seed = segseed[t];

    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let g = base + i;
        let pb = g * 4u;
        var p_x = inp[pb + 0u];
        var p_y = inp[pb + 1u];
        var q_x = inp[pb + 2u];
        var q_y = inp[pb + 3u];

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = seed;
        } else {
            var pp = prefixb[g - 1u];
            inv_dx = montgomery_product(&seed, &pp);
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
        outp[ob + 0u] = r_x;
        outp[ob + 1u] = r_y;

        if (i != 0u) {
            var dx = fr_sub(&q_x, &p_x);
            seed = montgomery_product(&seed, &dx);
        }
    }
}
