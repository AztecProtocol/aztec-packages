// Pair-tree v2: per-level pair-task emitter.
//
// One thread per hot bucket. For bucket B with current pt_count[hot_idx]:
//   n_pairs = count / 2; odd = count & 1; new_count = n_pairs + odd
// Each pair (2j, 2j+1) → output slot (n_pairs odd-survivor → final slot).
// Tasks are appended to pt_tasks via a per-workgroup aggregated atomic
// (one global atomicAdd per WG, NOT one per thread — mobile-friendly).
//
// After emit, the thread advances its bucket's pt_off/pt_count to the
// next level's region in pt_buf (in-place shift layout).
//
// Idle threads (cool_end+hot_idx >= NUM_ACTIVE) skip everything.
// Threads with current count <= 1 also skip (nothing to combine).
//
// Task encoding: vec4<u32>(L, R, O, kind)
//   kind=0: pair (combine L, R → O)
//   kind=1: copy (move L → O for odd survivor)

const HOT_THRESHOLD: u32 = 8u;
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       bin_offsets:    array<u32>;
@group(0) @binding(1) var<storage, read>       active_count:   array<u32>;
@group(0) @binding(2) var<storage, read_write> pt_off:         array<u32>;
@group(0) @binding(3) var<storage, read_write> pt_count:       array<u32>;
@group(0) @binding(4) var<storage, read_write> pt_tasks:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> pt_total_tasks: array<atomic<u32>>;

// Workgroup-shared state for per-WG aggregated atomic.
var<workgroup> wg_local_offsets: array<u32, {{ workgroup_size }}>;
var<workgroup> wg_local_counts:  array<u32, {{ workgroup_size }}>;
var<workgroup> wg_total:         atomic<u32>;
var<workgroup> wg_base:          u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let hot_idx = gid.x;
    let l = lid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];

    // === Phase 1: each thread figures its bucket's n_outputs (n_pairs+odd).
    var cur: u32 = 0u;
    var n_pairs: u32 = 0u;
    var odd: u32 = 0u;
    var in_base: u32 = 0u;
    var n_outputs: u32 = 0u;
    let is_active = cool_end + hot_idx < NUM_ACTIVE;
    if (is_active) {
        cur = pt_count[hot_idx];
        in_base = pt_off[hot_idx];
        if (cur > 1u) {
            n_pairs = cur / 2u;
            odd = cur & 1u;
            n_outputs = n_pairs + odd;
        }
    }

    // Initialise wg counter.
    if (l == 0u) { atomicStore(&wg_total, 0u); }
    workgroupBarrier();

    // Each thread atomicAdds its n_outputs to wg_total to claim a local slot.
    let local_off = atomicAdd(&wg_total, n_outputs);
    wg_local_offsets[l] = local_off;
    wg_local_counts[l] = n_outputs;
    workgroupBarrier();

    // Thread 0 publishes wg_total to the global counter (ONE atomic per WG).
    if (l == 0u) {
        let total = atomicLoad(&wg_total);
        wg_base = atomicAdd(&pt_total_tasks[0], total);
    }
    workgroupBarrier();

    // === Phase 2: emit pair-tasks + odd copy-task into pt_tasks.
    if (n_outputs > 0u) {
        let out_base_pt = in_base + cur;          // next-level region in pt_buf
        let task_base = wg_base + wg_local_offsets[l];

        // Defensive cap: n_pairs is bounded by cur/2 where cur = pt_count,
        // derived from partial_count. Worst-case ~393K; 1M is safety ceiling.
        for (var j: u32 = 0u; j < n_pairs; j = j + 1u) {
            if (j >= 1048576u) { break; }
            pt_tasks[task_base + j] = vec4<u32>(
                in_base + 2u * j,
                in_base + 2u * j + 1u,
                out_base_pt + j,
                0u,
            );
        }
        if (odd == 1u) {
            pt_tasks[task_base + n_pairs] = vec4<u32>(
                in_base + cur - 1u,
                0u,
                out_base_pt + n_pairs,
                1u,
            );
        }

        // Advance bucket state for next level.
        pt_off[hot_idx] = out_base_pt;
        pt_count[hot_idx] = n_outputs;
    }

    {{{ recompile }}}
}
