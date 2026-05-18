// Counts the number of distinct contiguous bucket runs in
// `entry_bucket_id[0..total_entries)`. The result is the number of
// "active buckets" the tree-reduce must produce in its final layer
// (every bucket has exactly one partial when the count is reached).
//
// One dispatch over ceil(total_entries / WG_SIZE) workgroups of WG_SIZE
// threads. Per-thread contribution: 1 iff (i == 0) OR (bucket[i] !=
// bucket[i-1]); else 0. Workgroup-local reduction in shared memory,
// then thread 0 of each WG atomicAdds the workgroup total into the
// single output slot.

const WG_SIZE: u32 = {{ wg_size }}u;

@group(0) @binding(0)
var<storage, read> entry_bucket_id: array<u32>;

@group(0) @binding(1)
var<storage, read_write> num_active_buckets: array<atomic<u32>>;

struct Params {
    total_entries: u32,
    pad: u32,
    pad2: u32,
    pad3: u32,
}
@group(0) @binding(2)
var<uniform> params: Params;

var<workgroup> wg_counts: array<u32, {{ wg_size }}>;

@compute
@workgroup_size({{ wg_size }})
fn main(
    @builtin(global_invocation_id) gid: vec3<u32>,
    @builtin(local_invocation_id) lid: vec3<u32>,
) {
    let i = gid.x;
    let tid = lid.x;

    var c: u32 = 0u;
    if (i < params.total_entries) {
        if (i == 0u) {
            c = 1u;
        } else {
            let cur = entry_bucket_id[i];
            let prv = entry_bucket_id[i - 1u];
            if (cur != prv) { c = 1u; }
        }
    }
    wg_counts[tid] = c;
    workgroupBarrier();

    var stride: u32 = WG_SIZE / 2u;
    loop {
        if (stride == 0u) { break; }
        if (tid < stride) {
            wg_counts[tid] = wg_counts[tid] + wg_counts[tid + stride];
        }
        workgroupBarrier();
        stride = stride / 2u;
    }

    if (tid == 0u) {
        let total = wg_counts[0];
        if (total != 0u) {
            atomicAdd(&num_active_buckets[0], total);
        }
    }

    {{{ recompile }}}
}
