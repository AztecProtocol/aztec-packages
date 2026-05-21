{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// De-Montgomery the input scalars.
//
// The prover hands field elements over in Montgomery form (s * R mod p).
// The carry-free Booth decompose bit-slices the raw integer, so the
// scalars are first reduced out of Montgomery form: one Montgomery
// multiply by the integer 1 — montgomery_product(s*R, 1) = s. One thread
// per scalar. Scalars are 8 u32 little-endian; R is the bench's montmul R
// (the same R the host uses to Montgomery-ize points and scalars).

@group(0) @binding(0) var<storage, read>       scalars_mont: array<u32>;
@group(0) @binding(1) var<storage, read_write> scalars_raw:  array<u32>;
@group(0) @binding(2) var<uniform>             params:       vec4<u32>;
// params.x = scalar count

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let i = gid.x;
    if (i >= params.x) {
        return;
    }
    let base = i * 8u;

    var w: array<u32, 8>;
    for (var k = 0u; k < 8u; k = k + 1u) {
        w[k] = scalars_mont[base + k];
    }
    var s: BigInt = unpack256_to_limbs(w);

    // The integer 1, as a BigInt. montgomery_product(s*R, 1) = s.
    var onew: array<u32, 8>;
    onew[0] = 1u;
    var one: BigInt = unpack256_to_limbs(onew);

    var raw: BigInt = montgomery_product(&s, &one);
    let outw = pack_limbs_to_256(&raw);
    for (var k = 0u; k < 8u; k = k + 1u) {
        scalars_raw[base + k] = outw[k];
    }

    {{{ recompile }}}
}
