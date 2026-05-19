// Decisive primitive: cooperative block Blelloch (work-efficient)
// parallel prefix-product over dx = x2-x1. Each workgroup of TPB threads
// scans a block of BLK = 2*TPB consecutive pairs, ONE pair per slot, in
// workgroup shared memory — work-efficient (~2 montmul/element total,
// up-sweep + down-sweep), fully parallel across blocks, so total live
// threads = #pairs (max occupancy) and per-thread register state is
// O(1). Writes the inclusive within-block prefix product to global
// prefix[g] and the block total to blocktot[blk].
//
// This isolates the parallel-scan throughput: if a Blelloch BigInt scan
// runs near the montmul rate, the full parallel batch-inverse is viable.
//
// bindings: 0 inputs (AoS 4/pair, read), 1 prefix (1/pair, rw),
// 2 blocktot (1/block, rw), 3 params=(n_pairs, _, _, _).

const TPB: u32 = {{ workgroup_size }}u;
const BLK: u32 = {{ blk }}u;          // = 2 * TPB

@group(0) @binding(0) var<storage, read>       inp:      array<BigInt>;
@group(0) @binding(1) var<storage, read_write> prefixb:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> blocktot: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> sh: array<BigInt, {{ blk }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let n = params.x;
    let block_base = wid.x * BLK;

    let g0 = block_base + tid;
    let g1 = block_base + tid + TPB;

    var dx0: BigInt;
    var dx1: BigInt;
    if (g0 < n) {
        let pb = g0 * 4u;
        var px = inp[pb + 0u];
        var qx = inp[pb + 2u];
        dx0 = fr_sub(&qx, &px);
    } else {
        dx0 = get_r();
    }
    if (g1 < n) {
        let pb = g1 * 4u;
        var px = inp[pb + 0u];
        var qx = inp[pb + 2u];
        dx1 = fr_sub(&qx, &px);
    } else {
        dx1 = get_r();
    }
    sh[tid] = dx0;
    sh[tid + TPB] = dx1;
    workgroupBarrier();

    // Up-sweep (reduce): build partial products.
    var offset: u32 = 1u;
    for (var d = BLK >> 1u; d > 0u; d = d >> 1u) {
        workgroupBarrier();
        if (tid < d) {
            let ai = offset * (2u * tid + 1u) - 1u;
            let bi = offset * (2u * tid + 2u) - 1u;
            var a = sh[ai];
            var b = sh[bi];
            sh[bi] = montgomery_product(&a, &b);
        }
        offset = offset * 2u;
    }

    // Save block total, clear last for exclusive down-sweep.
    if (tid == 0u) {
        blocktot[wid.x] = sh[BLK - 1u];
        sh[BLK - 1u] = get_r();
    }

    // Down-sweep: produce exclusive prefix products.
    for (var d = 1u; d < BLK; d = d * 2u) {
        offset = offset >> 1u;
        workgroupBarrier();
        if (tid < d) {
            let ai = offset * (2u * tid + 1u) - 1u;
            let bi = offset * (2u * tid + 2u) - 1u;
            var t = sh[ai];
            sh[ai] = sh[bi];
            var sb = sh[bi];
            sh[bi] = montgomery_product(&sb, &t);
        }
    }
    workgroupBarrier();

    // Convert exclusive -> inclusive (mul by own dx) and write out.
    if (g0 < n) {
        var e0 = sh[tid];
        prefixb[g0] = montgomery_product(&e0, &dx0);
    }
    if (g1 < n) {
        var e1 = sh[tid + TPB];
        prefixb[g1] = montgomery_product(&e1, &dx1);
    }
}
