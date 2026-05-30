// Counting-sort prepass kernel B: exclusive prefix-scan the MAX_N-sized
// histogram into bin_offsets; reset bin_write_pos to zero. ALSO compute
// the pair-tree indirect dispatch args by summing the high-N tail of the
// histogram (count > HOT_THRESHOLD) and emitting (ceil(hot/PT_TPB), 1, 1)
// — that way the pair-tree kernel only spawns workgroups actually backed
// by hot buckets, instead of ceil(B_TOTAL / TPB) where >99% of WGs are
// idle.
//
// Single thread (workgroup_size = 1). MAX_N = 64 entries → trivial cost.

const MAX_N: u32 = 64u;
const HOT_THRESHOLD: u32 = 8u;
const PT_TPB: u32 = 64u;
const PERSISTENT_TPB: u32 = 256u;
const CB_TPB: u32 = 64u;
const CB_S: u32 = 8u;

@group(0) @binding(0) var<storage, read>       count_histogram:        array<u32>;
@group(0) @binding(1) var<storage, read_write> bin_offsets:            array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_write_pos:          array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> pt_dispatch_args:       array<u32>;
@group(0) @binding(4) var<storage, read_write> pt_persistent_args:     array<u32>;
@group(0) @binding(5) var<storage, read_write> cb_dispatch_args:       array<u32>;

@compute @workgroup_size(1)
fn main() {
    var sum: u32 = 0u;
    var hot_count: u32 = 0u;
    var cb_count: u32 = 0u;
    for (var i: u32 = 0u; i < MAX_N; i = i + 1u) {
        bin_offsets[i] = sum;
        sum = sum + count_histogram[i];
        atomicStore(&bin_write_pos[i], 0u);
        if (i > HOT_THRESHOLD) { hot_count = hot_count + count_histogram[i]; }
        if (i >= 2u) { cb_count = cb_count + count_histogram[i]; }
    }
    // pt_dispatch_args = (ceil(hot_count / PT_TPB), 1, 1) — used by chunk-pass
    // for pt_init_copy / pt_chunk_build / pt_finalize indirect dispatch.
    let dx = (hot_count + PT_TPB - 1u) / PT_TPB;
    pt_dispatch_args[0] = dx;
    pt_dispatch_args[1] = 1u;
    pt_dispatch_args[2] = 1u;
    pt_persistent_args[0] = 0u;
    pt_persistent_args[1] = 1u;
    pt_persistent_args[2] = 1u;
    // cb_dispatch_args = (ceil(cb_count / (CB_TPB * CB_S)), 1, 1) where
    // cb_count = buckets with N>=2 (combine_batched's active set; filter
    // peels off N=1 copies and active_count only ever counts N>=2 buckets).
    let cb = (cb_count + CB_TPB * CB_S - 1u) / (CB_TPB * CB_S);
    cb_dispatch_args[0] = cb;
    cb_dispatch_args[1] = 1u;
    cb_dispatch_args[2] = 1u;

    {{{ recompile }}}
}
