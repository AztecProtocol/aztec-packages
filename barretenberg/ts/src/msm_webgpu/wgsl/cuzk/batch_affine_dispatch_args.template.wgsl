// Per-round indirect-dispatch argument writer for the batch-affine pipeline.
//
// Reads the per-subtask pair counters that the schedule kernel just wrote,
// computes max_count across subtasks, and writes three
// dispatchWorkgroupsIndirect arg triples into `dispatch_args`:
//
//   args[0..3] = schedule (X, 1, T)   -- schedule for the *NEXT* round
//                                         (this round already ran; we use
//                                         this round's max_count to predict
//                                         whether next round has any work)
//   args[3..6] = inverse  (T or 0, 1, 1) -- inverse for THIS round
//   args[6..9] = apply    (ceil(max/wg), 1, T) -- apply for THIS round
//
// Why predict NEXT round's schedule from THIS round's max_count:
//
//   The schedule kernel only adds a pair for buckets whose cursor is still
//   below row_end. Once a bucket's cursor reaches row_end it stays there
//   (schedule never decrements). So the moment a round adds zero pairs
//   (max_count == 0), it means every bucket on every subtask has run out
//   of points — and that state is monotonic forever after.
//
//   So we mark schedule's NEXT-round X dim to 0 the first time we see
//   max_count == 0. From then on schedule launches no workgroups; the
//   per-round cost collapses from a full sched_x_groups × T dispatch to
//   a near-zero indirect-X=0 pass. At N=2^18 with MAX_ROUNDS=64 and max
//   bucket depth ~36, this elides ~28 rounds × ~0.65 ms of schedule per
//   round = ~18 ms of late-round waste, plus shrinks the untimestamped
//   gap by the same amount.
//
//   Round 0's schedule_args are pre-seeded by the host before the round
//   loop (full size); from round 1 onward they're written by this kernel.
//
// All three pipelines (schedule / inverse / apply) read their arg triple
// via dispatchWorkgroupsIndirect from this same buffer at the offset
// indicated above.
//
// Single workgroup of 1 thread; runs once per round between schedule and
// inverse. Negligible cost (one tiny dispatch + a T-element scan over
// pair_counter), even at MAX_ROUNDS = 256.
//
// Also forwards each subtask's pair_counter value into round_count and
// zeroes pair_counter back in the same scan. Why this fold:
//
//   - inverse and apply read the per-subtask count; previously they
//     read pair_counter directly via atomicLoad.
//   - schedule's atomicAdd needs pair_counter to start each round at 0,
//     which used to be done by a per-round commandEncoder.clearBuffer
//     (256 invocations at N=2^20).
//   - Folding the read+forward+zero into this one-thread kernel
//     eliminates that clearBuffer entirely (256 → 0 at N=2^20). The
//     extra writes are negligible against the per-round work and
//     happen during a kernel that was already running.

@group(0) @binding(0)
var<storage, read_write> pair_counter: array<atomic<u32>>;

@group(0) @binding(1)
var<storage, read_write> round_count: array<atomic<u32>>;

@group(0) @binding(2)
var<storage, read_write> dispatch_args: array<u32>;

// params[0] = num_subtasks
// params[1] = apply_workgroup_size
// params[2] = sched_x_groups   (= ceil(num_columns / schedule_workgroup_size))
// params[3] = num_sub_wgs_per_subtask  (= W; inverse dispatch X dim)
@group(0) @binding(3)
var<uniform> params: vec4<u32>;

@compute
@workgroup_size(1)
fn main() {
    let num_subtasks = params[0];
    let apply_wg_size = params[1];
    let sched_x_groups = params[2];
    let num_sub_wgs = params[3];

    var max_count: u32 = 0u;
    for (var i: u32 = 0u; i < num_subtasks; i = i + 1u) {
        let n = atomicLoad(&pair_counter[i]);
        if (n > max_count) {
            max_count = n;
        }
        // Forward to round_count (read by THIS round's inverse + apply)
        // and zero pair_counter (used as atomicAdd target by NEXT round's
        // schedule). The forwarding step decouples the schedule and
        // inverse/apply readers — schedule writes pair_counter, inverse
        // and apply read round_count.
        atomicStore(&round_count[i], n);
        atomicStore(&pair_counter[i], 0u);
    }
    let any_work = max_count > 0u;

    // NEXT round's schedule: full sized when any work was added this
    // round, zero otherwise. Once zero, stays zero (cursors are monotone).
    let next_schedule_x = select(0u, sched_x_groups, any_work);
    dispatch_args[0] = next_schedule_x;
    dispatch_args[1] = 1u;
    dispatch_args[2] = num_subtasks;

    // THIS round's inverse: (W, 1, T) workgroups — W sub-WGs per subtask
    // splitting each subtask's pair pool into W contiguous slices, each
    // independently inverted with its own fr_inv. Drops Phase A/D
    // per-thread sequential cost by W. See batch_inverse_parallel for
    // the algorithm.
    let inverse_x = select(0u, num_sub_wgs, any_work);
    let inverse_z = select(0u, num_subtasks, any_work);
    dispatch_args[3] = inverse_x;
    dispatch_args[4] = 1u;
    dispatch_args[5] = inverse_z;

    // THIS round's apply: ceil(max_count / wg) X-groups, T Z-groups.
    // Naturally 0 when max_count == 0.
    let apply_x = (max_count + apply_wg_size - 1u) / apply_wg_size;
    dispatch_args[6] = apply_x;
    dispatch_args[7] = 1u;
    dispatch_args[8] = num_subtasks;
}
