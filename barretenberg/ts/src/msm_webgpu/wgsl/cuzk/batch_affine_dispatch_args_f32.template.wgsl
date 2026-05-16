// Per-round indirect-dispatch argument writer for the batch-affine f32
// pipeline. Mirror of `batch_affine_dispatch_args.template.wgsl` — the
// kernel is encoding-agnostic (only manipulates atomic u32 counters and
// u32 indirect dispatch slots), so the body is identical. Kept as a
// distinct file so the f32 pipeline doesn't share template state with
// the u32 path.

@group(0) @binding(0)
var<storage, read_write> pair_counter: array<atomic<u32>>;

@group(0) @binding(1)
var<storage, read_write> round_count: array<atomic<u32>>;

@group(0) @binding(2)
var<storage, read_write> dispatch_args: array<u32>;

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
        atomicStore(&round_count[i], n);
        atomicStore(&pair_counter[i], 0u);
    }
    let any_work = max_count > 0u;

    let next_schedule_x = select(0u, sched_x_groups, any_work);
    dispatch_args[0] = next_schedule_x;
    dispatch_args[1] = 1u;
    dispatch_args[2] = num_subtasks;

    let inverse_x = select(0u, num_sub_wgs, any_work);
    let inverse_z = select(0u, num_subtasks, any_work);
    dispatch_args[3] = inverse_x;
    dispatch_args[4] = 1u;
    dispatch_args[5] = inverse_z;

    let apply_x = (max_count + apply_wg_size - 1u) / apply_wg_size;
    dispatch_args[6] = apply_x;
    dispatch_args[7] = 1u;
    dispatch_args[8] = num_subtasks;
}
