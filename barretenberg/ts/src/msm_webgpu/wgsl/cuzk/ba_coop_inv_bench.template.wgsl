// Two-level COOPERATIVE Montgomery batch-inversion batch-affine kernel.
//
// One single global dispatch. A workgroup of W threads cooperatively
// performs EXACTLY ONE field inversion (fr_inv_by_a) amortised over
// W*C independent affine pairs, while the launched thread count stays
// at the GPU saturation knee (threads = ceil(PAIRS/C), C small).
//
// TWO-LEVEL BATCH INVERSION INVARIANT
// -----------------------------------
// Let dx[t][i] = Q.x - P.x for the i-th pair of thread t (0<=i<C),
// 0<=t<W within a workgroup. Define the per-thread total
//   Tp_t = prod_{i=0..C-1} dx[t][i]
// and the workgroup grand product
//   G = prod_{t=0..W-1} Tp_t = prod over ALL W*C dx values.
// Phase B computes gInv = 1/G with the SINGLE fr_inv_by_a, plus an
// exclusive prefix product pre_t = prod_{j<t} Tp_j and an exclusive
// suffix product suf_t = prod_{j>t} Tp_j (both O(log W) depth). Then
//   invSeed_t = gInv * pre_t * suf_t
//             = (1 / (pre_t * Tp_t * suf_t)) * pre_t * suf_t
//             = 1 / Tp_t.
// Phase C peels invSeed_t over the thread's C pairs:
//   inv_dx[t][i] = invSeed_t * (prod_{k<i} dx[t][k]) ;  invSeed *= dx_i
// so inv_dx[t][i] = 1/dx[t][i]. The composition
//   (level-1 per-thread prefix peel) o (level-2 cross-thread W-wide peel)
// is byte-identical to ONE flat Montgomery batch inversion over all W*C
// dx values: every per-pair reciprocal equals the reciprocal a single
// flat batch inversion of the W*C list would produce, and the only
// modular inversion executed is fr_inv_by_a(G) -- ONE per workgroup.
//
// PHASE B IS LOGARITHMIC (NOT the O(W) serial lane-0 combine of
// ba_wgamort). pre_t and suf_t are computed by Hillis-Steele inclusive
// scans over the W per-thread totals held in one workgroup array tp[W].
// Each of the ceil(log2 W) steps has ALL W threads do one
// montgomery_product in parallel (read a,b into registers, barrier,
// write, barrier -> hazard-free in-place); cross-thread work is
// O(W log W) montmuls at O(log W) depth, never an O(W) chain on one
// thread. Exactly ONE thread (lane 0) runs the single fr_inv_by_a.
//
// LAYOUT: SoA + vec4, identical to ba_msm_bucket. BigInt = 20 u32 =
// 5 vec4 groups (VG=5). 4 input planes (0=P.x 1=P.y 2=Q.x 3=Q.y), each
// VG*N vec4; 2 output planes (0=R.x 1=R.y). params.x = N (total pairs,
// a multiple of W*C), params.y = T (thread count = N/C).
// Workgroup wg owns the contiguous block of W*C pairs starting at
// wg*W*C; thread lid's chunk-iter i maps to pair
//   wg*(W*C) + i*W + lid
// so consecutive lids touch consecutive pairs at every i (coalesced).
// Points are independent (packAffineSoA enforces P.x != Q.x) so every
// dx is well-defined and nonzero.

const C: u32 = {{ s }}u;
const W: u32 = {{ workgroup_size }}u;
const VG: u32 = 5u; // 20 limbs / 4 = 5 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

