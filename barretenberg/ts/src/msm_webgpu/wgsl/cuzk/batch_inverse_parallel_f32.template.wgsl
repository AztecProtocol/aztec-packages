// 23-bit f32 mirror of `batch_inverse_parallel.template.wgsl`. Parallel
// Montgomery batch-inverse with two-level scan (per-thread serial chunk
// + workgroup-level Hillis-Steele). Multi-workgroup mode keyed by
// (wid.z, wid.x) for cross-subtask + intra-subtask parallelism.
//
// BigIntF32 size at NUM_LIMBS_F32 = 12, 4 B per limb = 48 B. Workgroup
// memory at TPB = 64 and two scratch arrays = 2 * 64 * 48 = 6144 B,
// comfortably under the WebGPU 16384 B default limit.

const TPB: u32 = 64u;
const NUM_SUB_WGS: u32 = {{ num_sub_wgs }}u;

@group(0) @binding(0)
var<storage, read> inputs: array<BigIntF32>;

@group(0) @binding(1)
var<storage, read_write> prefix: array<BigIntF32>;

@group(0) @binding(2)
var<storage, read_write> outputs: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read_write> count_buf: array<atomic<u32>>;

@group(0) @binding(4)
var<uniform> params: vec4<u32>;

fn get_r_local_f32() -> BigIntF32 {
    var r: BigIntF32;
{{{ r_limbs_f32 }}}
    return r;
}

var<workgroup> wg_fwd: array<BigIntF32, TPB>;
var<workgroup> wg_bwd: array<BigIntF32, TPB>;
var<workgroup> wg_inv_total: BigIntF32;
var<workgroup> wg_n: u32;
var<workgroup> wg_sub_offset: u32;

@compute
@workgroup_size(64)
fn main(
    @builtin(local_invocation_id) lid: vec3<u32>,
    @builtin(workgroup_id) wid: vec3<u32>,
) {
    let tid = lid.x;
    let pitch = params[0];
    let subtask_idx = wid.z;
    let sub_idx = wid.x;

    if (tid == 0u) {
        let total_n = atomicLoad(&count_buf[subtask_idx]);
        let per_sub = (total_n + NUM_SUB_WGS - 1u) / NUM_SUB_WGS;
        let raw_start = sub_idx * per_sub;
        let raw_end = raw_start + per_sub;
        var sub_n: u32 = 0u;
        if (raw_start < total_n) {
            var clamped_end = raw_end;
            if (clamped_end > total_n) { clamped_end = total_n; }
            sub_n = clamped_end - raw_start;
        }
        wg_sub_offset = raw_start;
        wg_n = sub_n;
    }
    let n = workgroupUniformLoad(&wg_n);
    if (n == 0u) {
        return;
    }
    let sub_offset_in_subtask = wg_sub_offset;

    let slice_offset = subtask_idx * pitch + sub_offset_in_subtask;

    let bs = (n + TPB - 1u) / TPB;
    let chunk_start = tid * bs;
    var chunk_end = chunk_start + bs;
    if (chunk_end > n) {
        chunk_end = n;
    }

    var block_total: BigIntF32 = get_r_local_f32();
    if (chunk_start < n) {
        var acc: BigIntF32 = inputs[slice_offset + chunk_start];
        prefix[slice_offset + chunk_start] = acc;
        for (var k = chunk_start + 1u; k < chunk_end; k = k + 1u) {
            var x: BigIntF32 = inputs[slice_offset + k];
            acc = montgomery_product_f32(&acc, &x);
            prefix[slice_offset + k] = acc;
        }
        block_total = acc;
    }

    wg_fwd[tid] = block_total;
    wg_bwd[tid] = block_total;
    workgroupBarrier();

    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var fwd_x: BigIntF32 = wg_fwd[tid];
        if (tid >= stride) {
            var lhs: BigIntF32 = wg_fwd[tid - stride];
            fwd_x = montgomery_product_f32(&lhs, &fwd_x);
        }
        var bwd_x: BigIntF32 = wg_bwd[tid];
        if (tid + stride < TPB) {
            var rhs: BigIntF32 = wg_bwd[tid + stride];
            bwd_x = montgomery_product_f32(&bwd_x, &rhs);
        }
        workgroupBarrier();
        wg_fwd[tid] = fwd_x;
        wg_bwd[tid] = bwd_x;
        workgroupBarrier();
    }

    if (tid == 0u) {
        var global_total: BigIntF32 = wg_fwd[TPB - 1u];
        wg_inv_total = fr_inv_f32(global_total);
    }
    workgroupBarrier();

    if (chunk_start >= n) {
        return;
    }

    var block_excl_prefix: BigIntF32 = get_r_local_f32();
    if (tid > 0u) {
        block_excl_prefix = wg_fwd[tid - 1u];
    }
    var block_excl_suffix: BigIntF32 = get_r_local_f32();
    if (tid + 1u < TPB) {
        block_excl_suffix = wg_bwd[tid + 1u];
    }

    var inv_global: BigIntF32 = wg_inv_total;
    var inv_acc: BigIntF32 = montgomery_product_f32(&inv_global, &block_excl_prefix);
    inv_acc = montgomery_product_f32(&inv_acc, &block_excl_suffix);

    var k: u32 = chunk_end;
    while (k > chunk_start) {
        k = k - 1u;

        var inv_a_k: BigIntF32;
        if (k > chunk_start) {
            var prev_in_block: BigIntF32 = prefix[slice_offset + k - 1u];
            inv_a_k = montgomery_product_f32(&inv_acc, &prev_in_block);
        } else {
            inv_a_k = inv_acc;
        }
        outputs[slice_offset + k] = inv_a_k;

        if (k > chunk_start) {
            var a_k: BigIntF32 = inputs[slice_offset + k];
            inv_acc = montgomery_product_f32(&inv_acc, &a_k);
        }
    }

    {{{ recompile }}}
}
