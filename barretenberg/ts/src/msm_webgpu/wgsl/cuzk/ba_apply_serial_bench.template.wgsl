// Interleave-free M-serial affine apply.
//
// Each thread processes M INDEPENDENT pairs strictly serially: it fully
// computes one pair (lean formula, transient locals only), stores the
// result, then moves to the next pair. There is NO array<BigInt, M> and
// NO state carried between the M iterations, so the peak simultaneously
// live BigInt set is exactly one pair's working set (~8) regardless of
// M. The only thing M changes is how many times the fixed per-thread
// launch/occupancy overhead is amortised (over M*8 ops instead of 8).
//
// Strided pair assignment: pair g = tid + s*T (T = params.x = #threads),
// so consecutive threads touch consecutive pairs on every step s.
//
// Lean formula (only `lambda` survives across steps; r_x/r_y reused in
// place):
//   lambda = (q_y - p_y) * inv_dx
//   r_x    = lambda^2 - p_x - q_x
//   r_y    = lambda * (p_x - r_x) - p_y

const M: u32 = {{ m }}u;

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read>       invdx:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let total_threads = params.x;
    let tid = gid.x;
    if (tid >= total_threads) { return; }

    for (var s = 0u; s < M; s = s + 1u) {
        let g = tid + s * total_threads;
        let pb = g * 4u;
        var p_x = inp[pb + 0u];
        var p_y = inp[pb + 1u];
        var q_x = inp[pb + 2u];
        var q_y = inp[pb + 3u];
        var inv_dx = invdx[g];

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
    }
}
