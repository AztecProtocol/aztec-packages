// Bucket-accumulate planner stage 1.1b: meta fixup.
//
// Single thread reads the final atomic counters from classify and writes
// derived indirect-dispatch args into planner_meta.

@group(0) @binding(0) var<storage, read_write> planner_meta: array<u32>;

fn ceil_div(a: u32, b: u32) -> u32 {
    return (a + b - 1u) / b;
}

@compute @workgroup_size(1)
fn main() {
    let num_size1 = planner_meta[0];

    planner_meta[8]  = ceil_div(num_size1, 64u);
    planner_meta[9]  = 1u;
    planner_meta[10] = 1u;

    {{{ recompile }}}
}
