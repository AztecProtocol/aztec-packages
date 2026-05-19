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
// Each workgroup of TPB threads cooperates on BATCH_SIZE = TPB * BS pairs
// from one subtask's pair pool, performs a workgroup-level Hillis-Steele
// prefix product over per-thread chunks, runs ONE fr_inv_by_a per
// workgroup, then back-walks per-thread emitting lean affine adds. This
// is the design validated in `bench_batch_affine.template.wgsl` (22
// ns/pair at TPB=64, BS=16 on M2) with bucket-indirect loads/stores via
// `pair_target_meta`.
//
// LAYOUT
//   - All field-element variables (workgroup, function, struct fields)
//     are `PackedField` (two vec4<u32>). The 20×13-bit BigInt limb form
//     only exists as a transient local inside mont_p / fr_*_p / fr_inv_p.
//   - Per-subtask pair pool of length n (= count_buf[subtask_idx]) is
//     dispatched as ceil(n / BATCH_SIZE) workgroups in X, num_subtasks
//     in Z. The last workgroup of each subtask may have a partial batch
//     (n - batch_base < BATCH_SIZE); threads with chunk_start >=
//     batch_len contribute identity (R in Mont form) to the scan and
//     skip phase D.
//
// PHASES
//   A) Per-thread serial chunk: walk BS pairs, compute dx = Q.x - P.x
//      and the inclusive prefix product. Captures block_total in a
//      register, writes the per-element prefix into prefix_buf.
//   B) Workgroup Hillis-Steele forward + backward scan over the TPB
//      block_totals (log2 TPB rounds of mont mul).
//   C) Thread 0 inverts the global product via fr_inv_by_a (ONE per
//      workgroup). Broadcasts to wg_inv_total.
//   D) Each thread back-walks its chunk, recovers inv_dx for each pair
//      from (wg_inv_total * block_excl_prefix * block_excl_suffix *
//      prev_in_chunk_prefix), emits lean affine add, scatters to
//      running_x/y[bucket].
//
// SAFETY
//   The scheduler emits at most one pair per (subtask, bucket) per round
//   (see batch_affine_schedule). So within a workgroup's BATCH_SIZE
//   slots, every `bucket` is distinct → no intra-workgroup RAW hazards
//   on the running_x/y scatters. Across workgroups in the same subtask:
//   disjoint slot ranges → still distinct buckets. Across subtasks
//   (Z dim): different bucket ranges entirely.

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
var<storage, read_write> prefix_buf: array<vec4<u32>>;
@group(0) @binding(7)
var<storage, read_write> count_buf: array<atomic<u32>>;

// params[0] = num_columns  (per-subtask pool stride)
// params[1] = input_size   (per-subtask val_idx stride)
@group(0) @binding(8)
var<uniform> params: vec4<u32>;

