{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
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
    var x: BigInt = unpack256_to_limbs(a);
    var i: BigInt = {{ inv_fn }}(x);
    return pack_limbs_to_256(&i);
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

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    if (lid.x != 0u) { return; }            // v0: one thread per window
    let w = wgid.x;
    let M = cparams.x;
    let mrow = reduce_meta[w];
    let base = mrow.x;
    let B = mrow.y;
    if (B == 0u) { return; }

    var running = Pt(get_r_f8(), get_r_f8(), 0u);
    var acc = Pt(get_r_f8(), get_r_f8(), 0u);
    var prev = B;                            // rel just above the top of the window

    // Descending over magnitudes; rel = mag-1, weight applied via the gap.
    for (var t: u32 = 0u; t < B; t = t + 1u) {
        let rel = B - 1u - t;
        if (is_present[base + rel] != 0u) {
            let v = load_pt(base + rel, M);
            // running covers rel' in (rel, prev); contributes running·(prev-rel).
            acc = pt_add(acc, pt_scalar(running, prev - rel));
            running = pt_add(running, v);
            prev = rel;
        }
    }
    // Tail: running (= Σ all V) covers rel' in [0, prev], i.e. weight prev+1.
    acc = pt_add(acc, pt_scalar(running, prev + 1u));

    // Window sum lands at slot `base` (slot 0 = mag 1), where the gather reads it.
    if (acc.present != 0u) {
        store_pt(base, M, acc);
    }

    {{{ recompile }}}
}
