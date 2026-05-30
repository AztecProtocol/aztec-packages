// Stream-walker partials indexer.
//
// The walker writes (bucket_id + 1) per used partial slot in `partial_dest`
// (slots without a partial hold 0 = PD_EMPTY — the value the host clears the
// whole buffer to, so over-allocated slots that no dispatched thread touches
// are correctly treated as empty rather than as bucket 0). Without indexing,
// ba_walker_combine has to scan every slot for every dense bucket — an
// O(num_dense × M_partials) over-scan that dominates the GPU time at
// logn ≥ 17 even though the real work is tiny (≤ 1e4 affine adds).
//
// This kernel builds a per-bucket singly-linked list of partial slots in
// one device-global pass:
//   bucket_head[bucket_id] = handle of the first node for this bucket
//                            (0 = NO_NODE — i.e. handles are 1-indexed so
//                            a zeroed bucket_head means "no partials")
//   nodes_slot[i]          = partial slot index for node handle i+1
//   nodes_next[i]          = handle of the next node (0 = end of list)
//   node_counter           = next free node index (atomic counter)
//
// The CAS loop on bucket_head ensures the head-swap and the nodes_next
// write are atomic-ordered correctly even if two slots target the same
// bucket from different threads. After the dispatch finishes, combine can
// traverse each bucket's list with no further synchronisation.

const PD_EMPTY: u32 = 0u;
const NO_NODE: u32 = 0u;

@group(0) @binding(0) var<storage, read>            partial_dest:  array<u32>;
@group(0) @binding(1) var<storage, read_write>      bucket_head:   array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write>      nodes_slot:    array<u32>;
@group(0) @binding(3) var<storage, read_write>      nodes_next:    array<u32>;
@group(0) @binding(4) var<storage, read_write>      node_counter:  atomic<u32>;
@group(0) @binding(5) var<uniform>                  params:        vec4<u32>;
// params.x = num_partial_slots (M_partials × 2)
// params.y = max_nodes (size of nodes_slot/nodes_next — for overflow guard)

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let num_slots = params.x;
    let max_nodes = params.y;
    if (slot >= num_slots) { return; }

    let raw = partial_dest[slot];
    if (raw == PD_EMPTY) { return; }
    let bucket_id = raw - 1u;

    let node_array_idx = atomicAdd(&node_counter, 1u);
    if (node_array_idx >= max_nodes) { return; }
    let node_handle = node_array_idx + 1u;  // 1-indexed so 0 = NO_NODE

    nodes_slot[node_array_idx] = slot;

    // CAS-loop the head-swap: read old head, store as our `next`, then try
    // to publish our handle as the new head. If somebody beat us to it,
    // retry with the new head value as our next.
    loop {
        let prev_head = atomicLoad(&bucket_head[bucket_id]);
        nodes_next[node_array_idx] = prev_head;
        let r = atomicCompareExchangeWeak(&bucket_head[bucket_id], prev_head, node_handle);
        if (r.exchanged) { break; }
    }

    {{{ recompile }}}
}
