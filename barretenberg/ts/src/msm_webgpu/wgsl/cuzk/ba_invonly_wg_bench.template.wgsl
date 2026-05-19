// Two-kernel pipeline stage 1, workgroup-amortised inversion.
//
// One fr_inv_by_a per WORKGROUP (TPB * CH pairs) instead of per
// per-thread chunk (CH pairs). Each thread still does its own private
// serial forward/backward over its CH-pair chunk (prefix in a private
// register array, same as ba_invonly), but the single field inversion is
// shared across the whole workgroup via a LIGHTWEIGHT thread-0 sequential
// combine over the TPB chunk-products held in workgroup memory — NOT the
// O(TPB·logTPB) Hillis-Steele scan the production kernel used. Thread 0
// does ~3·TPB montgomery_products + 1 fr_inv_by_a once per workgroup;
// every other thread idles only for that (rare) interval.
//
// xs = inputs (4 BigInt/pair AoS, P.x@0 Q.x@2). outputs = inv_dx (1/pair).
// params.x = n_threads (= #pairs / CH) used only as a bounds guard.
// CH = {{ ch }}, TPB = {{ workgroup_size }} (both compile-time).

const CH: u32 = {{ ch }}u;
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> wg_bt:  array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_pre: array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_suf: array<BigInt, {{ workgroup_size }}>;
var<workgroup> wg_invtot: BigInt;

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let n = params.x;
    let global_thread = wid.x * TPB + tid;
    let lane_on = global_thread < n;

    let wg_base = wid.x * TPB * CH;
    let chunk_base = wg_base + tid * CH;

    var pref: array<BigInt, {{ ch }}>;
    var dxs: array<BigInt, {{ ch }}>;

    var acc: BigInt = get_r();
    if (lane_on) {
        for (var i = 0u; i < CH; i = i + 1u) {
            let g = chunk_base + i;
            let pb = g * 4u;
            var p_x = xs[pb + 0u];
            var q_x = xs[pb + 2u];
            var dx = fr_sub(&q_x, &p_x);
            dxs[i] = dx;
            if (i == 0u) {
                acc = dx;
            } else {
                acc = montgomery_product(&acc, &dx);
            }
            pref[i] = acc;
        }
    }
    wg_bt[tid] = acc;
    workgroupBarrier();

    if (tid == 0u) {
        var run: BigInt = get_r();
        for (var s = 0u; s < TPB; s = s + 1u) {
            wg_pre[s] = run;
            var b = wg_bt[s];
            run = montgomery_product(&run, &b);
        }
        let total = run;
        var rr: BigInt = get_r();
        for (var s2 = 0u; s2 < TPB; s2 = s2 + 1u) {
            let s = TPB - 1u - s2;
            wg_suf[s] = rr;
            var b = wg_bt[s];
            rr = montgomery_product(&rr, &b);
        }
        var tot = total;
        wg_invtot = fr_inv_by_a(tot);
    }
    workgroupBarrier();

    if (!lane_on) { return; }

    var pre_t = wg_pre[tid];
    var suf_t = wg_suf[tid];
    var invtot = wg_invtot;
    var inv = montgomery_product(&invtot, &pre_t);
    inv = montgomery_product(&inv, &suf_t);

    for (var jj = 0u; jj < CH; jj = jj + 1u) {
        let i = CH - 1u - jj;
        let g = chunk_base + i;
        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }
        outputs[g] = inv_dx;
        if (i != 0u) {
            var dxi = dxs[i];
            inv = montgomery_product(&inv, &dxi);
        }
    }
}
