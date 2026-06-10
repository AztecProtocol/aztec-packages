{{> structs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Sparse bucket reduction — v0 (correctness reference). SPARSE_REDUCE_PLAN.md.
//
// One thread per window. Walks the window's magnitudes DESCENDING, skipping
// empty buckets (is_present==0), and computes S_w = Σ_mag mag·bucket[mag] via
// the gap-aware suffix sum:
//   running += bucket[mag];  acc += running·(gap to next lower active)
// plus a tail flush. Empty runs collapse into the integer gap, so the cost is
// O(active) not O(B) — but v0 leaves the inversions UN-batched (one per affine
// op), so it is only fast at small n. It exists to validate the gap-aware math
// is byte-identical to the dense tree; v1 replaces the inner loop with the
// walker's S-slot batched inversion for production speed.
//
// Magnitude `mag` (1..B) lives at red_buf slot base+(mag-1); slot j holds
// magnitude j+1. S_w = Σ_{j=0}^{B-1} (j+1)·V[j].

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
// is_present is read-only here, but bound read_write to match the dense reduce:
// it shares an arena buffer with red_buf, and Dawn forbids the same buffer being
// bound read_write (red_buf) and read-only (is_present) in one compute pass.
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<uniform>             cparams:      vec4<u32>;
@group(0) @binding(3) var<storage, read>       reduce_meta:  array<vec4<u32>>;
// cparams = (M (red_buf element stride), _, _, _).
// reduce_meta[w] = (base = reduce_off, B = num_buckets, _, _).

struct Pt { x: array<u32, 8>, y: array<u32, 8>, present: u32 }

fn load_pt(idx: u32, M: u32) -> Pt {
    let bx = PG * idx;
    let by = PG * M + PG * idx;
    let qx0 = red_buf[bx + 0u]; let qx1 = red_buf[bx + 1u];
    let qy0 = red_buf[by + 0u]; let qy1 = red_buf[by + 1u];
    return Pt(array<u32, 8>(qx0.x, qx0.y, qx0.z, qx0.w, qx1.x, qx1.y, qx1.z, qx1.w),
              array<u32, 8>(qy0.x, qy0.y, qy0.z, qy0.w, qy1.x, qy1.y, qy1.z, qy1.w),
              1u);
}
fn store_pt(idx: u32, M: u32, p: Pt) {
    let bx = PG * idx;
    let by = PG * M + PG * idx;
    red_buf[bx + 0u] = vec4<u32>(p.x[0], p.x[1], p.x[2], p.x[3]);
    red_buf[bx + 1u] = vec4<u32>(p.x[4], p.x[5], p.x[6], p.x[7]);
    red_buf[by + 0u] = vec4<u32>(p.y[0], p.y[1], p.y[2], p.y[3]);
    red_buf[by + 1u] = vec4<u32>(p.y[4], p.y[5], p.y[6], p.y[7]);
}

fn finv(a: array<u32, 8>) -> array<u32, 8> {
    return {{ inv_fn }}(a);
}

// Affine add: a + b, distinct x assumed (no point collisions). Both present.
fn aff_add(a: Pt, b: Pt) -> Pt {
    let dx = fr_sub_f8(b.x, a.x);
    let dy = fr_sub_f8(b.y, a.y);
    let lambda = montgomery_product_f8(dy, finv(dx));
    var rx = montgomery_product_f8(lambda, lambda);
    rx = fr_sub_f8(rx, a.x);
    rx = fr_sub_f8(rx, b.x);
    var ry = fr_sub_f8(a.x, rx);
    ry = montgomery_product_f8(lambda, ry);
    ry = fr_sub_f8(ry, a.y);
    return Pt(rx, ry, 1u);
}

// Affine double: 2a.
fn aff_dbl(a: Pt) -> Pt {
    let x2 = montgomery_product_f8(a.x, a.x);
    var num = fr_add_f8(x2, x2);
    num = fr_add_f8(num, x2);            // 3x^2
    let den = fr_add_f8(a.y, a.y);       // 2y
    let lambda = montgomery_product_f8(num, finv(den));
    let two_x = fr_add_f8(a.x, a.x);
    var rx = montgomery_product_f8(lambda, lambda);
    rx = fr_sub_f8(rx, two_x);
    var ry = fr_sub_f8(a.x, rx);
    ry = montgomery_product_f8(lambda, ry);
    ry = fr_sub_f8(ry, a.y);
    return Pt(rx, ry, 1u);
}

fn pt_add(acc: Pt, p: Pt) -> Pt {
    if (p.present == 0u) { return acc; }
    if (acc.present == 0u) { return p; }
    return aff_add(acc, p);
}

// k·P by double-and-add (k a small magnitude, < 2^31). present-aware.
fn pt_scalar(p: Pt, k: u32) -> Pt {
    var result = Pt(p.x, p.y, 0u);
    if (p.present == 0u || k == 0u) { return Pt(p.x, p.y, 0u); }
    var base = p;
    var kk = k;
    loop {
        if ((kk & 1u) == 1u) { result = pt_add(result, base); }
        kk = kk >> 1u;
        if (kk == 0u) { break; }
        base = aff_dbl(base);
    }
    return result;
}

const WG: u32 = {{ workgroup_size }}u;

// Per-slot combine partials. Each slot's contribution = alg_s + lo_s·seg_sum_s.
var<workgroup> sh_x: array<array<u32, 8>, WG>;
var<workgroup> sh_y: array<array<u32, 8>, WG>;
var<workgroup> sh_p: array<u32, WG>;

// v1: one workgroup per window, WG slots. Slot `tid` owns the contiguous
// bucket-segment [lo, hi) of this window's B magnitudes; lo = tid*seg. Each slot
// runs the gap-aware suffix sum over ITS segment (skipping empties), yielding the
// segment-local mag-weighted sum alg_s (magnitudes 1..seg within the segment) and
// seg_sum_s = Σ active V. Then  S_w = Σ_s (alg_s + lo_s·seg_sum_s)  — no
// cross-segment carry; each segment weights by its own absolute magnitude via the
// lo_s shift. A workgroup tree-sum combines the per-slot contributions. Inversions
// are still per-op (v1 is the parallel-but-un-batched stage); the win over the
// dense tree is skipping the empty buckets in each segment.
@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let tid = lid.x;
    let M = cparams.x;
    let mrow = reduce_meta[w];
    let base = mrow.x;
    let B = mrow.y;

    let seg = (B + WG - 1u) / WG;
    let lo = tid * seg;
    var hi = lo + seg;
    if (hi > B) { hi = B; }

    var contrib = Pt(get_r_f8(), get_r_f8(), 0u);
    if (lo < hi) {
        // Gap-aware over [lo, hi), magnitudes relative to lo (rel' = rel - lo,
        // local mag = rel'+1). prev tracks the previous active rel' for the gap.
        var running = Pt(get_r_f8(), get_r_f8(), 0u);
        var alg = Pt(get_r_f8(), get_r_f8(), 0u);
        let span = hi - lo;                  // segment width
        var prev = span;
        for (var t: u32 = 0u; t < span; t = t + 1u) {
            let relp = span - 1u - t;        // local rel descending
            let rel = lo + relp;
            if (is_present[base + rel] != 0u) {
                let v = load_pt(base + rel, M);
                alg = pt_add(alg, pt_scalar(running, prev - relp));
                running = pt_add(running, v);
                prev = relp;
            }
        }
        alg = pt_add(alg, pt_scalar(running, prev + 1u)); // tail, local weight
        // contrib = alg + lo·seg_sum (seg_sum = running). lo·seg_sum lifts the
        // segment-local magnitudes to absolute magnitudes.
        contrib = pt_add(alg, pt_scalar(running, lo));
    }

    // Workgroup tree-sum of contrib over all slots → S_w.
    sh_x[tid] = contrib.x; sh_y[tid] = contrib.y; sh_p[tid] = contrib.present;
    workgroupBarrier();
    var stride = WG >> 1u;
    loop {
        if (stride == 0u) { break; }
        if (tid < stride) {
            let a = Pt(sh_x[tid], sh_y[tid], sh_p[tid]);
            let b = Pt(sh_x[tid + stride], sh_y[tid + stride], sh_p[tid + stride]);
            let s = pt_add(a, b);
            sh_x[tid] = s.x; sh_y[tid] = s.y; sh_p[tid] = s.present;
        }
        workgroupBarrier();
        stride = stride >> 1u;
    }
    if (tid == 0u && sh_p[0] != 0u) {
        store_pt(base, M, Pt(sh_x[0], sh_y[0], sh_p[0]));
    }

    {{{ recompile }}}
}
