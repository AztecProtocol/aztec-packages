{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> ec_funcs }}

// GPU-side replacement for the CPU Horner reduction at the tail of the
// MSM. Two entry points dispatched in sequence:
//
//   subtask_reduce — T workgroups of TPB threads each. Workgroup k
//     reduces g_points[k*b_wg .. (k+1)*b_wg - 1] into one Jacobian
//     point and writes it to subtask_sums[k]. Each thread does a
//     serial chunk of (b_wg / TPB) adds, then cooperative tree
//     reduction in workgroup memory.
//
//   horner_chain — 1 workgroup, 1 thread. Reads subtask_sums[0..T-1]
//     and walks the Horner chain, writing the final result to
//     result_x/y/z[0].
//
// Why two kernels:
// - Inter-workgroup sync requires a dispatch boundary in WebGPU; we
//   need all subtask_sums written before the Horner chain can start.
// - The previous single-workgroup design ran all T subtask reductions
//   on a single SM (the workgroup's threads get packed into one Metal
//   SIMD group), which serialised the per-subtask 256-add chains.
//   Spreading subtasks across T workgroups parallelises across SMs.
//
// Compute budget (BN254, T=16, b_wg=256, chunk=16):
//   subtask_reduce: 16 workgroups × (256/32 + log2(32)) ≈ 13 adds/thread
//                   wall = 13 * (11M+5S) ≈ 200 muls × ~50 ns ≈ 10 µs
//   horner_chain:   16 doublings × 15 + 15 adds ≈ 17 mont-mul-equiv per
//                   chunk × 15 chunks ≈ 250 muls ≈ 12 µs
//   Total: ~25 µs wall time vs the previous ~45 ms (single-SM packed).

const TPB: u32 = 32u;
const B_WG_SIZE: u32 = {{ b_workgroup_size }}u;
const CHUNK_SIZE: u32 = {{ chunk_size }}u;
const T: u32 = {{ num_subtasks }}u;

