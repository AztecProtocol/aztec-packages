// Register-blocked work-efficient prefix-product forward kernel
// (PIPELINE variant of ba_rbs_scan_bench). Identical Phase-1 and
// Phase-2 (FIX B single-thread serial combine). Phase-3 writes the
// per-pair WITHIN-THREAD INCLUSIVE prefix to global prefixb (iter3:
// this 1 BigInt/pair store is what lets K3 skip the O(R)-deep
// within-thread scan recompute — a single global read in K3 is far
// cheaper than R Montgomery multiplies). It also emits the per-thread
// EXCLUSIVE prefix/suffix of the thread-totals and the per-block
// total:
//
//   prefixb[g]       = Π_{j<=i within thread} dx_j  (i = g - thread_base)
//   thpre[wid*TPB+t] = Π_{u<t} threadTotal_u   (within this block)
//   thsuf[wid*TPB+t] = Π_{u>t} threadTotal_u   (within this block)
//   blocktot[wid]    = Π_{all u} threadTotal_u
//
// Net: TPB*R Phase-1 montmuls + 2*TPB single-thread combine montmuls +
// 1 BigInt/pair + 2 BigInt/thread + 1 BigInt/block of global writes.
// No barriers in Phase 1 / Phase 3; exactly two workgroup barriers
// around Phase 2.
//
// bindings: 0 inp (AoS 4 BigInt/pair, read), 1 thpre (1/thread, rw),
// 2 thsuf (1/thread, rw), 3 params=(n_pairs,_,_,_), 4 blocktot
// (1/block, rw), 5 prefixb (1/pair, rw).

const TPB: u32 = {{ workgroup_size }}u;
const RBLK: u32 = {{ rblk }}u;

@group(0) @binding(0) var<storage, read>       inp:      array<BigInt>;
@group(0) @binding(1) var<storage, read_write> thpre:    array<BigInt>;
@group(0) @binding(2) var<storage, read_write> thsuf:    array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;
@group(0) @binding(4) var<storage, read_write> blocktot: array<BigInt>;
@group(0) @binding(5) var<storage, read_write> prefixb:  array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

var<workgroup> shTot: array<BigInt, {{ workgroup_size }}>;
var<workgroup> shPre: array<BigInt, {{ workgroup_size }}>;
var<workgroup> shSuf: array<BigInt, {{ workgroup_size }}>;

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
    let block_base = wid.x * TPB * RBLK;
    let thread_base = block_base + tid * RBLK;

    // Phase 1: private inclusive within-thread prefix products. Each
    // running product is the WITHIN-THREAD inclusive prefix at pair i
    // (no block offset); kept in a private array so Phase 3 can store
    // it to prefixb for K3's recompute-free backward peel.
    var local: array<BigInt, {{ rblk }}>;
    var acc: BigInt = get_r();
    for (var i = 0u; i < RBLK; i = i + 1u) {
        let g = thread_base + i;
        var dx: BigInt;
        if (g < n) {
            dx = load_dx(g);
        } else {
            dx = get_r();
        }
        acc = montgomery_product(&acc, &dx);
        local[i] = acc;
    }
    let thread_total = acc;

    // Phase 2 (FIX B): single-thread serial combine by thread 0.
    shTot[tid] = thread_total;
    workgroupBarrier();
    if (tid == 0u) {
        var run: BigInt = get_r();
        for (var t = 0u; t < TPB; t = t + 1u) {
            shPre[t] = run;
            var st = shTot[t];
            run = montgomery_product(&run, &st);
        }
        // run == blockTotal (Π all TPB thread-totals).
        var suf: BigInt = get_r();
        for (var jj = 0u; jj < TPB; jj = jj + 1u) {
            let t = TPB - 1u - jj;
            shSuf[t] = suf;
            var st = shTot[t];
            suf = montgomery_product(&suf, &st);
        }
        blocktot[wid.x] = run;
    }
    workgroupBarrier();

    // Phase 3 (barrier-free): per-thread exclusive prefix/suffix of
    // thread totals + per-pair within-thread inclusive prefix.
    let tg = wid.x * TPB + tid;
    thpre[tg] = shPre[tid];
    thsuf[tg] = shSuf[tid];
    for (var i = 0u; i < RBLK; i = i + 1u) {
        let g = thread_base + i;
        if (g < n) {
            prefixb[g] = local[i];
        }
    }
}
