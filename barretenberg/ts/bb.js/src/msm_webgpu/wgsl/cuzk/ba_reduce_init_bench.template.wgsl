// Reduction-stage init: repack the bucket-accumulate output into the
// reduction's working buffer, and seed the present-mask.
//
// bucket_result has BW columns per window; the weighted buckets are the
// digit magnitudes 1..2^(c-1) — column 0 is the zero digit (weight 0) and
// is dropped, columns past 2^(c-1) are padding and are dropped. red_buf is
// laid out with STRIDE = 2^(c-1) columns per window (a power of two — what
// the 4-phase reduction requires). One thread per red_buf element: copy
// the matching bucket_result element and set is_present iff it is
// non-zero (an empty bucket's accumulate output stays all-zero).

const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       bucket_result: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> red_buf:       array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> is_present:    array<u32>;
@group(0) @binding(3) var<uniform>             params:        vec4<u32>;
// params.x = total   (NUM_WINDOWS * STRIDE — red_buf element count)
// params.y = STRIDE  (red_buf columns per window)
// params.z = BW      (bucket_result columns per window)
// params.w = B_TOTAL (bucket_result element stride = NUM_WINDOWS * BW)

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let g = gid.x;
    let total = params.x;
    if (g >= total) {
        return;
    }
    let stride = params.y;
    let bw = params.z;
    let b_total = params.w;

    let w = g / stride;
    let i = g % stride;
    // red_buf slot i  <-  bucket_result weighted column (i + 1).
    let src = w * bw + i + 1u;

    let src_x = PG * src;
    let src_y = PG * b_total + PG * src;
    let dst_x = PG * g;
    let dst_y = PG * total + PG * g;

    let x0 = bucket_result[src_x + 0u];
    let x1 = bucket_result[src_x + 1u];
    let y0 = bucket_result[src_y + 0u];
    let y1 = bucket_result[src_y + 1u];

    red_buf[dst_x + 0u] = x0;
    red_buf[dst_x + 1u] = x1;
    red_buf[dst_y + 0u] = y0;
    red_buf[dst_y + 1u] = y1;

    let nz = x0.x | x0.y | x0.z | x0.w | x1.x | x1.y | x1.z | x1.w
           | y0.x | y0.y | y0.z | y0.w | y1.x | y1.y | y1.z | y1.w;
    is_present[g] = select(0u, 1u, nz != 0u);

    {{{ recompile }}}
}
