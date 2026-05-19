// Single-kernel, TWO-LEVEL workgroup-amortised batch-affine.
//
// Combines the per-thread chunk batch-inverse of ba_fused_tight (good
// GPU occupancy: each thread owns a small chunk of C pairs, so the grid
// runs PAIRS/C threads) with the workgroup-level inversion combine of
// ba_wgtile (ONE fr_inv_by_a per WORKGROUP). ONE kernel, ONE global
// pass, ZERO global scratch buffers, ZERO separate inversion kernel.
//
// The single field inversion is amortised over TPB*C pairs instead of
// the C pairs of ba_fused_tight: with TPB=64, C=8 that is 512 pairs, so
// the ~48 ns fr_inv contributes ~0.09 ns/pair while C stays small
// enough that PAIRS/C threads still saturate the GPU.
//
// Pair assignment is strided for coalescing: a workgroup owns the
// contiguous block of TPB*C pairs starting at wgid*(TPB*C); within the
// workgroup, thread lid's chunk-iter i maps to pair
//   wgid*(TPB*C) + i*TPB + lid
// so consecutive threads touch consecutive pairs at every i.
//
// Phase 1 (per thread, no barrier): forward sweep over the thread's C
//   pairs. acc accumulates Π dx (cheap accumulator montmul); pref[i] is
//   the inclusive-prefix product (private register array, C BigInt).
//   chunkProd = acc is written to wg_cp[lid].
// Phase 2 (lane 0 only, ONE fr_inv): serial exclusive prefix/suffix
//   over the TPB chunk-products plus the workgroup grand product
//   G = Π chunkProd; wg_ginv = fr_inv_by_a(G). ~2*TPB cheap montmul +
//   ONE fr_inv per workgroup, hidden across the many concurrent
//   workgroups.
// Phase 3 (per thread, no barrier): seed = wg_ginv * wg_pre[lid] *
//   wg_suf[lid] = 1/chunkProd_lid (proof:
//     (1/Π_all chunkProd) * (Π_{t<lid} chunkProd_t) * (Π_{t>lid} chunkProd_t)
//     = 1 / chunkProd_lid).
//   Backward peel over the thread's C pairs with the lean affine
//   formula (only lambda survives across steps):
//     lambda = (q_y-p_y)*inv_dx ; r_x = lambda^2 - p_x - q_x ;
//     r_y = lambda*(p_x-r_x) - p_y
//
// PAIRS is a multiple of TPB*C, so every thread has a full chunk and
// all threads reach every barrier (no tail, no early return before the
// final barrier). dx for an absent pair would be padded with R
// (identity) but in practice never occurs.
//
// bindings: 0 inp (AoS 4/pair, read), 1 outp (2/pair, rw),
// 2 params=(n_threads,_,_,_) where n_threads = PAIRS / C. No other
// buffers.

const C:   u32 = {{ chunk }}u;
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(2) var<uniform>             params: vec4<u32>;

var<workgroup> wg_cp:  array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_pre: array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_suf: array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_ginv: BigInt;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let n = params.x;
    let lane = lid.x;
    let wg_base = wid.x * TPB * C;
    let global_thread = wid.x * TPB + lane;
    let lane_on = global_thread < n;

    var pref: array<BigInt, {{ chunk }}>;

    var acc: BigInt = get_r();
    for (var i = 0u; i < C; i = i + 1u) {
        var dx = get_r();
        if (lane_on) {
            let pb = (wg_base + i * TPB + lane) * 4u;
            var p_x = inp[pb + 0u];
            var q_x = inp[pb + 2u];
            dx = fr_sub(&q_x, &p_x);
        }
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
    }
    wg_cp[lane] = acc;
    workgroupBarrier();

    if (lane == 0u) {
        var run: BigInt = get_r();
        for (var s = 0u; s < TPB; s = s + 1u) {
            wg_pre[s] = run;
            var b = wg_cp[s];
            run = montgomery_product(&run, &b);
        }
        let grand = run;
        var rr: BigInt = get_r();
        for (var s2 = 0u; s2 < TPB; s2 = s2 + 1u) {
            let s = TPB - 1u - s2;
            wg_suf[s] = rr;
            var b2 = wg_cp[s];
            rr = montgomery_product(&rr, &b2);
        }
        var g = grand;
        wg_ginv = fr_inv_by_a(g);
    }
    workgroupBarrier();

    if (!lane_on) { return; }

    var pre_l = wg_pre[lane];
    var suf_l = wg_suf[lane];
    var inv = wg_ginv;
    inv = montgomery_product(&inv, &pre_l);
    inv = montgomery_product(&inv, &suf_l);

    for (var jj = 0u; jj < C; jj = jj + 1u) {
        let i = C - 1u - jj;
        let g = wg_base + i * TPB + lane;
        let pb = g * 4u;
        var p_x = inp[pb + 0u];
        var p_y = inp[pb + 1u];
        var q_x = inp[pb + 2u];
        var q_y = inp[pb + 3u];

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

        let ob = g * 2u;
        outp[ob + 0u] = r_x;
        outp[ob + 1u] = r_y;

        if (i != 0u) {
            var dx_back = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dx_back);
        }
    }
}
