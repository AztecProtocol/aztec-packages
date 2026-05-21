{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// === Lever 2: 8x u32 live field representation ===
// Field elements live in the kernel as `array<u32, 8>` — the canonical
// 256-bit packed form, which is ALSO the storage form. So loads/stores
// are plain 8-word copies (no unpack/pack), and the affine add's live
// values cost 8 registers each instead of the 20x13-limb form's 20.
// Only the multiply needs 13-bit limbs: montgomery_product_f8 expands
// its operands to the 20x13 BigInt form, multiplies, contracts back.
// fr_add / fr_sub run natively on 8x u32.

// p as eight 32-bit words, for the native fr_add_f8 / fr_sub_f8.
{{#p8_consts}}
const P8_{{idx}}: u32 = {{val}}u;
{{/p8_consts}}

// montgomery_product on the 8x u32 form: expand both operands to the
// 20x13-limb arithmetic form, run the grouped Karatsuba multiply,
// contract the result back to 8x u32.
fn montgomery_product_f8(x: array<u32, 8>, y: array<u32, 8>) -> array<u32, 8> {
    var x20: BigInt = unpack256_to_limbs(x);
    var y20: BigInt = unpack256_to_limbs(y);
    var r: BigInt = montgomery_product(&x20, &y20);
    return pack_limbs_to_256(&r);
}

{{#addsub_unpack}}
// fr_add / fr_sub via expand -> 20x13 op -> contract. The A/B alternative
// to the native path; selected by `addsub=unpack`.
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var a20: BigInt = unpack256_to_limbs(a);
    var b20: BigInt = unpack256_to_limbs(b);
    var r: BigInt = fr_add(&a20, &b20);
    return pack_limbs_to_256(&r);
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var a20: BigInt = unpack256_to_limbs(a);
    var b20: BigInt = unpack256_to_limbs(b);
    var r: BigInt = fr_sub(&a20, &b20);
    return pack_limbs_to_256(&r);
}
{{/addsub_unpack}}
{{^addsub_unpack}}
// Native 8x u32 fr_add / fr_sub — 8-word modular add / sub. WGSL has no
// add-with-carry, so the carry out of each word is `u32(sum < operand)`
// (one compare, no branch). a, b are canonical in [0, p).
fn fr_add_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var s: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let lo: u32 = a[{{i}}] + b[{{i}}];
        let v: u32 = lo + carry;
        s[{{i}}] = v;
        carry = select(0u, 1u, lo < a[{{i}}]) + select(0u, 1u, v < lo);
    }
{{/f8_words}}
    // s = a + b in [0, 2p); subtract p iff s >= p — the s - p borrow
    // chain underflows exactly when s < p.
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = s[{{i}}] - P8_{{i}};
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = select(0u, 1u, s[{{i}}] < P8_{{i}}) + select(0u, 1u, t1 < borrow);
    }
{{/f8_words}}
    var out: array<u32, 8>;
{{#f8_words}}
    out[{{i}}] = select(d[{{i}}], s[{{i}}], borrow != 0u);
{{/f8_words}}
    return out;
}

fn fr_sub_f8(a: array<u32, 8>, b: array<u32, 8>) -> array<u32, 8> {
    var d: array<u32, 8>;
    var borrow: u32 = 0u;
{{#f8_words}}
    {
        let t1: u32 = a[{{i}}] - b[{{i}}];
        let v: u32 = t1 - borrow;
        d[{{i}}] = v;
        borrow = select(0u, 1u, a[{{i}}] < b[{{i}}]) + select(0u, 1u, t1 < borrow);
    }
{{/f8_words}}
    // d = a - b; on borrow (a < b) the canonical result is d + p, with the
    // 2^256 wrap discarded (a - b + p lands in (0, p)).
    var out: array<u32, 8>;
    var carry: u32 = 0u;
{{#f8_words}}
    {
        let pw: u32 = select(0u, P8_{{i}}, borrow != 0u);
        let lo: u32 = d[{{i}}] + pw;
        let v: u32 = lo + carry;
        out[{{i}}] = v;
        carry = select(0u, 1u, lo < d[{{i}}]) + select(0u, 1u, v < lo);
    }
{{/f8_words}}
    return out;
}
{{/addsub_unpack}}

// Fused super-kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// Combines marshal + disjoint + scatter into one kernel. Each thread t
// handles one chunk of S pairs:
//   1. Read 2*S source indices from chunk_plan (idx_l, idx_r per slot).
//   2. Read S destination indices from scatter_plan.
//   3. Load S pair-x values from active_sums_old, compute S dx values
//      and forward prefix product.
//   4. Single field inversion on the prefix product.
//   5. Inverse pass: per slot k from S-1 down to 0, derive
//      inv_dx[k] = 1/dx_k from the running inverse and write it back to
//      pref_scratch. The running inverse is loop-carried only here.
//   6. Backward peel: per slot k, read inv_dx[k]:
//        - load .x and .y for both operands
//        - lean affine add -> R_x, R_y
//        - write directly to active_sums_new at scatter_plan[t*S + k]
//
// Field elements are 8x u32 throughout (Lever 2); see the header above.
//
// PARAMS:
//   params.x = T_chunks  (active threads, one per chunk)
//   params.y = M_old     (active_sums_old vec4-stride length)
//   params.z = M_new     (active_sums_new vec4-stride length)
//
// Layout (both active_sums buffers): 2 planes (P.x, P.y), PG=2 vec4 per
// element. plane_p flat vec4 base = p * PG * M, element e at offset
// PG * e.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       chunk_plan:      array<u32>;
@group(0) @binding(1) var<storage, read>       scatter_plan:    array<u32>;
{{#l0_index_mode}}
// Lever B: at level 0 active_sums_old is a flat (point index | sign<<31)
// array; the operand points are gathered from the pool (point_x/point_y).
@group(0) @binding(2) var<storage, read>       active_sums_old: array<u32>;
{{/l0_index_mode}}
{{^l0_index_mode}}
@group(0) @binding(2) var<storage, read>       active_sums_old: array<vec4<u32>>;
{{/l0_index_mode}}
@group(0) @binding(3) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:          vec4<u32>;
@group(0) @binding(5) var<storage, read_write> pref_scratch:    array<vec4<u32>>;
{{#l0_index_mode}}
@group(0) @binding(6) var<storage, read>       point_x:         array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       point_y:         array<vec4<u32>>;
{{/l0_index_mode}}

{{#l0_index_mode}}
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;

// Level-0 operand load: active_sums_old[idx] is (point index | sign<<31);
// gather the coordinate from the pool. `M` is unused here.
fn load_active_x(idx: u32, M: u32) -> array<u32, 8> {
    let pt = active_sums_old[idx] & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_active_y(idx: u32, M: u32) -> array<u32, 8> {
    let packed = active_sums_old[idx];
    let pt = packed & L0_IDX_MASK;
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y: array<u32, 8> = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) {
        return y;
    }
    // Lever D: negate y on the fly (-y = 0 - y mod p) — the level-0 point
    // pool carries no precomputed -y plane.
    let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}
{{/l0_index_mode}}
{{^l0_index_mode}}
fn load_active_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = 0u * PG * M + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_active_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = 1u * PG * M + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
{{/l0_index_mode}}

fn store_active_new(plane: u32, idx: u32, M: u32, val: array<u32, 8>) {
    let base = plane * PG * M + PG * idx;
    active_sums_new[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    active_sums_new[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

// R mod p (Montgomery one), the montgomery_product identity used to seed
// the forward prefix product.
fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r8_csv }});
}

// get_r in the 20x13-limb form. Only `fr_pow` references it — a dead-code
// path in this kernel (fr_pow_funcs is pulled in for get_r_cubed, which
// the pk inverse needs). Derived from the get_r_f8 constant, so it is
// itself compile-time constant — no per-thread `var` materialisation.
fn get_r() -> BigInt {
    return unpack256_to_limbs(get_r_f8());
}

// pref_scratch holds the forward prefix products (then the per-slot
// inverses), 8x u32 = two vec4 per entry. Thread-major — global slot =
// t*S + k — so each thread's S entries are contiguous and stay
// cache-resident across the forward/backward gap.
fn store_pref(slot: u32, val: array<u32, 8>) {
    let base = 2u * slot;
    pref_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(slot: u32) -> array<u32, 8> {
    let base = 2u * slot;
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_old = params.y;
    let M_new = params.z;
    let t = gid.x{{#tiled}} + params.w{{/tiled}};
    if (t >= T) { return; }

    // pref_scratch index. Lever A (tiled) sizes pref_scratch to a single
    // tile of T_TILE threads, so it is indexed by the tile-local thread id
    // (gid.x); params.w carries the tile's global base. Untiled callers
    // pass params.w = 0 and pref_scratch spans all T threads.
{{#tiled}}
    let pref_base = gid.x * S;
{{/tiled}}
{{^tiled}}
    let pref_base = t * S;
{{/tiled}}

    let chunk_base = 2u * S * t;

    // Forward: compute S dx values and accumulate the prefix product.
    var acc: array<u32, 8> = get_r_f8();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
        let idx_r = chunk_plan[chunk_base + 2u * k + 1u];
        let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
        let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
        let dx: array<u32, 8> = fr_sub_f8(p_rx, p_lx);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product_f8(acc, dx);
        }
        store_pref(pref_base + k, acc);
    }

    // Single inversion per chunk. The safegcd inverse is 20x13-limb; the
    // accumulate is 8x u32, so expand on the way in and contract the
    // result — one conversion pair per chunk.
    var acc20: BigInt = unpack256_to_limbs(acc);
    var inv20: BigInt = {{ inv_fn }}(acc20);
    var inv: array<u32, 8> = pack_limbs_to_256(&inv20);

    // Inverse pass: walk k descending, derive inv_dx[k] = 1/dx_k from the
    // running inverse + the stored forward prefix products, and write it
    // back into pref_scratch slot k. The running `inv` is loop-carried
    // only in this multiply-only loop, so it is NOT live across the
    // affine-add peel below. store_pref(k) is safe: a later (smaller-k)
    // iteration only reads slots < k, an earlier one only wrote slots > k.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        var inv_dx: array<u32, 8>;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            let pp: array<u32, 8> = load_pref(pref_base + (k - 1u));
            inv_dx = montgomery_product_f8(inv, pp);
            // Advance the running inverse by dx_k for the next iteration;
            // dx_k is recomputed from the slot's x-coordinates.
            let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
            let idx_r = chunk_plan[chunk_base + 2u * k + 1u];
            let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
            let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
            let dx_back: array<u32, 8> = fr_sub_f8(p_rx, p_lx);
            inv = montgomery_product_f8(inv, dx_back);
        }
        store_pref(pref_base + k, inv_dx);
    }

    // Backward peel: emit S pair sums, scatter to active_sums_new. Reads
    // the per-slot inverse inv_dx[k] from pref_scratch — no running
    // inverse is live across the affine add. Each coordinate is loaded
    // just before first use to minimise the simultaneously-live set.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
        let idx_r = chunk_plan[chunk_base + 2u * k + 1u];

        let inv_dx: array<u32, 8> = load_pref(pref_base + k);

        // lambda = (p_ry - p_ly) / dx_k.
        let p_ly: array<u32, 8> = load_active_y(idx_l, M_old);
        let p_ry: array<u32, 8> = load_active_y(idx_r, M_old);
        var lambda: array<u32, 8> = fr_sub_f8(p_ry, p_ly);
        lambda = montgomery_product_f8(lambda, inv_dx);

        // r_x = lambda^2 - p_lx - p_rx.
        let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
        let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
        var r_x: array<u32, 8> = montgomery_product_f8(lambda, lambda);
        let x_sum: array<u32, 8> = fr_add_f8(p_lx, p_rx);
        r_x = fr_sub_f8(r_x, x_sum);

        // r_y = lambda * (p_lx - r_x) - p_ly.
        var r_y: array<u32, 8> = fr_sub_f8(p_lx, r_x);
        r_y = montgomery_product_f8(lambda, r_y);
        r_y = fr_sub_f8(r_y, p_ly);

        let dst_idx = scatter_plan[t * S + k];
        store_active_new(0u, dst_idx, M_new, r_x);
        store_active_new(1u, dst_idx, M_new, r_y);
    }

    {{{ recompile }}}
}
