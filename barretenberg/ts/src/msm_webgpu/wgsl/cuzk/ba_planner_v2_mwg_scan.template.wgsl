// Multi-workgroup v2 planner — Pass 2 of 3: cross-tile scan + totals +
// pad-fill.
//
// Runs as a single small workgroup that scans the per-WG inclusive sums
// emitted by pass 1 (ba_planner_v2_mwg_local) into per-WG exclusive
// global start offsets. Also emits totals[0..9] (grand totals +
// num_chunks + indirect-dispatch triples) and pad-fills the last partial
// chunk of chunk_plan / scatter_plan so the marshal / scatter prod
// kernels never read garbage indices on partial chunks.
//
// Layout of wg_totals: 3 u32 per WG.
//   wg_totals[3*wg + 0] = pair count in WG  (in)  -> pair global start (out)
//   wg_totals[3*wg + 1] = carry count in WG (in)  -> carry global start (out)
//   wg_totals[3*wg + 2] = new count in WG   (in)  -> new global start (out)
//
// Compile-time:
//   TPB    : workgroup size
//   PER_TH : entries per thread (TPB * PER_TH must be >= num_wgs)
//   S      : chunk size in pairs
//   WGI    : downstream kernel workgroup size (must match marshal /
//            disjoint / scatter / carry prod kernels)

const TPB: u32 = {{ workgroup_size }}u;
const PER_TH: u32 = {{ per_thread }}u;
const S: u32 = {{ s }}u;
const WGI: u32 = {{ wgi }}u;

@group(0) @binding(0) var<storage, read_write> wg_totals:    array<u32>;
@group(0) @binding(1) var<storage, read_write> totals:       array<u32>;
@group(0) @binding(2) var<storage, read_write> chunk_plan:   array<u32>;
@group(0) @binding(3) var<storage, read_write> scatter_plan: array<u32>;
@group(0) @binding(4) var<uniform>             params:       vec4<u32>;
// params.x = num_wgs
// params.y = pad_left_idx
// params.z = pad_right_idx
// params.w = discard_idx

var<workgroup> pair_scan:  array<u32, {{ workgroup_size }}>;
var<workgroup> carry_scan: array<u32, {{ workgroup_size }}>;
var<workgroup> new_scan:   array<u32, {{ workgroup_size }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
    let tid = lid.x;
    let num_wgs = params.x;

    var local_p: array<u32, {{ per_thread }}>;
    var local_c: array<u32, {{ per_thread }}>;
    var local_n: array<u32, {{ per_thread }}>;
    var sum_p: u32 = 0u;
    var sum_c: u32 = 0u;
    var sum_n: u32 = 0u;
    for (var k: u32 = 0u; k < PER_TH; k = k + 1u) {
        let w = tid * PER_TH + k;
        var p: u32 = 0u;
        var c: u32 = 0u;
        var n: u32 = 0u;
        if (w < num_wgs) {
            p = wg_totals[3u * w + 0u];
            c = wg_totals[3u * w + 1u];
            n = wg_totals[3u * w + 2u];
        }
        local_p[k] = p;
        local_c[k] = c;
        local_n[k] = n;
        sum_p += p;
        sum_c += c;
        sum_n += n;
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
    var off_p: u32 = pair_scan[tid]  - sum_p;
    var off_c: u32 = carry_scan[tid] - sum_c;
    var off_n: u32 = new_scan[tid]   - sum_n;
    for (var k: u32 = 0u; k < PER_TH; k = k + 1u) {
        let w = tid * PER_TH + k;
        if (w >= num_wgs) { break; }
        wg_totals[3u * w + 0u] = off_p;
        wg_totals[3u * w + 1u] = off_c;
        wg_totals[3u * w + 2u] = off_n;
        off_p += local_p[k];
        off_c += local_c[k];
        off_n += local_n[k];
    }

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

    workgroupBarrier();
    if (tid == 0u) {
        let tp = pair_scan[TPB - 1u];
        let num_chunks = (tp + S - 1u) / S;
        let pad_end = num_chunks * S;
        let pad_left = params.y;
        let pad_right = params.z;
        let discard_idx = params.w;
        for (var i: u32 = tp; i < pad_end; i = i + 1u) {
            chunk_plan[2u * i + 0u] = pad_left;
            chunk_plan[2u * i + 1u] = pad_right;
            scatter_plan[i] = discard_idx;
        }
    }

    {{{ recompile }}}
}
