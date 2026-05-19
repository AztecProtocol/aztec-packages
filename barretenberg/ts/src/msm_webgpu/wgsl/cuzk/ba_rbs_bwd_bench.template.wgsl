// Register-blocked batch-affine, backward kernel: per-thread segment-
// inverse construction (FIX A) + fully-local backward peel + lean
// affine formula. Each thread owns the same R = RBLK pairs as the
// forward kernel.
//
// FIX A — the thread first builds the inverse of its OWN R-block dx
// product across the WHOLE grid from three pieces written by K1/K2:
//
//   segInv_t = blkseed[b] * thpre[b,t] * thsuf[b,t]
//
//   blkseed[b] = grandInv * Π_{c!=b} blocktot[c]                (K2)
//   thpre[b,t] = Π_{u<t} threadTotal_{b,u}                       (K1)
//   thsuf[b,t] = Π_{u>t} threadTotal_{b,u}                       (K1)
//
//   ⇒ segInv_t = grandInv
//                * (Π_{c!=b} blocktot[c])           [every other block]
//                * (Π_{u!=t} threadTotal_{b,u})     [every other thread]
//              = grandInv * (grand / threadTotal_{b,t})
//              = 1 / threadTotal_{b,t}.
//
// Then the fully-local backward peel (no cross-thread/block dep).
// iter3: the within-thread EXCLUSIVE prefix is NOT recomputed — K1
// already wrote each within-thread INCLUSIVE prefix to prefixb, and
// the exclusive prefix at pair i is exactly the inclusive prefix of
// the PREVIOUS pair in the SAME thread:
//
//   excl_i = Π_{j<i within thread} dx_j
//          = prefixb[g-1]   when i>0   (g-1 is pair i-1, same thread,
//                                       since pairs t*R+i are contiguous)
//          = get_r()        when i==0  (empty product = Montgomery 1)
//   inv     = segInv_t = 1 / Π_{0<=j<R} dx_j
//   inv_dx_i = inv * excl_i
//   lambda   = (y2-y1)*inv_dx ; x3 = lambda^2 - x1 - x2 ;
//   y3       = lambda*(x1-x3) - y1
//   inv     *= dx_i           (dx_i = q_x - p_x, recomputed from the
//                              already-loaded inputs: 1 fr_sub, free —
//                              NOT a montmul; advance to next-lower i)
//
// Induction (i = R-1 .. 0): the invariant on entry to step i is
// inv = 1 / Π_{0<=j<=i} dx_j. Then inv_dx_i = inv * Π_{j<i} dx_j
// = 1/dx_i. After inv *= dx_i, inv = 1 / Π_{0<=j<=i-1} dx_j, which
// is the invariant for step i-1. Base i=R-1 holds because
// segInv_t = 1/Π_{0<=j<R} dx_j. Hence inv_dx_i = 1/dx_i for all i.
// NO inversion code in this kernel ⇒ small footprint ⇒ max occupancy.
//
// bindings: 0 inp (AoS 4/pair, read), 1 thpre (1/thread, read),
// 2 outp (2/pair, rw), 3 params=(n_pairs,_,_,_), 4 thsuf (1/thread,
// read), 5 blkseed (1/block, read), 6 prefixb (1/pair, read).

const TPB: u32 = {{ workgroup_size }}u;
const RBLK: u32 = {{ rblk }}u;

@group(0) @binding(0) var<storage, read>       inp:     array<BigInt>;
@group(0) @binding(1) var<storage, read>       thpre:   array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outp:    array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;
@group(0) @binding(4) var<storage, read>       thsuf:   array<BigInt>;
@group(0) @binding(5) var<storage, read>       blkseed: array<BigInt>;
@group(0) @binding(6) var<storage, read>       prefixb: array<BigInt>;

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
    let tid = lid.x;
    let n = params.x;
    let block_base = wid.x * TPB * RBLK;
    let thread_base = block_base + tid * RBLK;
    let tg = wid.x * TPB + tid;

    // FIX A: segInv_t = blkseed[b] * thpre[b,t] * thsuf[b,t] = 1/threadTotal.
    var seg = blkseed[wid.x];
    var tp = thpre[tg];
    seg = montgomery_product(&seg, &tp);
    var ts = thsuf[tg];
    seg = montgomery_product(&seg, &ts);

    // iter3: NO within-thread scan recompute. The backward peel reads
    // the exclusive within-thread prefix straight from prefixb (1
    // global BigInt read/pair instead of R Montgomery multiplies).
    var inv = seg;

    for (var jj = 0u; jj < RBLK; jj = jj + 1u) {
        let i = RBLK - 1u - jj;
        let g = thread_base + i;
        if (g >= n) {
            continue;
        }
        let pb = g * 4u;
        var p_x = inp[pb + 0u];
        var p_y = inp[pb + 1u];
        var q_x = inp[pb + 2u];
        var q_y = inp[pb + 3u];

        // Exclusive within-thread prefix at i: inclusive prefix of the
        // previous pair (same thread, contiguous index g-1) for i>0,
        // else the empty-product identity get_r(). prefixb[g-1] is
        // safe to read for i>=1 because g-1 = block_base + tid*RBLK +
        // (i-1) stays within this same thread's pair range.
        var ex: BigInt;
        if (i == 0u) {
            ex = get_r();
        } else {
            ex = prefixb[g - 1u];
        }
        var inv_dx = montgomery_product(&inv, &ex);

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

        var dx = fr_sub(&q_x, &p_x);
        inv = montgomery_product(&inv, &dx);
    }
}
