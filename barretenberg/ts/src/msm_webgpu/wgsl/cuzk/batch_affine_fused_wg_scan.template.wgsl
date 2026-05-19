{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> packed_field_funcs }}

// Workgroup-scan fused batch-affine round kernel for v2 MSM.
//
// Mirrors `bench_batch_affine.template.wgsl`'s phases A/B/C/D — TPB
// threads cooperating on BATCH_SIZE = TPB*BS pairs per workgroup with
// one fr_inv_by_a per workgroup — adapted for the MSM pipeline:
//   - storage is packed 8×u32 per field element (vs the bench's
//     BigInt-array storage); conversions happen only at field_load_*
//     and field_store, every kernel-local var holds BigInt limbs
//   - loads are bucket-indirect via `pair_target_meta` (vs the bench's
//     flat `inputs[pair_base + *]`)
//
// PHASES
//   A) Per-thread serial prefix product over BS pairs. Each thread
//      writes its prefix-product chain to `prefix[batch_base + k]`
//      (global storage) and captures `block_total` in a register.
//   B) Workgroup-shared Hillis-Steele forward + backward scan over the
//      TPB block_totals (log2 TPB rounds of mont mul).
//   C) Thread 0 inverts the global product via fr_inv_by_a (ONE per
//      workgroup). Broadcasts to wg_inv_total.
//   D) Each thread back-walks its chunk, recovers inv_dx for each pair
//      from (wg_inv_total * block_excl_prefix * block_excl_suffix *
//      prev_in_chunk_prefix), emits lean affine add, scatters to
//      running_x/y[bucket].
//
// SAFETY
//   The scheduler emits at most one pair per (subtask, bucket) per
//   round. Within a workgroup's BATCH_SIZE slots, every `bucket` is
//   distinct → no intra-workgroup RAW hazard on the running_x/y
//   scatters. Across workgroups in the same subtask: disjoint slot
//   ranges → still distinct buckets. Across subtasks (Z dim): different
//   bucket ranges entirely.
//
// DISPATCH
//   workgroup_size = TPB. Workgroups in X = ceil(n / (TPB*BS)).
//   Workgroups in Z = num_subtasks. The atomicLoad of count_buf and
//   subsequent control flow are uniform within a workgroup (every
//   thread sees the same `n`), but Tint can't prove that — so we never
//   early-return based on it. Instead, partial-batch threads contribute
//   identity to the scan and skip their work loop bodies.

const TPB: u32 = {{ tpb }}u;
const BS: u32 = {{ bs }}u;
const BATCH_SIZE: u32 = {{ batch_size }}u;

@group(0) @binding(0)
var<storage, read> val_idx: array<u32>;
@group(0) @binding(1)
var<storage, read> new_point_x: array<vec4<u32>>;
@group(0) @binding(2)
var<storage, read> new_point_y: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> running_x: array<vec4<u32>>;
@group(0) @binding(4)
var<storage, read_write> running_y: array<vec4<u32>>;
@group(0) @binding(5)
var<storage, read> pair_target_meta: array<u32>;
@group(0) @binding(6)
var<storage, read_write> prefix_buf: array<BigInt>;
@group(0) @binding(7)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = num_columns  (per-subtask pool stride)
// params[1] = input_size   (per-subtask val_idx stride)
@group(0) @binding(8)
var<uniform> params: vec4<u32>;

var<workgroup> wg_fwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_bwd: array<BigInt, {{ tpb }}>;
var<workgroup> wg_inv_total: BigInt;

