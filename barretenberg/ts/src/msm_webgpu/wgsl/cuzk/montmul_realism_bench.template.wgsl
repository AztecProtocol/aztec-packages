// Montmul-realism microbench. Isolates realistic Montgomery-multiply
// throughput by varying ONLY the operand dependency structure while
// holding the montmul count per iteration fixed, so ns/op is directly
// per-single-montmul comparable across modes.
//
// The existing standalone montmul bench (field_mul_bench_u32 /
// montmul_resident res=0) measures `a = montgomery_product(&a, &b)`
// repeated k times with `b` loaded once and INVARIANT and `a` a single
// feedback accumulator. That is degenerate: minimal live state, one
// invariant operand, perfectly pipelined across all threads — it does
// not reflect the affine formula, which issues montmuls with DISTINCT
// operands in a real dependency DAG (lambda = dy*inv, lsq = lambda^2,
// ry = lambda*t0) interleaved with subs.
//
// Three {{ mode }} loop bodies, all 3-montmul/iter except the baseline:
//   chain_invariant : 1 montmul/iter, b invariant (degenerate baseline)
//   chain_distinct  : 3 montmul + 3 sub/iter, distinct operands in a
//                      real DAG (mirrors lambda -> lambda^2 / lambda*t0)
//   chain_indep     : 3 INDEPENDENT montmul + 3 sub/iter (throughput
//                      ceiling with distinct operands, no intra-iter dep)
//
// Operands are function `var` BigInts loaded once from xs (a,b,c) and
// ys (d,e,f) — array elems copied to locals before any &ptr use
// (ptr<function,BigInt> rule). They evolve every iteration so successive
// iterations see distinct, data-dependent operands.
//
// Loop bounds: the only data-dependent loop is `for i in 0..k` with
// k = params.y host-uniform (host-capped). `if (tid >= n)` is a guard,
// not a loop bound. Inner montgomery_product loops are bounded by the
// compile-time NUM_WORDS constant.

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec2<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let k = params.y;
    let tid = gid.x;
    if (tid >= n) { return; }

    let xb = tid * 3u;
    let yb = tid * 3u;
    var a = xs[xb + 0u];
    var b = xs[xb + 1u];
    var c = xs[xb + 2u];
    var d = ys[yb + 0u];
    var e = ys[yb + 1u];
    var f = ys[yb + 2u];

    for (var iter = 0u; iter < k; iter = iter + 1u) {
{{{ body }}}
    }

    outputs[tid] = fr_sub(&a, &c);
}
