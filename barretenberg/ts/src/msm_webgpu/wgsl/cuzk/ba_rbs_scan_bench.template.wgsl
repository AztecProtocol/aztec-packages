// Register-blocked work-efficient parallel prefix-product scan over
// dx = x2-x1 (ISOLATED MICROBENCH variant: writes the global per-pair
// inclusive prefix so pure-scan throughput is observable). Workgroup of
// TPB threads; each thread owns R consecutive pairs (block = TPB*R
// pairs).
//
//   Phase 1 (no barriers): thread t streams its R dx products into a
//     private array local[0..R-1] (inclusive within-thread prefixes);
//     threadTotal = local[R-1].
//   Phase 2 (FIX B): one barrier, then THREAD 0 ALONE walks the TPB
//     shared thread-totals once, writing the exclusive prefix into
//     shPre[t] and exclusive suffix into shSuf[t] and blockTotal into
//     shBlk[0] (~2*TPB montmuls by a single thread, amortised over
//     TPB*R pairs — far cheaper than a log2(TPB) barriered Hillis-
//     Steele). One barrier after.
//   Phase 3 (no barriers): global inclusive prefix
//     prefixb[g] = shPre[t] * local[i]. Per-thread totals exposed for
//     the pipeline are NOT written here (this is the microbench).
//
// bindings: 0 inp (AoS 4 BigInt/pair, read), 1 prefixb (1/pair, rw),
// 2 blocktot (1/block, rw), 3 params=(n_pairs,_,_,_), 4 thtot
// (1/thread = pairs/R, rw — written for layout parity, unused here).

const TPB: u32 = {{ workgroup_size }}u;
const RBLK: u32 = {{ rblk }}u;

@group(0) @binding(0) var<storage, read>       inp:      array<BigInt>;
@group(0) @binding(1) var<storage, read_write> prefixb:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> blocktot: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;
@group(0) @binding(4) var<storage, read_write> thtot:    array<BigInt>;

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

    // Phase 1: private inclusive within-thread prefix products.
    var local: array<BigInt, {{ rblk }}>;
    var acc: BigInt;
    for (var i = 0u; i < RBLK; i = i + 1u) {
        let g = thread_base + i;
        var dx: BigInt;
        if (g < n) {
            dx = load_dx(g);
        } else {
            dx = get_r();
        }
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
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

    var block_offset = shPre[tid];

    // Phase 3: global inclusive prefix.
    for (var i = 0u; i < RBLK; i = i + 1u) {
        let g = thread_base + i;
        if (g < n) {
            var li = local[i];
            prefixb[g] = montgomery_product(&block_offset, &li);
        }
    }
}
