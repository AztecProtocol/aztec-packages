// Pair-tree v2: write each hot bucket's final partial to bucket_sums.
//
// After MAX_LEVELS rounds of (pt_build + pt_combine), every hot bucket
// has converged to a single partial sitting at pt_buf[pt_off[hot_idx]].
// One thread per hot bucket copies that into the bucket_sums output
// matrix at the bucket_id row.
//
// params.x = M_pt        (pt_buf plane stride)
// params.y = M_buckets   (bucket_sums plane stride; MUST equal B_TOTAL)

const HOT_THRESHOLD: u32 = 8u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       sorted_active:  array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       pt_off:         array<u32>;
@group(0) @binding(4) var<storage, read>       pt_buf:         array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> bucket_sums:    array<vec4<u32>>;
@group(0) @binding(6) var<uniform>             params:         vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let hot_idx = gid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    if (cool_end + hot_idx >= NUM_ACTIVE) { return; }

    let bid = sorted_active[cool_end + hot_idx];
    let M_pt = params.x;
    let M_buckets = params.y;
    let idx = pt_off[hot_idx];

    let x0 = pt_buf[PG * idx + 0u];
    let x1 = pt_buf[PG * idx + 1u];
    let y0 = pt_buf[PG * M_pt + PG * idx + 0u];
    let y1 = pt_buf[PG * M_pt + PG * idx + 1u];

    bucket_sums[PG * bid + 0u] = x0;
    bucket_sums[PG * bid + 1u] = x1;
    bucket_sums[PG * M_buckets + PG * bid + 0u] = y0;
    bucket_sums[PG * M_buckets + PG * bid + 1u] = y1;

    {{{ recompile }}}
}