{{#packed}}
@group(0) @binding(0)
var<storage, read> g_points_x: array<vec4<u32>>;
@group(0) @binding(1)
var<storage, read> g_points_y: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> g_points_z: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(0)
var<storage, read> g_points_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read> g_points_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read> g_points_z: array<BigInt>;
{{/packed}}

// Combined scratch + result buffer (T+1 BigInts per coordinate):
//   index 0..T-1 — per-subtask partial sum (written by subtask_reduce,
//                  read by horner_chain).
//   index T     — final Horner result (written by horner_chain, read by CPU).
//
// Packing all three coordinates into one buffer pair (sums_x, sums_y, sums_z)
// instead of six separate buffers keeps us within the 8-storage-buffers-
// per-stage WebGPU baseline (current shader: 3 read-only g_points +
// 3 read-write packed = 6 storage bindings).
{{#packed}}
@group(0) @binding(3)
var<storage, read_write> sums_x: array<vec4<u32>>;
@group(0) @binding(4)
var<storage, read_write> sums_y: array<vec4<u32>>;
@group(0) @binding(5)
var<storage, read_write> sums_z: array<vec4<u32>>;
{{/packed}}
{{^packed}}
@group(0) @binding(3)
var<storage, read_write> sums_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> sums_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> sums_z: array<BigInt>;
{{/packed}}

{{#packed}}
{{{ dec_unpack }}}

{{{ dec_pack }}}

fn load_packed_ro(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * base_elem];
    let q1 = (*src)[2u * base_elem + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn load_packed_rw(base_elem: u32, src: ptr<storage, array<vec4<u32>>, read_write>) -> BigInt {
    var w: array<u32, 8>;
    let q0 = (*src)[2u * base_elem];
    let q1 = (*src)[2u * base_elem + 1u];
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_packed_rw(base_elem: u32, dst: ptr<storage, array<vec4<u32>>, read_write>, val: ptr<function, BigInt>) {
    let w = pack_limbs_to_256(val);
    (*dst)[2u * base_elem] = vec4<u32>(w[0], w[1], w[2], w[3]);
    (*dst)[2u * base_elem + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}
{{/packed}}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_paf() -> Point {
    var p: Point;
    p.y = get_r();
    return p;
}

// Workgroup memory for tree reduction. TPB partial sums × sizeof(Point).
// At TPB=32: 32 * 240 = 7680 bytes — half of the 16 KB default cap.
var<workgroup> wg_partials: array<Point, TPB>;

@compute
@workgroup_size(TPB)
fn subtask_reduce(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let subtask_idx = wid.x;
    let base = subtask_idx * B_WG_SIZE;

    // Per-thread serial chunk: each thread sums its slice of (b_wg / TPB)
    // points. With b_wg=256 and TPB=32, that's 8 adds per thread.
    let chunk = B_WG_SIZE / TPB;
    let chunk_start = tid * chunk;
    var acc: Point = get_paf();
    for (var i: u32 = 0u; i < chunk; i = i + 1u) {
        let idx = base + chunk_start + i;
        var p: Point;
{{#packed}}
        p.x = load_packed_ro(idx, &g_points_x);
        p.y = load_packed_ro(idx, &g_points_y);
        p.z = load_packed_ro(idx, &g_points_z);
{{/packed}}
{{^packed}}
        p.x = g_points_x[idx];
        p.y = g_points_y[idx];
        p.z = g_points_z[idx];
{{/packed}}
        acc = add_points(acc, p);
    }
    wg_partials[tid] = acc;

    workgroupBarrier();

    // Tree reduction: log2(TPB) passes of halve-and-add.
    var stride: u32 = TPB / 2u;
    while (stride > 0u) {
        if (tid < stride) {
            let other = wg_partials[tid + stride];
            wg_partials[tid] = add_points(wg_partials[tid], other);
        }
        workgroupBarrier();
        stride = stride / 2u;
    }

    // Thread 0 writes this subtask's sum at slot subtask_idx.
    if (tid == 0u) {
        let s = wg_partials[0];
{{#packed}}
        var sx = s.x; var sy = s.y; var sz = s.z;
        store_packed_rw(subtask_idx, &sums_x, &sx);
        store_packed_rw(subtask_idx, &sums_y, &sy);
        store_packed_rw(subtask_idx, &sums_z, &sz);
{{/packed}}
{{^packed}}
        sums_x[subtask_idx] = s.x;
        sums_y[subtask_idx] = s.y;
        sums_z[subtask_idx] = s.z;
{{/packed}}
    }

    {{{ recompile }}}
}

// Final-result slot index (T-th element of sums_*). Caller reads back
// these three positions to recover the MSM result.
const RESULT_SLOT: u32 = {{ num_subtasks }}u;

// Parallel Horner chain. The serial Horner walk
//   result = s[T-1]; for j=T-2..0: result = result*2^cs + s[j]
// expands to:
//   result = Σ_{j=0..T-1} subtask_sums[j] · 2^(j · CHUNK_SIZE)
// (s[T-1] is multiplied by 2^cs once per loop iter, s[T-2] T-2 times,
// ..., s[0] zero times — coefficient of s[j] is 2^(j·cs).)
//
// Each thread tid takes subtask_sums[tid] and applies tid · CHUNK_SIZE
// doublings. A workgroup tree-reduce then sums the T scaled points.
//
// Wall time vs the previous workgroup_size=1 design: each thread runs
// at most (T-1)·CHUNK_SIZE doublings (≤ 240 for production), but all T
// threads execute in lockstep within one Metal SIMD group, replacing
// 240 single-threaded doublings on idle hardware. Roughly 10× speedup.
//
// Workgroup memory: reuses wg_partials[0..T-1]. T ≤ TPB by construction.
@compute
@workgroup_size({{ num_subtasks }})
fn horner_chain(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;

    // Load subtask_sums[tid] and apply tid·CHUNK_SIZE doublings.
    var p: Point;
{{#packed}}
    p.x = load_packed_rw(tid, &sums_x);
    p.y = load_packed_rw(tid, &sums_y);
    p.z = load_packed_rw(tid, &sums_z);
{{/packed}}
{{^packed}}
    p.x = sums_x[tid];
    p.y = sums_y[tid];
    p.z = sums_z[tid];
{{/packed}}
    let n_doublings = tid * CHUNK_SIZE;
    for (var i: u32 = 0u; i < n_doublings; i = i + 1u) {
        p = double_point(p);
    }
    wg_partials[tid] = p;

    workgroupBarrier();

    // Tree reduce: log2(T) passes of halve-and-add.
    var stride: u32 = T / 2u;
    while (stride > 0u) {
        if (tid < stride) {
            wg_partials[tid] = add_points(wg_partials[tid], wg_partials[tid + stride]);
        }
        workgroupBarrier();
        stride = stride / 2u;
    }

    // Thread 0 writes the final result.
    if (tid == 0u) {
        let r = wg_partials[0];
{{#packed}}
        var rx = r.x; var ry = r.y; var rz = r.z;
        store_packed_rw(RESULT_SLOT, &sums_x, &rx);
        store_packed_rw(RESULT_SLOT, &sums_y, &ry);
        store_packed_rw(RESULT_SLOT, &sums_z, &rz);
{{/packed}}
{{^packed}}
        sums_x[RESULT_SLOT] = r.x;
        sums_y[RESULT_SLOT] = r.y;
        sums_z[RESULT_SLOT] = r.z;
{{/packed}}
    }

    {{{ recompile }}}
}