@compute
@workgroup_size({{ tpb }})
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let wg_idx = wid.x;
    let subtask_idx = wid.z;
    let num_columns = params[0];
    let input_size = params[1];

    let n = atomicLoad(&count_buf[subtask_idx]);
    let batch_base = wg_idx * BATCH_SIZE;

    let pool_base = subtask_idx * num_columns;
    let vi_offset = subtask_idx * input_size;

    let chunk_start = tid * BS;
    let chunk_pool_base = pool_base + batch_base + chunk_start;

    let in_pool = batch_base + chunk_start + BS <= n;

    // Phase A — per-thread serial prefix product. Inin_pool threads
    // (chunk past the live pool) contribute identity (R = Mont 1) so
    // the workgroup scan reads a sane value at every slot.
    var block_total: BigInt = get_r();
    if (in_pool) {
        {
            let k0 = 0u;
            let slot = chunk_pool_base + k0;
            let bucket = pair_target_meta[2u * slot];
            let q_cursor = pair_target_meta[2u * slot + 1u];
            let pt_idx = val_idx[vi_offset + q_cursor];
            var p_x: BigInt = field_load_rw(bucket, &running_x);
            var q_x: BigInt = field_load_ro(pt_idx, &new_point_x);
            var dx: BigInt = fr_sub(&q_x, &p_x);
            prefix_buf[chunk_pool_base + k0] = dx;
            block_total = dx;
        }
        for (var i: u32 = 1u; i < BS; i = i + 1u) {
            let slot = chunk_pool_base + i;
            let bucket = pair_target_meta[2u * slot];
            let q_cursor = pair_target_meta[2u * slot + 1u];
            let pt_idx = val_idx[vi_offset + q_cursor];
            var p_x: BigInt = field_load_rw(bucket, &running_x);
            var q_x: BigInt = field_load_ro(pt_idx, &new_point_x);
            var dx: BigInt = fr_sub(&q_x, &p_x);
            block_total = montgomery_product(&block_total, &dx);
            prefix_buf[chunk_pool_base + i] = block_total;
        }
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B — Hillis-Steele forward + backward inclusive scan.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: BigInt = wg_fwd[tid];
        if (tid >= stride) {
            var lhs: BigInt = wg_fwd[tid - stride];
            fwd_x = montgomery_product(&lhs, &fwd_x);
        }
        var bwd_x: BigInt = wg_bwd[tid];
        if (tid + stride < TPB) {
            var rhs: BigInt = wg_bwd[tid + stride];
            bwd_x = montgomery_product(&bwd_x, &rhs);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        wg_bwd[tid] = bwd_x;
        workgroupBarrier();
    }

    // Phase C — single fr_inv per workgroup.
    if (tid == 0u) {
        var global_total: BigInt = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv_by_a(global_total);
    }
    workgroupBarrier();

    // Phase D — back-walk this thread's chunk, emit lean affine adds.
    if (!in_pool) {
        return;
    }
    var block_excl_prefix: BigInt = get_r();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigInt = get_r();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }
    var inv_global: BigInt = wg_inv_total;
    var inv_acc: BigInt = montgomery_product(&inv_global, &block_excl_prefix);
    inv_acc = montgomery_product(&inv_acc, &block_excl_suffix);

    for (var off: u32 = 0u; off < BS; off = off + 1u) {
        let k = BS - 1u - off;
        let slot = chunk_pool_base + k;
        let bucket = pair_target_meta[2u * slot];
        let q_cursor = pair_target_meta[2u * slot + 1u];
        let pt_idx = val_idx[vi_offset + q_cursor];

        var p_x: BigInt = field_load_rw(bucket, &running_x);
        var p_y: BigInt = field_load_rw(bucket, &running_y);
        var q_x: BigInt = field_load_ro(pt_idx, &new_point_x);
        var q_y: BigInt = field_load_ro(pt_idx, &new_point_y);

        var inv_dx: BigInt;
        if (k > 0u) {
            var prev_prefix: BigInt = prefix_buf[chunk_pool_base + (k - 1u)];
            inv_dx = montgomery_product(&inv_acc, &prev_prefix);
        } else {
            inv_dx = inv_acc;
        }

        var dy: BigInt = fr_sub(&q_y, &p_y);
        var lambda: BigInt = montgomery_product(&dy, &inv_dx);
        var lambda_sq: BigInt = montgomery_product(&lambda, &lambda);
        var t1: BigInt = fr_sub(&lambda_sq, &p_x);
        var r_x: BigInt = fr_sub(&t1, &q_x);
        var dx_back: BigInt = fr_sub(&p_x, &r_x);
        var ldx: BigInt = montgomery_product(&lambda, &dx_back);
        var r_y: BigInt = fr_sub(&ldx, &p_y);

        field_store(bucket, &running_x, &r_x);
        field_store(bucket, &running_y, &r_y);

        if (k > 0u) {
            var dx_k: BigInt = fr_sub(&q_x, &p_x);
            inv_acc = montgomery_product(&inv_acc, &dx_k);
        }
    }

    {{{ recompile }}}
}
