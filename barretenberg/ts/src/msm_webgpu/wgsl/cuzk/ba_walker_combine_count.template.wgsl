// Optimal walker_combine Kernel A: count partials per bucket.
//
// One thread per partial slot. Reads partial_dest[slot]; if active
// (!= NO_BUCKET), atomicAdd's the per-bucket counter. After this kernel
// finishes, partial_count[bid] = number of partials for bucket bid.
//
// params.x = num_partial_slots (= 2 * NUM_THREADS * S — total possible slots)

const NO_BUCKET: u32 = 0xffffffffu;

@group(0) @binding(0) var<storage, read>       partial_dest:  array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_count: array<atomic<u32>>;
@group(0) @binding(2) var<uniform>             params:        vec4<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let num_slots = params.x;
    if (slot >= num_slots) { return; }
    let bid = partial_dest[slot];
    // bid == 0 means "cleared slot" (per-batch clearBuffer writes zeros).
    // bid == NO_BUCKET (0xFFFFFFFF) means walker init explicitly cleared.
    // bid == 0 can never be a real walker output: ba_planner_classify drops
    // magnitude==0 buckets, so the only bid the walker ever stores has
    // magnitude in [1, STRIDE], i.e. bid >= 1.
    if (bid == 0u || bid == NO_BUCKET) { return; }
    atomicAdd(&partial_count[bid], 1u);

    {{{ recompile }}}
}
