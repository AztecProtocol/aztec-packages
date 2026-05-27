// Bucket-accumulate planner stage 1.2b: column-major radix scan.
//
// Corrected digit-major scan for GPU radix sort. One workgroup of 256
// threads, one thread per digit. After this kernel:
//   radix_hist[tile * 256 + digit] = global output offset where this
//   tile's items with this digit should be scattered.
//
// Three phases:
//   A — each thread sums its digit across all tiles → digit_total[d]
//   B — Hillis-Steele inclusive scan of digit_total → cross-digit base
//   C — per-digit column scan across tiles (sequential exclusive prefix)

@group(0) @binding(0) var<storage, read_write> radix_hist:   array<u32>;
@group(0) @binding(1) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(2) var<uniform>             params:       vec4<u32>;

var<workgroup> digit_total: array<u32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let d = lid.x;
    let num_tiles = params.x;

    // Phase A: sum this digit across all tiles.
    var total: u32 = 0u;
    for (var t: u32 = 0u; t < num_tiles; t = t + 1u) {
        total += radix_hist[t * 256u + d];
    }
    digit_total[d] = total;
    workgroupBarrier();

    // Phase B: Hillis-Steele inclusive scan over digit_total.
    for (var stride: u32 = 1u; stride < 256u; stride = stride * 2u) {
        var add_val: u32 = 0u;
        if (d >= stride) {
            add_val = digit_total[d - stride];
        }
        workgroupBarrier();
        if (d >= stride) {
            digit_total[d] = digit_total[d] + add_val;
        }
        workgroupBarrier();
    }
    // digit_total[d] = inclusive prefix sum of all digit totals up to d.
    // Exclusive prefix for digit d = inclusive[d] - own contribution.
    let base = digit_total[d] - total;

    // Phase C: column scan — exclusive prefix within this digit across tiles.
    var running: u32 = base;
    for (var t: u32 = 0u; t < num_tiles; t = t + 1u) {
        let addr = t * 256u + d;
        let old_val = radix_hist[addr];
        radix_hist[addr] = running;
        running += old_val;
    }

    {{{ recompile }}}
}
