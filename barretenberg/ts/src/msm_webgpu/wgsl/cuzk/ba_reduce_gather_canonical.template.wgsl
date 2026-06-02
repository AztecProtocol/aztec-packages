{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Gather + Montgomery-strip for the GPU/CPU split. The CPU finishes the reduce
// tail over a small, data-independent working set; this kernel packs exactly
// that set out of red_buf into a dense buffer in the CPU's wire format (LE,
// canonical / NOT Montgomery), so the readback is tiny and the host does no
// field conversion. Thread k copies red_buf[gather_idx[k]] -> dense_out[k],
// stripping the GPU's Montgomery R with one montmul by the canonical integer 1
// (x_mont * 1 * R^-1 = x). Empty slots (is_present == 0) become (0, 0), the
// CPU/marshalling encoding of the point at infinity.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read> red_buf:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read> is_present: array<u32>;
@group(0) @binding(2) var<storage, read> gather_idx: array<u32>;
@group(0) @binding(3) var<storage, read_write> dense_out: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>       cparams:    vec4<u32>; // (M, k_total, _, _)

fn load_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * idx;
    let q0 = red_buf[base + 0u];
    let q1 = red_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let M = cparams.x;
    let k_total = cparams.y;
    let k = gid.x;
    if (k >= k_total) { return; }
    let slot = gather_idx[k];
    let one = array<u32, 8>(1u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    let present = is_present[slot] != 0u;
    var x: array<u32, 8> = montgomery_product_f8(load_x(slot, M), one);
    var y: array<u32, 8> = montgomery_product_f8(load_y(slot, M), one);
    if (!present) {
        x = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
        y = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    }
    let b = 4u * k; // 4 vec4 = 64 bytes per dense slot (x[8] || y[8])
    dense_out[b + 0u] = vec4<u32>(x[0], x[1], x[2], x[3]);
    dense_out[b + 1u] = vec4<u32>(x[4], x[5], x[6], x[7]);
    dense_out[b + 2u] = vec4<u32>(y[0], y[1], y[2], y[3]);
    dense_out[b + 3u] = vec4<u32>(y[4], y[5], y[6], y[7]);
}
