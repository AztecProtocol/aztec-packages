// Segmented batch-affine, kernel 1/3: forward sweep.
//
// Each thread owns a contiguous segment of S = params.y pairs. It streams
// the within-segment Montgomery prefix products to GLOBAL memory
// (prefix[g]) — O(1) per-thread register state, NO private array — and
// writes its segment product to segtot[t]. dx = x2-x1 is consumed
// transiently (not stored; recomputed free in kernel 3 where P,Q are
// loaded for the formula anyway).
//
// bindings: 0 inputs (AoS 4 BigInt/pair, read), 1 prefix (1/pair, rw),
// 2 segtot (1/segment, rw), 3 params=(n_threads=T, S, _, _).

@group(0) @binding(0) var<storage, read>       inp:     array<BigInt>;
@group(0) @binding(1) var<storage, read_write> prefixb: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> segtot:  array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let S = params.y;
    let t = gid.x;
    if (t >= n) { return; }

    let base = t * S;
    var acc: BigInt;
    for (var i = 0u; i < S; i = i + 1u) {
        let g = base + i;
        let pb = g * 4u;
        var p_x = inp[pb + 0u];
        var q_x = inp[pb + 2u];
        var dx = fr_sub(&q_x, &p_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        prefixb[g] = acc;
    }
    segtot[t] = acc;
}
