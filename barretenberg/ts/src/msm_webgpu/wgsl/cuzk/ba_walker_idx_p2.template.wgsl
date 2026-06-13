// walker_index wi4 Phase-1 probe P2 — the K2 "build" primitive, measured on
// real data before the real kernel is built (WALKER_INDEX_PLAN.md Phase 1).
//
// Reproduces K2's exact memory/compute shape: read the ≤128 per-block
// exports (in-register base pass), re-read the block's 4096 slots (same
// 4×vec4 consecutive-window pattern as P1), in-WG rank scan (ping-pong),
// then per live slot one STREAMING write at the global live rank (the
// layout write), and per head (~every other live at logn=17) two SCATTERED
// stores keyed by flat_bid (the partial_count / partial_offset stores) plus
// one pair append. All writes land in pt_scratch (rewritten by the
// pair-tree afterwards) with the same distribution the real kernel would
// produce — correctness-neutral.
//
// params.x = export region offset in pt_scratch (u32 elements)
// params.y = layout region offset
// params.z = fb-keyed region offset
// params.w = BW

const NO_BUCKET: u32 = 0xffffffffu;
const TPB: u32 = {{ workgroup_size }}u;
const ITEMS: u32 = 16u;
const BLOCK: u32 = TPB * ITEMS;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const S: u32 = {{ s }}u;
const MAX_BLOCKS: u32 = 128u;
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read>       partial_dest: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> pt_scratch:   array<u32>;
@group(0) @binding(2) var<storage, read>       planner_meta: array<u32>;
@group(0) @binding(3) var<uniform>             params:       vec4<u32>;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

var<workgroup> scan_buf: array<u32, {{ double_tpb }}>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let l = lid.x;
    let m_actual = 2u * S * planner_meta[3] * THREAD_TPB;
    let n_blocks = (m_actual + BLOCK - 1u) / BLOCK;
    let win = wid.x * BLOCK + l * ITEMS;

    // In-register pass over the per-block exports: this block's global live
    // base + carried last-live bid (the real K2 does exactly this).
    var wg_live_base: u32 = 0u;
    var carry_bid: u32 = NO_BUCKET;
    for (var b: u32 = 0u; b < MAX_BLOCKS; b = b + 1u) {
        if (b >= wid.x || b >= n_blocks) { break; }
        let off = params.x + 4u * b;
        wg_live_base = wg_live_base + pt_scratch[off + 0u];
        let lb = pt_scratch[off + 1u];
        if (lb != 0u) { carry_bid = lb; }
    }

    // Re-read the window; record live/head masks (prev-live carried in
    // register — the real rule, costed exactly).
    var bids: array<u32, 16>;
    var live_mask: u32 = 0u;
    var head_mask: u32 = 0u;
    var live_n: u32 = 0u;
    if (win < m_actual) {
        var prev: u32 = NO_BUCKET;
        if (win > 0u) {
            let pv = partial_dest[(win - 1u) / 4u];
            prev = pv[(win - 1u) % 4u];
        }
        var prev_live: u32 = select(NO_BUCKET, prev, prev != 0u && prev != NO_BUCKET);
        if (carry_bid != NO_BUCKET && prev_live == NO_BUCKET) { prev_live = carry_bid; }
        for (var q: u32 = 0u; q < ITEMS / 4u; q = q + 1u) {
            let v = partial_dest[win / 4u + q];
            for (var c: u32 = 0u; c < 4u; c = c + 1u) {
                let j = 4u * q + c;
                let bid = v[c];
                bids[j] = bid;
                if (bid != 0u && bid != NO_BUCKET) {
                    live_mask = live_mask | (1u << j);
                    live_n = live_n + 1u;
                    if (prev_live != bid) { head_mask = head_mask | (1u << j); }
                    prev_live = bid;
                }
            }
        }
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
    var rank = wg_live_base + scan_buf[sbase + l] - live_n;

    // Emission: streaming layout write per live slot; per head, two
    // fb-scattered stores + one pair append.
    let bw = params.w;
    for (var j: u32 = 0u; j < ITEMS; j = j + 1u) {
        if (((live_mask >> j) & 1u) == 0u) { continue; }
        pt_scratch[params.y + rank] = win + j;
        if (((head_mask >> j) & 1u) != 0u) {
            let fb = flat_bid(bids[j], bw);
            pt_scratch[params.z + 2u * fb + 0u] = rank;
            pt_scratch[params.z + 2u * fb + 1u] = bids[j];
            pt_scratch[params.y + m_actual + 2u * rank + 0u] = bids[j];
            pt_scratch[params.y + m_actual + 2u * rank + 1u] = rank;
        }
        rank = rank + 1u;
    }

    {{{ recompile }}}
}
