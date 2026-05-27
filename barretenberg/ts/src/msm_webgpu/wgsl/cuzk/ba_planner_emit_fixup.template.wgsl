// Bucket-accumulate planner stage 1.6b: emit fixup.
//
// Single thread scans thread_cuts to find split-bucket boundaries and
// builds partial_buckets_list. Each record stores
// (bucket_idx, first_thread, last_thread_exclusive).
//
// A bucket is split if consecutive threads share it (thread t+1 has
// cut_offset > 0 and the same sorted bucket index as part of thread t's
// range). The emit kernel writes partials to deterministic per-thread
// slots: first thread of split → slot 2*t+1, continuation threads → slot 2*t.

const NUM_THREADS: u32 = {{ num_threads }}u;

@group(0) @binding(0) var<storage, read_write> planner_meta:         array<u32>;
@group(0) @binding(1) var<storage, read_write> partial_buckets_list: array<u32>;
@group(0) @binding(2) var<storage, read>       thread_cuts:          array<u32>;
@group(0) @binding(3) var<storage, read>       sorted_bucket_list:   array<u32>;
@group(0) @binding(4) var<storage, read>       sorted_count_list:    array<u32>;

@compute @workgroup_size(1)
fn main() {
    let num_dense = planner_meta[1];
    var sb_count: u32 = 0u;
    var in_split: bool = false;
    var split_first: u32 = 0u;

    if (num_dense > 0u) {
        for (var t: u32 = 1u; t < NUM_THREADS; t = t + 1u) {
            let bucket_sorted = thread_cuts[2u * t];
            let cut_offset = thread_cuts[2u * t + 1u];

            let adds = select(0u, sorted_count_list[bucket_sorted] - 1u, bucket_sorted < num_dense);
            if (cut_offset > 0u && bucket_sorted < num_dense && cut_offset < adds) {
                if (!in_split) {
                    in_split = true;
                    split_first = t - 1u;
                } else {
                    let prev_bucket = thread_cuts[2u * (t - 1u)];
                    if (bucket_sorted != prev_bucket) {
                        let bucket_idx = sorted_bucket_list[thread_cuts[2u * split_first + 2u]];
                        partial_buckets_list[3u * sb_count + 0u] = bucket_idx;
                        partial_buckets_list[3u * sb_count + 1u] = split_first;
                        partial_buckets_list[3u * sb_count + 2u] = t;
                        sb_count += 1u;
                        split_first = t - 1u;
                    }
                }
            } else {
                if (in_split) {
                    let bucket_idx = sorted_bucket_list[thread_cuts[2u * split_first + 2u]];
                    partial_buckets_list[3u * sb_count + 0u] = bucket_idx;
                    partial_buckets_list[3u * sb_count + 1u] = split_first;
                    partial_buckets_list[3u * sb_count + 2u] = t;
                    sb_count += 1u;
                    in_split = false;
                }
            }
        }
        if (in_split) {
            let bucket_idx = sorted_bucket_list[thread_cuts[2u * split_first + 2u]];
            partial_buckets_list[3u * sb_count + 0u] = bucket_idx;
            partial_buckets_list[3u * sb_count + 1u] = split_first;
            partial_buckets_list[3u * sb_count + 2u] = NUM_THREADS;
            sb_count += 1u;
        }
    }

    planner_meta[4] = sb_count;
    planner_meta[16] = max(sb_count, 1u);
    planner_meta[17] = 1u;
    planner_meta[18] = 1u;

    {{{ recompile }}}
}
