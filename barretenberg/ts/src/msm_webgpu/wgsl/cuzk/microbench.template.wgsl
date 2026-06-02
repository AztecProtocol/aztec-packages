// Isolated montmul / inverse microbench kernel. Each of `nthreads` threads runs
// a DEPENDENT chain of `chain_k` montgomery_products (op=mul) or field inverses
// (op=inv) on operands loaded directly into the working num_words x word_size
// BigInt rep. Many threads => per-thread register pressure / occupancy is the
// bottleneck (as in the real MSM) — isolating the 15-bit-vs-13-bit effect.
//
// MINIMAL + self-contained (mirrors dev/montmul_bench.ts): for op=mul the module
// is ONLY structs+bigint+field+montmul; the safegcd partials are pulled in solely
// for op=inv. Operands load straight into BigInt limbs (no field8 / 8x32 detour),
// 2 storage bindings, K + nthreads baked in — keeps the shader small enough to
// build on Mali. The chain is dependent + stored, so it can't be optimized away.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{#is_inv}}
// Montgomery one (R mod p) — normally provided by field8; defined here from
// r_limbs since this microbench omits the 8x32 field8 layer.
fn get_r() -> BigInt { var r: BigInt;
{{{ r_limbs }}}
    return r; }
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}
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
        r = {{ inv_fn }}(r);
{{/is_inv}}
    }
    let ob: u32 = v * {{ num_words }}u;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) { outbuf[ob + i] = r.limbs[i]; }
}
