// Multi-workgroup v2 planner — Pass 1 of 3: per-tile local scan.
//
// The single-workgroup ba_planner_v2_prod was limited by TPB *
// PER_THREAD >= B; production B = num_columns >= 32768 blows out
// register/shared limits. Splitting the planner into three passes lets
// each workgroup process a fixed TILE = TPB * PER_THREAD bucket window
// regardless of total B, with cross-tile fixup applied in pass 2.
//
// Per WG (wg_id):
//   tile_start = wg_id * TILE
//   tile_end   = min(tile_start + TILE, B)
//   For bucket b in [tile_start, tile_end):
//     pc = counts[b] / 2, cf = counts[b] & 1, nc = pc + cf
//     bucket_local_pair_off[b]  = exclusive scan of pc within the tile
//     bucket_local_carry_off[b] = exclusive scan of cf within the tile
//     bucket_local_new_off[b]   = exclusive scan of nc within the tile
//     new_counts[b]             = nc
//   Last thread writes inclusive sums to:
//     wg_totals[3*wg_id + 0] = total pairs in tile
//     wg_totals[3*wg_id + 1] = total carries in tile
//     wg_totals[3*wg_id + 2] = total new buckets in tile
//
// Pass 2 (ba_planner_v2_mwg_scan) consumes wg_totals to produce per-WG
// global starts; pass 3 (ba_planner_v2_mwg_scatter) reads
// bucket_local_*_off plus the global start to emit the per-bucket
// chunk_plan / scatter_plan / carry_plan entries.

const TPB: u32 = {{ workgroup_size }}u;
const PER_THREAD: u32 = {{ per_thread }}u;
const TILE: u32 = TPB * PER_THREAD;

@group(0) @binding(0) var<storage, read>       counts:                 array<u32>;
@group(0) @binding(1) var<storage, read_write> bucket_local_pair_off:  array<u32>;
@group(0) @binding(2) var<storage, read_write> bucket_local_carry_off: array<u32>;
@group(0) @binding(3) var<storage, read_write> bucket_local_new_off:   array<u32>;
@group(0) @binding(4) var<storage, read_write> wg_totals:              array<u32>;
@group(0) @binding(5) var<storage, read_write> new_counts:             array<u32>;
@group(0) @binding(6) var<uniform>             params:                 vec4<u32>;
// params.x = B (num_columns)

var<workgroup> pair_scan:  array<u32, {{ workgroup_size }}>;
var<workgroup> carry_scan: array<u32, {{ workgroup_size }}>;
var<workgroup> new_scan:   array<u32, {{ workgroup_size }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wgid: vec3<u32>) {
    let tid = lid.x;
    let wg_id = wgid.x;
    let B = params.x;
    let tile_start = wg_id * TILE;

    var local_pc: array<u32, {{ per_thread }}>;
    var local_cf: array<u32, {{ per_thread }}>;
    var local_nc: array<u32, {{ per_thread }}>;
    var sum_p: u32 = 0u;
    var sum_c: u32 = 0u;
    var sum_n: u32 = 0u;
    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tile_start + tid * PER_THREAD + k;
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
    var local_pair_off:  u32 = pair_scan[tid]  - sum_p;
    var local_carry_off: u32 = carry_scan[tid] - sum_c;
    var local_new_off:   u32 = new_scan[tid]   - sum_n;

    for (var k: u32 = 0u; k < PER_THREAD; k = k + 1u) {
        let b = tile_start + tid * PER_THREAD + k;
        if (b >= B) { break; }
        bucket_local_pair_off[b]  = local_pair_off;
        bucket_local_carry_off[b] = local_carry_off;
        bucket_local_new_off[b]   = local_new_off;
        new_counts[b] = local_nc[k];
        local_pair_off  += local_pc[k];
        local_carry_off += local_cf[k];
        local_new_off   += local_nc[k];
    }

    if (tid == TPB - 1u) {
        wg_totals[3u * wg_id + 0u] = pair_scan[tid];
        wg_totals[3u * wg_id + 1u] = carry_scan[tid];
        wg_totals[3u * wg_id + 2u] = new_scan[tid];
    }

    {{{ recompile }}}
}
