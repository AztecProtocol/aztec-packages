// Phase-0 test kernel for the BN254 scalar-field (F_r) Montgomery suite.
//
// Validates the Fr primitives in isolation before they back the sumcheck
// fold / relation-accumulate kernels. Field elements live in the
// memory-aware 8x u32 packed form (256-bit canonical, Montgomery domain):
// 8 registers per live value vs 20 for the 20x13 arithmetic form. fr_add /
// fr_sub / fr_neg run natively on 8x u32; the multiply expands to 20x13
// only inside montgomery_product_f8; fr_inv unpacks once, runs the safegcd
// inverse on the 20x13 form, and packs the result back.
//
// One thread per element. Five entry points share one binding layout so the
// host can dispatch any single op against the same buffers. Each entry point
// references only the bindings and helpers it needs, so its register
// footprint is the real per-op footprint — no dead sibling-op code is pulled
// into a given kernel.

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{{ dec_unpack }}}
{{{ dec_pack }}}
{{> field_funcs }}
{{> field8_funcs }}
{{> fr_pow_funcs }}

struct Params {
  n: u32,
}

@group(0) @binding(0) var<storage, read> a_in: array<u32>;
@group(0) @binding(1) var<storage, read> b_in: array<u32>;
@group(0) @binding(2) var<storage, read_write> out_buf: array<u32>;
@group(0) @binding(3) var<uniform> params: Params;

fn load_a(i: u32) -> array<u32, 8> {
    let base = i * 8u;
    var v: array<u32, 8>;
{{#f8_words}}
    v[{{i}}] = a_in[base + {{i}}u];
{{/f8_words}}
    return v;
}

fn load_b(i: u32) -> array<u32, 8> {
    let base = i * 8u;
    var v: array<u32, 8>;
{{#f8_words}}
    v[{{i}}] = b_in[base + {{i}}u];
{{/f8_words}}
    return v;
}

fn store_out(i: u32, v: array<u32, 8>) {
    let base = i * 8u;
{{#f8_words}}
    out_buf[base + {{i}}u] = v[{{i}}];
{{/f8_words}}
}

// out = a + b (mod r). Native 8x u32 add; representation-agnostic, so it
// also folds Montgomery-form inputs to a Montgomery-form result.
@compute @workgroup_size({{ workgroup_size }})
fn fr_add_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    store_out(i, fr_add_f8(load_a(i), load_b(i)));
}

// out = a - b (mod r).
@compute @workgroup_size({{ workgroup_size }})
fn fr_sub_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    store_out(i, fr_sub_f8(load_a(i), load_b(i)));
}

// out = a * b (mod r). Montgomery product: Mont(a)*Mont(b) -> Mont(a*b).
@compute @workgroup_size({{ workgroup_size }})
fn fr_mul_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    store_out(i, montgomery_product_f8(load_a(i), load_b(i)));
}

// out = -a (mod r), computed as 0 - a. Zero is the canonical 0 in both the
// integer and Montgomery domains, so the result is Mont(-a).
@compute @workgroup_size({{ workgroup_size }})
fn fr_neg_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    var zero: array<u32, 8>;
    store_out(i, fr_sub_f8(zero, load_a(i)));
}

// out = a^{-1} (mod r). Mont(a) -> Mont(a^{-1}) via safegcd. Expands to the
// 20x13 form once, inverts, packs back to 8x u32. a == 0 yields 0.
@compute @workgroup_size({{ workgroup_size }})
fn fr_inv_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.n) { return; }
    var a20: BigInt = unpack256_to_limbs(load_a(i));
    var inv: BigInt = fr_inv(a20);
    store_out(i, pack_limbs_to_256(&inv));
}
