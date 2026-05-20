{{> structs }}

// Optimal single-kernel GPU bin-packing planner for the MSM
// bucket-accumulate pair-tree.
//
// One workgroup of TPB threads processes B buckets. Each thread
// handles PER_THREAD = B / TPB buckets via a contiguous slice
// [tid * PER_THREAD, (tid+1) * PER_THREAD).
//
// Phase A — Per-thread local scan
//   For each of its PER_THREAD buckets, compute (pair_count, carry_flag,
//   new_count). Accumulate per-thread totals (sum across the thread's
//   slice). Keep the per-bucket triples in registers; we will re-scan
//   them in Phase B.
//
// Phase B — Workgroup-wide Hillis-Steele scan (3 in parallel)
//   Scan the per-thread totals for pair, carry, new across the TPB
//   threads in shared memory. Result: each thread gets the global
//   prefix sum at the START of its slice (= base offset for its first
//   bucket).
//
// Phase C — Per-thread scatter
//   For each bucket in the thread's slice (in order), use the running
//   thread-local offset to compute global pair_offset_b and write the
//   pair_count[b] chunk_plan entries plus the (optional) carry_plan
//   entry. Update local running offsets. Write new_counts[b] and
//   new_offsets[b] for the next level.
//
// Phase D — One thread writes totals.
//   totals[0] = total_pairs, totals[1] = total_carries,
//   totals[2] = total_new_actives.
//
// Single dispatch. No atomics. No host sync. Scales to B = TPB *
// PER_THREAD (e.g. 256 * 32 = 8192) within one workgroup. Larger B
// requires multi-workgroup scan + global combine (out of scope here).
//
// Compile-time constants:
//   TPB          : workgroup size (e.g. 256)
//   PER_THREAD   : buckets per thread (e.g. 16 for B=4096, 32 for B=8192)
//   PAIR_CAP     : bound on per-bucket pair count (Poisson(λ=32) tail
//                  is ~30; choose 64 for safety)
//   S            : chunk size in pairs (e.g. 16)

const TPB: u32 = {{ workgroup_size }}u;
const PER_THREAD: u32 = {{ per_thread }}u;
const PAIR_CAP: u32 = {{ pair_cap }}u;
const S: u32 = {{ s }}u;

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

// Workgroup-shared running prefixes for the 3 scans.
var<workgroup> pair_scan:  array<u32, {{ workgroup_size }}>;
var<workgroup> carry_scan: array<u32, {{ workgroup_size }}>;
var<workgroup> new_scan:   array<u32, {{ workgroup_size }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let B = params.x;

    // Phase A: per-thread local read + accumulate.
    // Keep PER_THREAD bucket triples in registers (small array<u32>).
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

    // Phase B: workgroup-wide Hillis-Steele inclusive scan over per-
    // thread totals (3 scans interleaved).
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
    // pair_scan[tid] is now inclusive prefix. Exclusive base = inclusive - own_sum.
    var local_pair_off: u32 = pair_scan[tid] - sum_p;
    var local_carry_off: u32 = carry_scan[tid] - sum_c;
    var local_new_off: u32 = new_scan[tid] - sum_n;

    // Phase D: thread 0 writes totals (using the FINAL inclusive scan).
    if (tid == TPB - 1u) {
        totals[0] = pair_scan[tid];
        totals[1] = carry_scan[tid];
        totals[2] = new_scan[tid];
    }

    // Phase C: per-thread scatter.
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tid * PER_THREAD + k;
        if (b >= B) { break; }

        let pc = local_pc[k];
        let cf = local_cf[k];
        let nc = local_nc[k];
        new_counts[b] = nc;
        new_offsets[b] = local_new_off;

        let bucket_base = offsets[b];

        // Pair entries: bounded loop, break at pc.
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

        // Carry entry (if odd count).
        if (cf != 0u) {
            let cs = local_carry_off;
            carry_plan[2u * cs + 0u] = bucket_base + counts[b] - 1u;
            carry_plan[2u * cs + 1u] = local_new_off + pc;
        }

        local_pair_off += pc;
        local_carry_off += cf;
        local_new_off += nc;
    }

    {{{ recompile }}}
}
