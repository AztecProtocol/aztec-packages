// Fully-parallel "tile" batch-affine forward kernel: ONE thread = ONE
// pair in EVERY kernel (never pairs/R), so global occupancy matches the
// apply_precomputed_k1 floor (pairs threads). A workgroup of TPB threads
// owns a TILE of TPB consecutive pairs.
//
// Each thread loads its own dx = q_x - p_x. The workgroup then computes,
// purely in shared memory with every thread active at every step:
//
//   prefixb[g] = Π_{i<=j within tile} dx_i   (inclusive within-tile prefix)
//   suffixb[g] = Π_{i>=j within tile} dx_i   (inclusive within-tile suffix)
//
// via Hillis-Steele scans (log2(TPB) steps, all threads active, ~log2(TPB)
// montmuls/pair). Thread (TPB-1) emits the per-tile total dx product:
//
//   tiletot[tileIdx] = Π_{all i in tile} dx_i  ( = prefixb of last pair )
//
// K2 (ba_rbs_seed-style, single tiny thread over tiletot of length
// pairs/TPB) does the only inversion and yields tileseed[T]=1/tiletot[T].
// K3 reconstructs each per-pair inverse with no inversion:
//
//   inv_dx_g = tileseed[T] * exclPrefix_g * exclSuffix_g
//
// where exclPrefix_g = prefixb[g-1] (or 1 if j==0) and
// exclSuffix_g = suffixb[g+1] (or 1 if j==TPB-1). Correctness:
// tileseed = 1/Π_all_in_tile, exclPrefix·exclSuffix = Π_{i!=j} dx_i, so
// the product = (Π_{i!=j})/(Π_all) = 1/dx_j. ✓
//
// bindings: 0 inp (AoS 4 BigInt/pair, read), 1 prefixb (1/pair, rw),
// 2 suffixb (1/pair, rw), 3 params=(n_pairs,_,_,_), 4 tiletot
// (1/tile, rw).

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       inp:     array<BigInt>;
@group(0) @binding(1) var<storage, read_write> prefixb: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> suffixb: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;
@group(0) @binding(4) var<storage, read_write> tiletot: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

// Double-buffered Hillis-Steele scratch: ping/pong avoids a barrier-race
// on in-place updates. Only TWO TPB-wide arrays total — the prefix scan
// runs to completion first, then the SAME two arrays are reused for the
// suffix scan, so workgroup storage stays 2*TPB*sizeof(BigInt) and TPB
// up to 128 fits in the 32768-byte limit.
var<workgroup> shA: array<BigInt, {{ workgroup_size }}>;
var<workgroup> shB: array<BigInt, {{ workgroup_size }}>;

fn load_dx(g: u32) -> BigInt {
    let pb = g * 4u;
    var px = inp[pb + 0u];
    var qx = inp[pb + 2u];
    return fr_sub(&qx, &px);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let n = params.x;
    let g = wid.x * TPB + tid;

    var dx: BigInt;
    if (g < n) {
        dx = load_dx(g);
    } else {
        dx = get_r();
    }
    // --- Hillis-Steele inclusive PREFIX scan over the TPB-wide tile ---
    // Compile-time bounded by TPB ⇒ uniform control flow for the
    // barriers; every thread is active at every step.
    shA[tid] = dx;
    workgroupBarrier();
    var src = 0u;
    for (var off = 1u; off < TPB; off = off << 1u) {
        if (src == 0u) {
            var cur = shA[tid];
            if (tid >= off) {
                var nb = shA[tid - off];
                cur = montgomery_product(&cur, &nb);
            }
            shB[tid] = cur;
        } else {
            var cur = shB[tid];
            if (tid >= off) {
                var nb = shB[tid - off];
                cur = montgomery_product(&cur, &nb);
            }
            shA[tid] = cur;
        }
        src = 1u - src;
        workgroupBarrier();
    }
    var inclPre: BigInt;
    if (src == 0u) { inclPre = shA[tid]; } else { inclPre = shB[tid]; }
    workgroupBarrier();

    // --- Hillis-Steele inclusive SUFFIX scan (same scratch reused) ---
    shA[tid] = dx;
    workgroupBarrier();
    src = 0u;
    for (var off = 1u; off < TPB; off = off << 1u) {
        if (src == 0u) {
            var cur = shA[tid];
            if (tid + off < TPB) {
                var nb = shA[tid + off];
                cur = montgomery_product(&cur, &nb);
            }
            shB[tid] = cur;
        } else {
            var cur = shB[tid];
            if (tid + off < TPB) {
                var nb = shB[tid + off];
                cur = montgomery_product(&cur, &nb);
            }
            shA[tid] = cur;
        }
        src = 1u - src;
        workgroupBarrier();
    }
    var inclSuf: BigInt;
    if (src == 0u) { inclSuf = shA[tid]; } else { inclSuf = shB[tid]; }

    if (g < n) {
        prefixb[g] = inclPre;
        suffixb[g] = inclSuf;
    }
    // Inclusive prefix of the last lane in the tile == product of all dx
    // in the tile. Emit it as the per-tile total dx product.
    if (tid == TPB - 1u) {
        tiletot[wid.x] = inclPre;
    }
}