var<workgroup> tp: array<BigInt, {{ workgroup_size }}>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id)  lid: vec3<u32>,
    @builtin(workgroup_id)         wid: vec3<u32>,
) {
    let N = params.x;
    let T = params.y;
    let lane = lid.x;
    let wg_base = wid.x * W * C;

    let plane  = VG * N;
    let px_base = 0u * plane;
    let py_base = 1u * plane;
    let qx_base = 2u * plane;
    let qy_base = 3u * plane;

    // ---- Phase A: per-thread forward prefix product of C dx values ----
    // pref[i] = dx[lane][0] * ... * dx[lane][i] (inclusive, registers).
    // Tp = pref[C-1] = product of this thread's C dx values.
    var pref: array<BigInt, {{ s }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < C; i = i + 1u) {
        let e = wg_base + i * W + lane;
        var p_x = load_be(px_base, e, N);
        var q_x = load_be(qx_base, e, N);
        var dx = fr_sub(&q_x, &p_x);
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
    }
    let Tp = acc;

    // ---- Phase B: O(log W) cross-thread batch inversion, ONE fr_inv ----
    // tp[lane] = Tp; Hillis-Steele inclusive scan -> pre_lane =
    // exclusive prefix product (product of Tp_j for j<lane). One
    // designated thread does the SINGLE fr_inv_by_a of the grand
    // product, then a symmetric reversed scan yields the exclusive
    // suffix product, and invSeed = gInv * pre * suf = 1/Tp.
    tp[lane] = Tp;
    workgroupBarrier();

    // Inclusive Hillis-Steele scan over tp[] (all W threads parallel,
    // O(log W) steps). Hazard-free in-place: read a,b to registers,
    // barrier, write, barrier.
    for (var off = 1u; off < W; off = off << 1u) {
        var a = tp[lane];
        var b: BigInt;
        let has = lane >= off;
        if (has) { b = tp[lane - off]; }
        workgroupBarrier();
        if (has) { a = montgomery_product(&a, &b); }
        tp[lane] = a;
        workgroupBarrier();
    }
    // tp[lane] is now the inclusive prefix product of Tp_0..Tp_lane.
    // Exclusive prefix product pre_lane = tp[lane] / Tp_lane is obtained
    // without division as the inclusive scan value of the PREVIOUS lane
    // (identity for lane 0). Grand product G = tp[W-1].
    var pre_l: BigInt = get_r();
    if (lane > 0u) { pre_l = tp[lane - 1u]; }
    var grand: BigInt = tp[W - 1u];
    workgroupBarrier();

    // The SINGLE modular inversion: exactly one thread per workgroup.
    // {{{ inv_call }}} is fr_inv_by_a(grand) for the full kernel; the
    // noinv isolation twin substitutes `grand` (the ONLY change) while
    // keeping the workgroup array, barriers, upsweep and downsweep so
    // full-noinv is a confound-free per-pair modinv cost.
    if (lane == 0u) {
        tp[0] = {{{ inv_call }}};
    }
    workgroupBarrier();
    var gInv: BigInt = tp[0];
    workgroupBarrier();

    // Reversed inclusive Hillis-Steele scan for the exclusive suffix
    // product suf_lane = product of Tp_j for j>lane. Reuse tp[].
    tp[lane] = Tp;
    workgroupBarrier();
    for (var off = 1u; off < W; off = off << 1u) {
        var a = tp[lane];
        var b: BigInt;
        let has = lane + off < W;
        if (has) { b = tp[lane + off]; }
        workgroupBarrier();
        if (has) { a = montgomery_product(&a, &b); }
        tp[lane] = a;
        workgroupBarrier();
    }
    var suf_l: BigInt = get_r();
    if (lane + 1u < W) { suf_l = tp[lane + 1u]; }
    workgroupBarrier();

    // invSeed = gInv * pre_l * suf_l = 1 / Tp_lane.
    var invSeed = montgomery_product(&gInv, &pre_l);
    invSeed = montgomery_product(&invSeed, &suf_l);

    // ---- Phase C: per-thread backward peel + lean affine formula ----
    // inv_dx_i = invSeed * pref[i-1] (pref[-1] = R = 1); invSeed *= dx_i.
    var inv = invSeed;
    for (var jj = 0u; jj < C; jj = jj + 1u) {
        let i = C - 1u - jj;
        let e = wg_base + i * W + lane;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);
        var q_x = load_be(qx_base, e, N);
        var q_y = load_be(qy_base, e, N);

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

        store_be(0u * plane, e, N, &r_x);
        store_be(1u * plane, e, N, &r_y);

        if (i != 0u) {
            var dx_back = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
