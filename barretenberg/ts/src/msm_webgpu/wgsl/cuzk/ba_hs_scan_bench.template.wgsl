// Hillis-Steele inclusive prefix-product scan (work-INefficient
// O(N log N) but EVERY thread does a montmul EVERY step — full
// occupancy, no idle-thread halving that the Blelloch tree suffers).
// One pair per thread, BLK = TPB pairs per workgroup, double-buffered
// shared memory, log2(BLK) barrier steps. Tests whether the ~14 ns/pair
// of the Blelloch scan was the scan FLOOR or just the Blelloch's
// occupancy-halving / my implementation.
//
// bindings: 0 inputs (AoS 4/pair, read), 1 prefix (1/pair, rw),
// 2 blocktot (1/block, rw), 3 params=(n_pairs, _, _, _).

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       inp:      array<BigInt>;
@group(0) @binding(1) var<storage, read_write> prefixb:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> blocktot: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> shA: array<BigInt, {{ workgroup_size }}>;
var<workgroup> shB: array<BigInt, {{ workgroup_size }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let n = params.x;
    let g = wid.x * TPB + tid;

    var v: BigInt;
    if (g < n) {
        let pb = g * 4u;
        var px = inp[pb + 0u];
        var qx = inp[pb + 2u];
        v = fr_sub(&qx, &px);
    } else {
        v = get_r();
    }
    shA[tid] = v;
    workgroupBarrier();

    var src_is_a = true;
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var cur: BigInt;
        if (src_is_a) {
            cur = shA[tid];
            if (tid >= stride) {
                var l = shA[tid - stride];
                cur = montgomery_product(&l, &cur);
            }
        } else {
            cur = shB[tid];
            if (tid >= stride) {
                var l = shB[tid - stride];
                cur = montgomery_product(&l, &cur);
            }
        }
        workgroupBarrier();
        if (src_is_a) { shB[tid] = cur; } else { shA[tid] = cur; }
        src_is_a = !src_is_a;
        workgroupBarrier();
    }

    var result: BigInt;
    if (src_is_a) { result = shA[tid]; } else { result = shB[tid]; }
    if (g < n) {
        prefixb[g] = result;
    }
    if (tid == TPB - 1u) {
        blocktot[wid.x] = result;
    }
}
