{{> structs }}

// Production GPU bin-packing planner for the v2 pair-tree integration.
//
// Same algorithm as ba_planner_v2_bench (one workgroup of TPB threads,
// per-thread local scan, workgroup-wide Hillis-Steele scan over the
// three running sums, per-thread scatter) but extends the totals
// output with the indirect-dispatch counts the production marshal /
// disjoint / scatter / carry kernels need:
//
//   totals[0] = total_pairs
//   totals[1] = total_carries
//   totals[2] = total_new
//   totals[3] = num_chunks   = max(1, (total_pairs + S - 1) / S)
//   totals[4] = marshal/disjoint/scatter dispatch X (= ceil(num_chunks / WGI))
//   totals[5] = 1
//   totals[6] = 1
//   totals[7] = carry dispatch X (= ceil(total_carries / WGI))
//   totals[8] = 1
//   totals[9] = 1
//
// The four prod-variant downstream kernels (ba_marshal_pairs_prod,
// ba_pair_disjoint_tree_prod, ba_scatter_pairs_prod, ba_carry_copy_prod)
// read num_chunks and total_carries from this same totals storage
// buffer so a single planner dispatch fully drives the level's runtime
// shape with zero wasted-pad-chunk compute. The host orchestrator
// reuses the totals buffer as the indirect-dispatch source via
// dispatchWorkgroupsIndirect(totals, 16) for marshal/disjoint/scatter
// (totals u32 indices 4..6) and dispatchWorkgroupsIndirect(totals, 28)
// for carry (totals u32 indices 7..9).
//
// Compile-time constants:
//   TPB          : workgroup size (e.g. 256)
//   PER_THREAD   : buckets per thread
//   PAIR_CAP     : per-bucket pair-count bound
//   S            : chunk size in pairs
//   WGI          : downstream kernel workgroup size — must match the
//                  workgroup_size of ba_marshal_pairs_prod /
//                  ba_pair_disjoint_tree_prod / ba_scatter_pairs_prod /
//                  ba_carry_copy_prod.

const TPB: u32 = {{ workgroup_size }}u;
const PER_THREAD: u32 = {{ per_thread }}u;
const PAIR_CAP: u32 = {{ pair_cap }}u;
const S: u32 = {{ s }}u;
const WGI: u32 = {{ wgi }}u;

@group(0) @binding(0) var<storage, read>       counts:       array<u32>;
@group(0) @binding(1) var<storage, read>       offsets:      array<u32>;
@group(0) @binding(2) var<storage, read_write> chunk_plan:   array<u32>;
@group(0) @binding(3) var<storage, read_write> scatter_plan: array<u32>;
@group(0) @binding(4) var<storage, read_write> carry_plan:   array<u32>;
@group(0) @binding(5) var<storage, read_write> new_counts:   array<u32>;
@group(0) @binding(6) var<storage, read_write> new_offsets:  array<u32>;
@group(0) @binding(7) var<storage, read_write> totals:       array<u32>;
@group(0) @binding(8) var<uniform>             params:       vec4<u32>;
// params.x = B
// params.y = pad_left_idx  (active_sums index used for chunk_plan tail pad left operand)
// params.z = pad_right_idx (chunk_plan tail pad right operand; must differ from pad_left_idx in x)
// params.w = discard_idx   (scatter_plan tail dst; slot that the next level never reads)

var<workgroup> pair_scan:  array<u32, {{ workgroup_size }}>;
var<workgroup> carry_scan: array<u32, {{ workgroup_size }}>;
var<workgroup> new_scan:   array<u32, {{ workgroup_size }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let B = params.x;

    var local_pc: array<u32, {{ per_thread }}>;
    var local_cf: array<u32, {{ per_thread }}>;
    var local_nc: array<u32, {{ per_thread }}>;
    var sum_p: u32 = 0u;
    var sum_c: u32 = 0u;
    var sum_n: u32 = 0u;
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tid * PER_THREAD + k;
        var pc: u32 = 0u;
        var cf: u32 = 0u;
        var nc: u32 = 0u;
        if (b < B) {
            let n = counts[b];
            pc = n / 2u;
            cf = n & 1u;
            nc = pc + cf;
        }
        local_pc[k] = pc;
        local_cf[k] = cf;
        local_nc[k] = nc;
        sum_p += pc;
        sum_c += cf;
        sum_n += nc;
    }

    pair_scan[tid] = sum_p;
    carry_scan[tid] = sum_c;
    new_scan[tid] = sum_n;
    workgroupBarrier();
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        var add_p: u32 = 0u;
        var add_c: u32 = 0u;
        var add_n: u32 = 0u;
        if (tid >= stride) {
            add_p = pair_scan[tid - stride];
            add_c = carry_scan[tid - stride];
            add_n = new_scan[tid - stride];
        }
        workgroupBarrier();
        if (tid >= stride) {
            pair_scan[tid] = pair_scan[tid] + add_p;
            carry_scan[tid] = carry_scan[tid] + add_c;
            new_scan[tid] = new_scan[tid] + add_n;
        }
        workgroupBarrier();
    }
    var local_pair_off: u32 = pair_scan[tid] - sum_p;
    var local_carry_off: u32 = carry_scan[tid] - sum_c;
    var local_new_off: u32 = new_scan[tid] - sum_n;

    if (tid == TPB - 1u) {
        let tp = pair_scan[tid];
        let tc = carry_scan[tid];
        let tn = new_scan[tid];
        totals[0] = tp;
        totals[1] = tc;
        totals[2] = tn;
        let num_chunks = (tp + S - 1u) / S;
        totals[3] = num_chunks;
        totals[4] = (num_chunks + WGI - 1u) / WGI;
        totals[5] = 1u;
        totals[6] = 1u;
        totals[7] = (tc + WGI - 1u) / WGI;
        totals[8] = 1u;
        totals[9] = 1u;
    }

    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tid * PER_THREAD + k;
        if (b >= B) { break; }

        let pc = local_pc[k];
        let cf = local_cf[k];
        let nc = local_nc[k];
        new_counts[b] = nc;
        new_offsets[b] = local_new_off;

        let bucket_base = offsets[b];

        for (var j: u32 = 0u; j < PAIR_CAP; j = j + 1u) {
            if (j >= pc) { break; }
            let global_slot = local_pair_off + j;
            let chunk_id = global_slot / S;
            let slot_in_chunk = global_slot % S;
            let cp_base = 2u * (chunk_id * S + slot_in_chunk);
            chunk_plan[cp_base + 0u] = bucket_base + 2u * j;
            chunk_plan[cp_base + 1u] = bucket_base + 2u * j + 1u;
            scatter_plan[chunk_id * S + slot_in_chunk] = local_new_off + j;
        }

        if (cf != 0u) {
            let cs = local_carry_off;
            carry_plan[2u * cs + 0u] = bucket_base + counts[b] - 1u;
            carry_plan[2u * cs + 1u] = local_new_off + pc;
        }

        local_pair_off += pc;
        local_carry_off += cf;
        local_new_off += nc;
    }

    workgroupBarrier();
    if (tid == TPB - 1u) {
        let tp = pair_scan[tid];
        let num_chunks = (tp + S - 1u) / S;
        let pad_end = num_chunks * S;
        let pad_left = params.y;
        let pad_right = params.z;
        let discard = params.w;
        for (var i: u32 = tp; i < pad_end; i = i + 1u) {
            chunk_plan[2u * i + 0u] = pad_left;
            chunk_plan[2u * i + 1u] = pad_right;
            scatter_plan[i] = discard;
        }
    }

    {{{ recompile }}}
}
