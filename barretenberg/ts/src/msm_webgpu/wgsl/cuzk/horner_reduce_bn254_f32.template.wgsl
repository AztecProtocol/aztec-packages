// 23-bit f32 mirror of `horner_reduce_bn254.template.wgsl`. Per-subtask
// reduce + (optional) Horner chain. All field/curve ops routed through
// the f32-Montgomery stack.
//
// Two entry points (subtask_reduce, horner_chain) — same dispatch model
// and workgroup geometry as the u32 path. The f32 entry only dispatches
// subtask_reduce; the Horner chain runs on the CPU after readback.

const TPB: u32 = 32u;
const B_WG_SIZE: u32 = {{ b_workgroup_size }}u;
const CHUNK_SIZE: u32 = {{ chunk_size }}u;
const T: u32 = {{ num_subtasks }}u;

@group(0) @binding(0)
var<storage, read> g_points_x: array<BigIntF32>;
@group(0) @binding(1)
var<storage, read> g_points_y: array<BigIntF32>;
@group(0) @binding(2)
var<storage, read> g_points_z: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read_write> sums_x: array<BigIntF32>;
@group(0) @binding(4)
var<storage, read_write> sums_y: array<BigIntF32>;
@group(0) @binding(5)
var<storage, read_write> sums_z: array<BigIntF32>;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

fn get_paf_f32() -> PointF32 {
    var p: PointF32;
    p.y = get_r_local_f32();
    return p;
}

var<workgroup> wg_partials: array<PointF32, TPB>;

@compute
@workgroup_size(TPB)
fn subtask_reduce(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let subtask_idx = wid.x;
    let base = subtask_idx * B_WG_SIZE;

    let chunk = B_WG_SIZE / TPB;
    let chunk_start = tid * chunk;
    var acc: PointF32 = get_paf_f32();
    for (var i: u32 = 0u; i < chunk; i = i + 1u) {
        let idx = base + chunk_start + i;
        var p: PointF32;
        p.x = g_points_x[idx];
        p.y = g_points_y[idx];
        p.z = g_points_z[idx];
        acc = add_points_f32(acc, p);
    }
    wg_partials[tid] = acc;

    workgroupBarrier();

    var stride: u32 = TPB / 2u;
    while (stride > 0u) {
        if (tid < stride) {
            let other = wg_partials[tid + stride];
            wg_partials[tid] = add_points_f32(wg_partials[tid], other);
        }
        workgroupBarrier();
        stride = stride / 2u;
    }

    if (tid == 0u) {
        let s = wg_partials[0];
        sums_x[subtask_idx] = s.x;
        sums_y[subtask_idx] = s.y;
        sums_z[subtask_idx] = s.z;
    }

    {{{ recompile }}}
}

const RESULT_SLOT: u32 = {{ num_subtasks }}u;

// Optional GPU Horner chain. The f32 entry point dispatches only
// subtask_reduce above and walks the Horner chain on the CPU; this
// stays here for symmetry with the u32 source.
@compute
@workgroup_size({{ num_subtasks }})
fn horner_chain(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;

    var p: PointF32;
    p.x = sums_x[tid];
    p.y = sums_y[tid];
    p.z = sums_z[tid];
    let n_doublings = tid * CHUNK_SIZE;
    for (var i: u32 = 0u; i < n_doublings; i = i + 1u) {
        p = double_point_f32(p);
    }
    wg_partials[tid] = p;

    workgroupBarrier();

    var stride: u32 = T / 2u;
    while (stride > 0u) {
        if (tid < stride) {
            wg_partials[tid] = add_points_f32(wg_partials[tid], wg_partials[tid + stride]);
        }
        workgroupBarrier();
        stride = stride / 2u;
    }

    if (tid == 0u) {
        let r = wg_partials[0];
        sums_x[RESULT_SLOT] = r.x;
        sums_y[RESULT_SLOT] = r.y;
        sums_z[RESULT_SLOT] = r.z;
    }

    {{{ recompile }}}
}
