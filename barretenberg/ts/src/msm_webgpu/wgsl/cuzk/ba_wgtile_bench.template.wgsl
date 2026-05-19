// Single fused workgroup-tile batch-affine: ONE kernel, ONE global pass,
// ZERO global intermediate buffers. One workgroup = TPB threads = TPB
// consecutive pairs (a "tile"); ONE thread = ONE pair (full occupancy,
// like apply_precomputed_k1). The entire batch-inverse is done
// cooperatively in WORKGROUP SHARED memory — no inv_dx round-trip, no
// per-tile global total/seed buffers, no double P,Q load.
//
// Per tile (workgroup), lane j = local_invocation index, g = global pair:
//   1. load P,Q (AoS BigInt), dx = q_x - p_x, sh[j] = dx. barrier.
//   2. lane 0 serial forward walk: pre[jj] = Π_{i<=jj} sh[i] (inclusive
//      prefix); tileTotal = pre[TPB-1] = Π_all. lane 0 serial reverse
//      walk: suf[jj] = Π_{i>=jj} sh[i] (inclusive suffix). ONE lane does
//      ~2*TPB montmul / tile ≈ 2 montmul/pair; the other TPB-1 lanes
//      idle at the barrier, hidden across the ~PAIRS/TPB concurrent
//      workgroups. barrier.
//   3. lane 0 computes tileInv = 1/tileTotal via ONE fr_inv_by_a per
//      tile (≈ 48/TPB ns/pair amortised; the ~48 ns stall hidden across
//      the many concurrent workgroups). Stored in wgInv. barrier.
//   4. every thread: exclPref = (j==0)? R : pre[j-1];
//      exclSuf = (j==TPB-1)? R : suf[j+1];
//      inv_dx = wgInv * exclPref * exclSuf
//             = (1/Π_all) * (Π_{i<j} dx_i) * (Π_{i>j} dx_i)
//             = (Π_{i!=j} dx_i) / (Π_all dx_i) = 1 / dx_j  ✓
//      then the lean affine formula:
//        lambda = (q_y - p_y) * inv_dx ; r_x = lambda^2 - p_x - q_x ;
//        r_y = lambda * (p_x - r_x) - p_y
//
// Tail (g >= n) is padded dx = R so the scan/inversion stay in uniform
// control flow; the outp write is skipped. PAIRS is a multiple of TPB
// here so no tail occurs in practice.
//
// bindings: 0 inp (AoS 4/pair, read), 1 outp (2/pair, rw),
// 2 params=(n_pairs,_,_,_). NO other buffers.

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       inp:    array<BigInt>;
@group(0) @binding(1) var<storage, read_write> outp:   array<BigInt>;
@group(0) @binding(2) var<uniform>             params: vec4<u32>;

var<workgroup> sh:  array<BigInt, {{ workgroup_size }}>;
var<workgroup> pre: array<BigInt, {{ workgroup_size }}>;
var<workgroup> suf: array<BigInt, {{ workgroup_size }}>;
var<workgroup> wgInv: BigInt;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let n = params.x;
    let g = gid.x;
    let j = lid.x;

    var p_x = get_r();
    var p_y = get_r();
    var q_x = get_r();
    var q_y = get_r();
    var dx = get_r();
    if (g < n) {
        let pb = g * 4u;
        p_x = inp[pb + 0u];
        p_y = inp[pb + 1u];
        q_x = inp[pb + 2u];
        q_y = inp[pb + 3u];
        dx = fr_sub(&q_x, &p_x);
    }
    sh[j] = dx;
    workgroupBarrier();

    if (j == 0u) {
        var run = sh[0];
        pre[0] = run;
        for (var jj = 1u; jj < TPB; jj = jj + 1u) {
            var s = sh[jj];
            run = montgomery_product(&run, &s);
            pre[jj] = run;
        }
        var rrun = sh[TPB - 1u];
        suf[TPB - 1u] = rrun;
        for (var kk = 1u; kk < TPB; kk = kk + 1u) {
            let idx = TPB - 1u - kk;
            var s2 = sh[idx];
            rrun = montgomery_product(&rrun, &s2);
            suf[idx] = rrun;
        }
        wgInv = fr_inv_by_a(pre[TPB - 1u]);
    }
    workgroupBarrier();

    var exPre: BigInt;
    if (j == 0u) {
        exPre = get_r();
    } else {
        exPre = pre[j - 1u];
    }
    var exSuf: BigInt;
    if (j == TPB - 1u) {
        exSuf = get_r();
    } else {
        exSuf = suf[j + 1u];
    }

    var inv_dx = wgInv;
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
