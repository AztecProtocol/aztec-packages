// Profiling kernel: chained montmul with a RESIDENT private array of
// RES BigInts that is read+written every iteration (so the compiler must
// keep all RES of them live across every montgomery_product call). This
// is a faithful proxy for the batch-affine prefix-product array's effect
// on montmul throughput/occupancy. Sweep RES to get the pressure curve.
//
// ns_per_op is reported over the montmul count (n*k). Compare RES=0
// (pure chained montmul, max occupancy) vs RES=8/16/24/32.

const RES: u32 = {{ res }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let k = params.y;
    let tid = gid.x;
    if (tid >= n) { return; }

    var a = xs[tid];
    var b = ys[tid];
    var arr: array<BigInt, {{ res_decl }}>;
    for (var i = 0u; i < RES; i = i + 1u) { arr[i] = a; }

    for (var iter = 0u; iter < k; iter = iter + 1u) {
        a = montgomery_product(&a, &b);
        if (RES > 0u) {
            let md = max(RES, 1u);
            let idx = iter % md;
            var e = arr[idx];
            arr[idx] = fr_add(&e, &a);
            a = fr_add(&a, &arr[(iter + 1u) % md]);
        }
    }
    outputs[tid] = a;
}
