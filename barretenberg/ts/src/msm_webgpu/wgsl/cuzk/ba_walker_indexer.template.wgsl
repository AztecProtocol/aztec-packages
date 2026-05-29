// Stream-walker split-bucket indexer (replaces the O(num_dense * num_slots)
// scan in ba_walker_combine with an O(num_slots) per-bucket linked list).
//
// After ba_stream_walker, every active partial slot holds a piece of a
// split bucket, tagged with its destination bucket id in partial_dest
// (NO_BUCKET for the unused slot of a task). This kernel runs one thread
// per partial slot: a tagged slot claims a fresh node via a global
// atomicAdd(&node_count, 1) and prepends it to bucket_head[bucket_id] with
// an atomicCompareExchangeWeak retry loop. ba_walker_combine then walks
// each dense bucket's list instead of rescanning all slots.
//
// Node handles are 1-indexed so bucket_head == 0 means "empty list"
// (NO_NODE). Each node is NODE_STRIDE u32: [next_handle, partial_slot,
// bucket_id]. bucket_id is redundant for the walk (the list is per-bucket)
// but kept so the node is self-describing for debugging.
//
// planner_meta[3] = nwg (active stream workgroups); the active partial slot
// count is 2 * (nwg * 256) * S, matching ba_walker_combine's scan bound.

const S: u32 = {{ s }}u;
const NODE_STRIDE: u32 = 3u;
const NO_BUCKET: u32 = 0xffffffffu;

@group(0) @binding(0) var<storage, read>       partial_dest: array<u32>;
@group(0) @binding(1) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(2) var<storage, read_write> bucket_head:  array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> node_count:   array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> nodes:        array<u32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let num_slots = 2u * (planner_meta[3] * 256u) * S;
    if (slot >= num_slots) { return; }

    let bucket_id = partial_dest[slot];
    if (bucket_id == NO_BUCKET) { return; }

    // Claim a node. 1-indexed: handle 0 is reserved for NO_NODE.
    let handle = atomicAdd(&node_count[0], 1u) + 1u;
    let base = (handle - 1u) * NODE_STRIDE;
    nodes[base + 1u] = slot;
    nodes[base + 2u] = bucket_id;

    // Prepend this node to its bucket's list. The CAS loop publishes the new
    // head only after nodes[base].next is set to the head it observed, so a
    // concurrent combine walk never sees a node pointing at a stale next.
    loop {
        let old_head = atomicLoad(&bucket_head[bucket_id]);
        nodes[base + 0u] = old_head;
        let res = atomicCompareExchangeWeak(&bucket_head[bucket_id], old_head, handle);
        if (res.exchanged) { break; }
    }

    {{{ recompile }}}
}
