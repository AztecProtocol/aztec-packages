// Single-thread-per-input bench shader for `by_divsteps`.
//
// Each thread:
//   1. Reads (f_lo, g_lo) as a vec4<u32> from `inputs_fg[tid]`
//      (= f_lo.x, f_lo.y, g_lo.x, g_lo.y).
//   2. Reads the initial delta from `inputs_delta[tid]`.
//   3. Calls `by_divsteps(&delta, f_lo, g_lo)`.
//   4. Writes the 8 Mat fields + the updated delta (9 i32) into `outputs[tid]`.
//
// LOOP BOUNDS
//   The only loops in the included partials are bounded by WGSL `const`s
//   (BY_NUM_LIMBS, BY_BATCH) or Mustache-const values (`{{ num_words }}`).
//   No loop is added in this entry shader. The `if (tid >= n)` guard is not
//   a loop bound.

@group(0) @binding(0) var<storage, read>       inputs_fg:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       inputs_delta: array<i32>;
@group(0) @binding(2) var<storage, read_write> outputs:      array<i32>;
@group(0) @binding(3) var<uniform>             params:       vec2<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let tid = gid.x;
    if (tid >= n) { return; }

    let fg = inputs_fg[tid];
    let f_lo: vec2<u32> = vec2<u32>(fg.x, fg.y);
    let g_lo: vec2<u32> = vec2<u32>(fg.z, fg.w);
    var delta: i32 = inputs_delta[tid];

    let m: Mat = by_divsteps(&delta, f_lo, g_lo);

    let base: u32 = tid * 9u;
    outputs[base + 0u] = m.u;
    outputs[base + 1u] = m.v;
    outputs[base + 2u] = m.q;
    outputs[base + 3u] = m.r;
    outputs[base + 4u] = m.u_hi;
    outputs[base + 5u] = m.v_hi;
    outputs[base + 6u] = m.q_hi;
    outputs[base + 7u] = m.r_hi;
    outputs[base + 8u] = delta;
}
