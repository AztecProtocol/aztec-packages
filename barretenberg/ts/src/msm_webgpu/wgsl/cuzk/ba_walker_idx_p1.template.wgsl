// walker_index wi4 Phase-1 probe P1 — the K1 "sweep" primitive, measured on
// real data before the real kernel is built (WALKER_INDEX_PLAN.md Phase 1).
//
// Reproduces K1's exact memory/compute shape: one workgroup per 4096-slot
// block; each thread owns 16 CONSECUTIVE slots via 4 vec4 loads (so warp
// footprint is contiguous AND thread-prefix ranks equal slot ranks — the
// property the build kernel's layout writes rely on), plus one scalar
// predecessor read for the head probe. Per-thread live reduction, one
// ping-pong shared scan, and a 4-u32 per-block export into pt_scratch —
// rewritten by the pair-tree afterwards, so the probe is correctness-
// neutral. Dispatched indirect at planner_meta[12..14] (= nwg workgroups:
// M_actual = 2*S*nat = 4096*nwg exactly).
//
// params.x = export region offset in pt_scratch (u32 elements)

const NO_BUCKET: u32 = 0xffffffffu;
const TPB: u32 = {{ workgroup_size }}u;
const ITEMS: u32 = 16u;
const BLOCK: u32 = TPB * ITEMS;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const S: u32 = {{ s }}u;

@group(0) @binding(0) var<storage, read>       partial_dest: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> pt_scratch:   array<u32>;
@group(0) @binding(2) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;

var<workgroup> scan_buf: array<u32, {{ double_tpb }}>;
var<workgroup> wg_last_live: atomic<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    let m_actual = 2u * S * planner_meta[3] * THREAD_TPB;
    let win = wid.x * BLOCK + l * ITEMS; // first slot of this thread's window

    if (l == 0u) { atomicStore(&wg_last_live, 0u); }
    workgroupBarrier();

    var live_n: u32 = 0u;
    var head_hint: u32 = 0u;
    var last_live: u32 = 0u;
    if (win < m_actual) {
        // Predecessor of the window (head probe across the window boundary).
        var prev: u32 = NO_BUCKET;
        if (win > 0u) {
            let pv = partial_dest[(win - 1u) / 4u];
            let pj = (win - 1u) % 4u;
            prev = pv[pj];
        }
        for (var q: u32 = 0u; q < ITEMS / 4u; q = q + 1u) {
            let v = partial_dest[win / 4u + q];
            for (var c: u32 = 0u; c < 4u; c = c + 1u) {
                let bid = v[c];
                if (bid != 0u && bid != NO_BUCKET) {
                    live_n = live_n + 1u;
                    last_live = bid;
                    if (prev != bid) { head_hint = head_hint + 1u; }
                }
                prev = bid;
            }
        }
        if (last_live != 0u) { atomicMax(&wg_last_live, last_live); }
    }
    scan_buf[l] = live_n;
    workgroupBarrier();

    var sbase: u32 = 0u;
    for (var stride: u32 = 1u; stride < TPB; stride = stride * 2u) {
        let nb = TPB - sbase;
        var v = scan_buf[sbase + l];
        if (l >= stride) { v = v + scan_buf[sbase + l - stride]; }
        scan_buf[nb + l] = v;
        sbase = nb;
        workgroupBarrier();
    }

    if (l == 0u) {
        let off = params.x + 4u * wid.x;
        pt_scratch[off + 0u] = scan_buf[sbase + TPB - 1u];
        pt_scratch[off + 1u] = atomicLoad(&wg_last_live);
        pt_scratch[off + 2u] = head_hint;
        pt_scratch[off + 3u] = scan_buf[sbase + l];
    }

    {{{ recompile }}}
}
