// Single fused subgroup-shuffle batch-affine: ONE kernel, ONE global pass,
// ZERO global intermediate buffers, ZERO workgroup shared memory, ZERO
// workgroupBarrier. One thread = one pair (full occupancy, like
// apply_precomputed_k1). The batch-inverse is folded entirely into
// hardware SIMD-group (subgroup) shuffles.
//
// Per subgroup of SGSZ active lanes, lane j = subgroup_invocation_id,
// g = global pair, dx_j = (q_x - p_x) for that lane's pair:
//
//   1. load P,Q (AoS BigInt), dx = q_x - p_x.
//   2. INCLUSIVE prefix product of dx across the subgroup via a
//      Hillis-Steele scan over subgroupShuffleUp:
//        cur = dx
//        for stride in {1,2,4,...} while stride < SGSZ:
//          nbr.limbs[k] = subgroupShuffleUp(cur.limbs[k], stride)  (per u32 limb)
//          if subgroup_invocation_id >= stride:
//              cur = montgomery_product(nbr, cur)
//      After ceil(log2(SGSZ)) steps `cur` (= incl[j]) = Π_{i<=j} dx_i
//      within the subgroup.  Symmetrically an INCLUSIVE suffix product
//      `sfx[j]` = Π_{i>=j} dx_i is built with subgroupShuffleDown.
//   3. subgroup total T = Π_all dx_i = incl[SGSZ-1], broadcast to every
//      lane via subgroupShuffle(incl.limbs[k], SGSZ-1). Lane 0 inverts
//      it ONCE: sgInv = 1/T = fr_inv_by_a(T); broadcast sgInv to all
//      lanes via subgroupBroadcastFirst (lane-0 value). One fr_inv per
//      subgroup (~SGSZ pairs) ⇒ ~48/SGSZ ns/pair amortised. Only lane 0
//      of EACH subgroup stalls in the inversion; the other lanes of the
//      SAME subgroup reconverge at the broadcast, and OTHER subgroups in
//      the workgroup are independent and keep running.
//   4. exclusive prefix exPre_j = Π_{i<j} dx_i = incl shuffled-up-by-1
//      (= R, i.e. montgomery-1, for lane 0).  exclusive suffix
//      exSuf_j = Π_{i>j} dx_i = sfx shuffled-down-by-1 (= R for the last
//      lane).  Then
//        inv_dx_j = sgInv * exPre_j * exSuf_j
//                 = (1/Π_all) * (Π_{i<j} dx_i) * (Π_{i>j} dx_i)
//                 = (Π_{i!=j} dx_i) / (Π_all dx_i) = 1 / dx_j   ✓
//   5. lean affine formula:
//        lambda = (q_y - p_y) * inv_dx ; r_x = lambda^2 - p_x - q_x ;
//        r_y = lambda * (p_x - r_x) - p_y
//
// Tail (g >= n) loads dx = R (montgomery-1, the multiplicative identity)
// so an under-full final subgroup leaves the scan/total/inversion
// correct for the live lanes; the outp write is skipped for dead lanes.
//
// bindings: 0 inp (AoS 4/pair, read), 1 outp (2/pair, rw),
// 2 params=(n_pairs,_,_,_). NO other buffers.
//
// NOTE: the `enable subgroups;` directive is prepended by
// gen_ba_sg_bench_shader (WGSL requires `enable` before all
// declarations, and this template is concatenated after the shared
// partials), so it must NOT appear here.

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(2) var<uniform>             params: vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(subgroup_invocation_id) sg_id: u32,
    @builtin(subgroup_size) sg_size: u32,
) {
    let n = params.x;
    let g = gid.x;

    var p_x = get_r();
    var p_y = get_r();
    var q_x = get_r();
    var q_y = get_r();
    var dx  = get_r();
    if (g < n) {
        let pb = g * 4u;
        p_x = inp[pb + 0u];
        p_y = inp[pb + 1u];
        q_x = inp[pb + 2u];
        q_y = inp[pb + 3u];
        dx  = fr_sub(&q_x, &p_x);
    }

    // Inclusive prefix product across the subgroup (Hillis-Steele up).
    var incl = dx;
    for (var stride = 1u; stride < sg_size; stride = stride << 1u) {
        var nbr: BigInt;
        for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
            nbr.limbs[k] = subgroupShuffleUp(incl.limbs[k], stride);
        }
        if (sg_id >= stride) {
            incl = montgomery_product(&nbr, &incl);
        }
    }

    // Inclusive suffix product across the subgroup (Hillis-Steele down).
    var sfx = dx;
    for (var stride = 1u; stride < sg_size; stride = stride << 1u) {
        var nbr: BigInt;
        for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
            nbr.limbs[k] = subgroupShuffleDown(sfx.limbs[k], stride);
        }
        if (sg_id + stride < sg_size) {
            sfx = montgomery_product(&nbr, &sfx);
        }
    }

    // Subgroup total = inclusive prefix of the highest lane, broadcast.
    var total: BigInt;
    for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
        total.limbs[k] = subgroupShuffle(incl.limbs[k], sg_size - 1u);
    }

    // One inversion per subgroup; only lane 0 stalls, then reconverge.
    var sgInv: BigInt;
    if (sg_id == 0u) {
        sgInv = fr_inv_by_a(total);
    } else {
        sgInv = total;
    }
    for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
        sgInv.limbs[k] = subgroupBroadcastFirst(sgInv.limbs[k]);
    }

    // Exclusive prefix / suffix via single-lane shuffles. The identity for
    // the boundary lanes is R (montgomery representation of 1).
    var exPre = get_r();
    for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
        let v = subgroupShuffleUp(incl.limbs[k], 1u);
        if (sg_id >= 1u) {
            exPre.limbs[k] = v;
        }
    }
    var exSuf = get_r();
    for (var k = 0u; k < NUM_WORDS; k = k + 1u) {
        let v = subgroupShuffleDown(sfx.limbs[k], 1u);
        if (sg_id + 1u < sg_size) {
            exSuf.limbs[k] = v;
        }
    }

    var inv_dx = sgInv;
    inv_dx = montgomery_product(&inv_dx, &exPre);
    inv_dx = montgomery_product(&inv_dx, &exSuf);

    var lambda = fr_sub(&q_y, &p_y);
    lambda = montgomery_product(&lambda, &inv_dx);
    var r_x = montgomery_product(&lambda, &lambda);
    r_x = fr_sub(&r_x, &p_x);
    r_x = fr_sub(&r_x, &q_x);
    var r_y = fr_sub(&p_x, &r_x);
    r_y = montgomery_product(&lambda, &r_y);
    r_y = fr_sub(&r_y, &p_y);

    if (g < n) {
        let ob = g * 2u;
        outp[ob + 0u] = r_x;
        outp[ob + 1u] = r_y;
    }
}
