{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> barrett_funcs }}
{{> montgomery_product_funcs }}
{{ > extract_word_from_bytes_le_funcs }}

// Input buffers
@group(0) @binding(0)
var<storage, read> first_half: array<u32>;
@group(0) @binding(1)
var<storage, read> second_half: array<u32>;
@group(0) @binding(2)
var<storage, read> scalars: array<u32>;

// Output buffers
{{#packed}}
@group(0) @binding(3)
var<storage, read_write> point_x: array<vec4<u32>>;
@group(0) @binding(4)
var<storage, read_write> point_y: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(3)
var<storage, read_write> point_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> point_y: array<BigInt>;
{{/packed}}
@group(0) @binding(5)
var<storage, read_write> chunks: array<u32>;

{{#packed}}
{{{ dec_unpack }}}

{{{ dec_pack }}}

fn store_packed_pt(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*src)[2u * base_elem] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*src)[2u * base_elem + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}
{{/packed}}

// Uniform buffer for parameters
@group(0) @binding(6)
var<uniform> input_size: u32;

const NUM_SUBTASKS = {{ num_subtasks }}u;

// Scalar chunk bitwidth
const CHUNK_SIZE = {{ chunk_size }}u;

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

    // Convert the byte arrays to BigInts with word_size limbs
    var x_bigint: BigInt;
    var y_bigint: BigInt;
    for (var i = 0u; i < NUM_WORDS; i ++) {
        x_bigint.limbs[i] = extract_word_from_coord_bytes_le(x_bytes, i, WORD_SIZE);
        y_bigint.limbs[i] = extract_word_from_coord_bytes_le(y_bytes, i, WORD_SIZE);
    }

    // Convert x and y coordinates to Montgomery form
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

    // Note that we only compute the t and z coordinates in the SMVP shader
    // as WebGPU limits the number of buffers per shader to 8.

    // Decompose scalars
    var scalar_bytes: array<u32, 16>;
    for (var i = 0u; i < {{ scalar_u32_words }}u; i++) {
        let s = scalars[id * {{ scalar_u32_words }}u + i];
        let hi = s >> 16u;
        let lo = s & 65535u;
        scalar_bytes[15 - (i * 2)] = lo;
        scalar_bytes[15 - (i * 2) - 1] = hi;
    }

    // Extract scalar chunks and store them in chunks_arr
    var chunks_arr: array<u32, {{ num_subtasks }}>;
    for (var i = 0u; i < NUM_SUBTASKS; i++) {
        let offset = i * INPUT_SIZE;
        chunks_arr[i] = extract_word_from_bytes_le(scalar_bytes, i, CHUNK_SIZE);
    }
    {{#use_top_chunk_override}}
    // Top-chunk fixup for non-aligned bit lengths (e.g. BLS12-377 L=253).
    // Auto-disabled when scalar_bit_length is a multiple of chunk_size
    // (default BN254 256/16 and GLV 128/16 — natural extract is correct
    // and this override would zero out the top chunk for shorter
    // scalar buffers).
    chunks_arr[NUM_SUBTASKS - 1] = scalar_bytes[0] >> (((NUM_SUBTASKS * CHUNK_SIZE - {{ scalar_bitlength }}u) + 16u) - CHUNK_SIZE);
    {{/use_top_chunk_override}}

    // Iterate through chunks_arr to compute the signed indices
    let l = {{ num_columns }}u;
    let s = l / 2u;

    var signed_slices: array<i32, {{ num_subtasks }}>;
    var carry = 0u;
    for (var i = 0u; i < NUM_SUBTASKS; i ++) {
        signed_slices[i] = i32(chunks_arr[i] + carry);
        if (signed_slices[i] >= i32(s)) {
            signed_slices[i] = (i32(l) - signed_slices[i]) * -1i;
            carry = 1u;
        } else {
            carry = 0u;
        }
    }

    for (var i = 0u; i < NUM_SUBTASKS; i++) {
        let offset = i * INPUT_SIZE;

        // Note that we add s (half_num_columns) to the bucket index so we
        // don't store negative values, while retaining information about the
        // sign of the original index.
        chunks[id + offset] = u32(signed_slices[i]) + s;
    }

    {{{ recompile }}}
}
