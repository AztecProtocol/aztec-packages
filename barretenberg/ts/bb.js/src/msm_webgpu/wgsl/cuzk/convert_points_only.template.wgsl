// Point-only variant of `convert_point_coords_and_decompose_scalars`.
// Reads raw affine (x, y) pairs from two packed u32 buffers and writes
// Montgomery-form (x·R mod q, y·R mod q) BigInts.
//
// Purpose. When the caller holds a persistent GPU context and the base
// points are SRS-backed (i.e. stable across many MSM calls), we want to
// pay the Barrett + Montgomery conversion cost **once** at SRS upload,
// not on every MSM. This shader is the Stage-1 conversion without the
// scalar-decomposition side effect.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> barrett_funcs }}
{{> montgomery_product_funcs }}
{{ > extract_word_from_bytes_le_funcs }}

@group(0) @binding(0)
var<storage, read> first_half: array<u32>;
@group(0) @binding(1)
var<storage, read> second_half: array<u32>;

{{#packed}}
@group(0) @binding(2)
var<storage, read_write> point_x: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> point_y: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(2)
var<storage, read_write> point_x: array<BigInt>;
@group(0) @binding(3)
var<storage, read_write> point_y: array<BigInt>;
{{/packed}}

@group(0) @binding(4)
var<uniform> input_size: u32;

{{#packed}}
{{{ dec_pack }}}

fn store_packed_pt(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*src)[2u * base_elem] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*src)[2u * base_elem + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}
{{/packed}}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gidx = global_id.x;
    let gidy = global_id.y;
    let id = gidx * {{ num_y_workgroups }}u + gidy;

    let INPUT_SIZE = input_size;
    let NUM_16_BIT_WORDS_PER_COORD = {{ num_16_bit_words_per_coord }}u;
    // Dispatcher rounds totalThreads up to a multiple of (workgroup_size *
    // numXWorkgroups * numYWorkgroups) so the tile covers srsN; ids past
    // input_size are no-ops. Without this guard a non-power-of-two srsN
    // (e.g. 88_899 for the ECDSA-r1 transfer flow) would OOB-write past
    // the point_x / point_y buffers.
    if (id >= INPUT_SIZE) {
        return;
    }

    var x_bytes: array<u32, {{ num_16_bit_words_per_coord }}>;
    var y_bytes: array<u32, {{ num_16_bit_words_per_coord }}>;
    var h = INPUT_SIZE / 2u;

    for (var i = 0u; i < {{ coord_u32_words }}u; i ++) {
        var x: u32;
        var y: u32;

        if (id < h) {
            x = first_half[id * {{ coord_u32_words_mul_two }}u + i];
            y = first_half[id * {{ coord_u32_words_mul_two }}u + i + {{ coord_u32_words }}u];
        } else {
            x = second_half[(id - h) * {{ coord_u32_words_mul_two }}u + i];
            y = second_half[(id - h) * {{ coord_u32_words_mul_two }}u + i + {{ coord_u32_words }}u];
        }

        x_bytes[NUM_16_BIT_WORDS_PER_COORD - 1 - (i * 2)] = x & 65535u;
        x_bytes[NUM_16_BIT_WORDS_PER_COORD - 1 - (i * 2) - 1] = x >> 16u;

        y_bytes[NUM_16_BIT_WORDS_PER_COORD - 1 - (i * 2)] = y & 65535u;
        y_bytes[NUM_16_BIT_WORDS_PER_COORD - 1 - (i * 2) - 1] = y >> 16u;
    }

    var x_bigint: BigInt;
    var y_bigint: BigInt;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        x_bigint.limbs[i] = extract_word_from_coord_bytes_le(x_bytes, i, WORD_SIZE);
        y_bigint.limbs[i] = extract_word_from_coord_bytes_le(y_bytes, i, WORD_SIZE);
    }

    var r = get_r();
    var x_mont = field_mul(&x_bigint, &r);
    var y_mont = field_mul(&y_bigint, &r);
{{#packed}}
    store_packed_pt(id, &point_x, &x_mont);
    store_packed_pt(id, &point_y, &y_mont);
{{/packed}}
{{^packed}}
    point_x[id] = x_mont;
    point_y[id] = y_mont;
{{/packed}}

    {{{ recompile }}}
}