var<workgroup> wg_fwd: array<PackedField, {{ tpb }}>;
var<workgroup> wg_bwd: array<PackedField, {{ tpb }}>;
var<workgroup> wg_inv_total: PackedField;

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

    var batch_len: u32 = 0u;
    if (batch_base < n) {
        batch_len = min(BATCH_SIZE, n - batch_base);
    }

    let chunk_start = tid * BS;
    var chunk_len: u32 = 0u;
    if (chunk_start < batch_len) {
        let chunk_end = min(chunk_start + BS, batch_len);
        chunk_len = chunk_end - chunk_start;
    }

    // Phase A — per-thread serial prefix product. Threads with
    // chunk_len == 0 contribute identity (R = Mont 1) so the workgroup
    // scan reads a sane value for every slot.
    var block_total: PackedField = get_r_packed();
    if (chunk_len > 0u) {
        let k0 = chunk_start;
        let slot0 = pool_base + batch_base + k0;
        let bucket0 = pair_target_meta[2u * slot0];
        let cursor0 = pair_target_meta[2u * slot0 + 1u];
        let pt_idx0 = val_idx[vi_offset + cursor0];
        let p_x0 = field_load_rw(bucket0, &running_x);
        let q_x0 = field_load_ro(pt_idx0, &new_point_x);
        let dx0 = fr_sub_p(q_x0, p_x0);
        field_store(pool_base + batch_base + k0, &prefix_buf, dx0);
        block_total = dx0;

        for (var i: u32 = 1u; i < BS; i = i + 1u) {
            if (i >= chunk_len) { break; }
            let k = chunk_start + i;
            let slot = pool_base + batch_base + k;
            let bucket = pair_target_meta[2u * slot];
            let cursor = pair_target_meta[2u * slot + 1u];
            let pt_idx = val_idx[vi_offset + cursor];
            let p_x = field_load_rw(bucket, &running_x);
            let q_x = field_load_ro(pt_idx, &new_point_x);
            let dx = fr_sub_p(q_x, p_x);
            block_total = mont_p(block_total, dx);
            field_store(pool_base + batch_base + k, &prefix_buf, block_total);
        }
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    // Phase B — Hillis-Steele forward + backward inclusive scan.
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: PackedField = wg_fwd[tid];
        if (tid >= stride) {
            let lhs = wg_fwd[tid - stride];
            fwd_x = mont_p(lhs, fwd_x);
        }
        var bwd_x: PackedField = wg_bwd[tid];
        if (tid + stride < TPB) {
            let rhs = wg_bwd[tid + stride];
            bwd_x = mont_p(bwd_x, rhs);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        wg_bwd[tid] = bwd_x;
        workgroupBarrier();
    }

    // Phase C — single fr_inv per workgroup. wg_fwd[TPB-1] holds the
    // product of every active (and identity-padding) block_total in the
    // workgroup.
    if (tid == 0u) {
        let global_total = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv_p(global_total);
    }
    workgroupBarrier();

    // Phase D — back-walk this thread's chunk, emit lean affine adds.
    // Threads with chunk_len == 0 (overshoot dispatch or end-of-pool
    // padding) skip the work loop entirely but stay live through any
    // future workgroup-uniform code (currently none — D is the last
    // phase).
    var block_excl_prefix: PackedField = get_r_packed();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: PackedField = get_r_packed();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }
    var inv_acc: PackedField = mont_p(wg_inv_total, block_excl_prefix);
    inv_acc = mont_p(inv_acc, block_excl_suffix);

    for (var off: u32 = 0u; off < BS; off = off + 1u) {
        if (off >= chunk_len) { break; }
        let k = chunk_start + (chunk_len - 1u - off);
        let slot = pool_base + batch_base + k;
        let bucket = pair_target_meta[2u * slot];
        let cursor = pair_target_meta[2u * slot + 1u];
        let pt_idx = val_idx[vi_offset + cursor];

        let p_x = field_load_rw(bucket, &running_x);
        let p_y = field_load_rw(bucket, &running_y);
        let q_x = field_load_ro(pt_idx, &new_point_x);
        let q_y = field_load_ro(pt_idx, &new_point_y);

        var inv_dx: PackedField;
        if (k > chunk_start) {
            let prev = field_load_rw(pool_base + batch_base + (k - 1u), &prefix_buf);
            inv_dx = mont_p(inv_acc, prev);
        } else {
            inv_dx = inv_acc;
        }

        let dy = fr_sub_p(q_y, p_y);
        let lambda = mont_p(dy, inv_dx);
        let lambda_sq = mont_p(lambda, lambda);
        var r_x = fr_sub_p(lambda_sq, p_x);
        r_x = fr_sub_p(r_x, q_x);
        let dx_back = fr_sub_p(p_x, r_x);
        let ldx = mont_p(lambda, dx_back);
        let r_y = fr_sub_p(ldx, p_y);

        field_store(bucket, &running_x, r_x);
        field_store(bucket, &running_y, r_y);

        if (k > chunk_start) {
            let dx_fwd = fr_sub_p(q_x, p_x);
            inv_acc = mont_p(inv_acc, dx_fwd);
        }
    }

    {{{ recompile }}}
}
