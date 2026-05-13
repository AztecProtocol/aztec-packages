// Scalars-only variant of `convert_point_coords_and_decompose_scalars`.
// Reads 32-byte LE scalars from a packed u32 buffer and writes one
// shifted-signed bucket index per scalar per subtask into `chunks`.
//
// Purpose. Warm-path MSM with cached SRS bases: points are already in
// Montgomery form on the GPU, so we skip the Barrett + Mont work
// entirely and only need to decompose scalars. The resulting
// `chunks_sb` feeds the transpose → SMVP → BPR chain identically to
// the unified convert shader.
//
// Mirrors lines 88–129 of
// `convert_point_coords_and_decompose_scalars.template.wgsl` verbatim
// so downstream stages see byte-identical inputs.
//
// Optional fused count: when `count_into_col_ptr` is true, the kernel
// also atomicAdds into the per-subtask column-counter buffer (the same
// `all_csc_col_ptr` layout that the parallel transpose's count phase
// produces). This lets the orchestrator skip the separate
// transpose_count dispatch and saves one full pass over
// `scalar_chunks_sb` (~2 MB read + ~2 MB col_ptr atomic writes at
// N=2^16). Caller must zero `col_ptr` before this kernel runs and
// must NOT also dispatch transpose_count.

{{ > extract_word_from_bytes_le_funcs }}

@group(0) @binding(0)
var<storage, read> scalars: array<u32>;

@group(0) @binding(1)
var<storage, read_write> chunks: array<u32>;

@group(0) @binding(2)
var<uniform> input_size: u32;

{{#count_into_col_ptr}}
@group(0) @binding(3)
var<storage, read_write> col_ptr: array<atomic<u32>>;
{{/count_into_col_ptr}}

const NUM_SUBTASKS = {{ num_subtasks }}u;
const CHUNK_SIZE = {{ chunk_size }}u;
{{#count_into_col_ptr}}
const NUM_COLUMNS = {{ num_columns }}u;
{{/count_into_col_ptr}}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gidx = global_id.x;
    let gidy = global_id.y;
    let id = gidx * {{ num_y_workgroups }}u + gidy;

    let INPUT_SIZE = input_size;

    var scalar_bytes: array<u32, 16>;
    for (var i = 0u; i < {{ scalar_u32_words }}u; i++) {
        let s = scalars[id * {{ scalar_u32_words }}u + i];
        let hi = s >> 16u;
        let lo = s & 65535u;
        scalar_bytes[15 - (i * 2)] = lo;
        scalar_bytes[15 - (i * 2) - 1] = hi;
    }

    var chunks_arr: array<u32, {{ num_subtasks }}>;
    for (var i = 0u; i < NUM_SUBTASKS; i++) {
        chunks_arr[i] = extract_word_from_bytes_le(scalar_bytes, i, CHUNK_SIZE);
    }
    {{#use_top_chunk_override}}
    // Override the top chunk for non-aligned bit lengths (e.g. BLS12-377
    // L=253, c=16 → top chunk must be 13 bits, not 16). The natural
    // extract reads beyond the scalar's high bit; this re-reads the
    // top with proper masking. Disabled when scalar_bitlength % chunk_size
    // == 0 (e.g. 256/16 or 128/16) where the natural extract is already
    // correct AND this override would zero-out the top chunk on
    // shorter scalar buffers (the GLV 128-bit case).
    chunks_arr[NUM_SUBTASKS - 1] = scalar_bytes[0] >> (((NUM_SUBTASKS * CHUNK_SIZE - {{ scalar_bitlength }}u) + 16u) - CHUNK_SIZE);
    {{/use_top_chunk_override}}

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
        let c = u32(signed_slices[i]) + s;
        chunks[id + offset] = c;
{{#count_into_col_ptr}}
        // Fused-count path: atomically increment the column counter
        // for (subtask=i, col=c). Layout matches transpose_count's
        // output: `col_ptr[i * (NUM_COLUMNS + 1) + c + 1]`. The +1
        // offset is the standard CSR convention (slot 0 holds 0; the
        // prefix-sum scan turns slot k+1 into the start of column k).
{{/count_into_col_ptr}}
{{#count_into_col_ptr}}
        atomicAdd(&col_ptr[i * (NUM_COLUMNS + 1u) + c + 1u], 1u);
{{/count_into_col_ptr}}
    }

    {{{ recompile }}}
}
