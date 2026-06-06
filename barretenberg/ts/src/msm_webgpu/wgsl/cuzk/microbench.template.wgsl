// Isolated montmul / inverse microbench kernel. Each of `nthreads` threads runs
// a DEPENDENT chain of `chain_k` montgomery_products (op=mul) or field inverses
// (op=inv) on operands loaded directly into the working num_words x word_size
// BigInt rep. Many threads => per-thread register pressure / occupancy is the
// bottleneck (as in the real MSM) — isolating one field op under a counter
// capture, independent of MSM geometry.
//
// MINIMAL + self-contained, sized per path so it builds on Mali:
//   op=mul       : structs + bigint + field + montmul (the BigInt body — karat or
//                  cios_unrolled/cios_native share the same montgomery_product).
//   op=inv pk14  : structs + bigint + pack/unpack glue + the self-contained
//                  packed-14-bit safegcd inverse (fr_inv_by_loop_pk, f8 in/out).
//   op=inv loop  : structs + bigint + field + montmul + the BigInt safegcd loop
//                  inverse (needs get_r_cubed / get_p / montgomery_product).
// The chain is dependent + stored, so it can't be optimized away.

// structs (BigInt) is self-contained. bigint_funcs / field_funcs / the montmul
// scaffold reference WGSL consts (NUM_WORDS, WORD_SIZE, MASK, …) that ONLY the
// montmul scaffold defines, so they travel together — included only by the mul
// and loop-inverse paths. The pk14 path needs none of them.
{{> structs }}

{{#is_mul}}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{/is_mul}}

{{#is_inv}}
{{#inv_f8}}
// Packed-14-bit safegcd inverse: f8 (array<u32,8>) in/out, register-resident,
// e0=R^2 seed ⇒ output already in Montgomery form. Self-contained except the
// BigInt<->8x u32 pack/unpack glue injected here (these are fully unrolled, so
// they need no NUM_WORDS const) — keeps the pk14 module minimal for Mali.
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> inverse_funcs }}
{{/inv_f8}}
{{^inv_f8}}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
// Montgomery one (R mod p) — the BigInt loop inverse reads it (and get_r_cubed
// from fr_pow). Defined here from r_limbs since this microbench omits field8.
fn get_r() -> BigInt { var r: BigInt;
{{{ r_limbs }}}
    return r; }
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}
{{/inv_f8}}
{{/is_inv}}

@group(0) @binding(0) var<storage, read>       inbuf:  array<u32>;   // per thread: a[NW] ++ b[NW]
@group(0) @binding(1) var<storage, read_write> outbuf: array<u32>;   // per thread: r[NW]

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let v: u32 = gid.x;
    if (v >= {{ nthreads }}u) { return; }
    let ib: u32 = v * {{ in_stride }}u;
    var a: BigInt;
    var b: BigInt;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        a.limbs[i] = inbuf[ib + i];
        b.limbs[i] = inbuf[ib + {{ num_words }}u + i];
    }
    var r: BigInt = a;
    for (var k: u32 = 0u; k < {{ chain_k }}u; k = k + 1u) {
{{#is_mul}}
        r = montgomery_product(&r, &b);
{{/is_mul}}
{{#is_inv}}
{{#inv_f8}}
        r = unpack256_to_limbs({{ inv_fn }}(pack_limbs_to_256(&r)));
{{/inv_f8}}
{{^inv_f8}}
        r = {{ inv_fn }}(r);
{{/inv_f8}}
{{/is_inv}}
    }
    let ob: u32 = v * {{ num_words }}u;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) { outbuf[ob + i] = r.limbs[i]; }
}
