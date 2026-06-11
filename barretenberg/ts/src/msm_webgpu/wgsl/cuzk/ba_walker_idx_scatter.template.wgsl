// walker_index v2 — W3: scatter partial slots into the CSR layout, with the
// single-partial red_buf copy inlined.
//
// One thread per partial slot, dispatched indirect at the same exact width
// as W1 (idx_count). For each live slot:
//   - read the bucket's region base from partial_offset[fb] (allocated by W2);
//   - bit 31 set ⇒ this is the bucket's ONLY partial: write the layout entry
//     at the region base (no atomic) and copy the partial point straight to
//     red_buf at the bucket's reduce slot (the v1 filter's count==1 path);
//   - otherwise take a per-bucket cursor via atomicAdd(partial_write_pos[fb])
//     and write the layout entry. In-bucket order is nondeterministic, as in
//     v1 — per-bucket sums are order-independent (exact group arithmetic).
//
// partial_dest is declared read_write only to keep one usage class for the
// A1 arena (red_buf is a colour-mate); it is never written here.
//
// params.x = BW, params.y = M_partials (partials_buf Y-plane stride)

const NO_BUCKET: u32 = 0xffffffffu;
const PG: u32 = 2u;
const SINGLE_FLAG: u32 = 0x80000000u;
const OFFSET_MASK: u32 = 0x7fffffffu;
const THREAD_TPB: u32 = {{ thread_tpb }}u;
const S: u32 = {{ s }}u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

@group(0) @binding(0) var<storage, read_write> partial_dest:      array<u32>;
@group(0) @binding(1) var<storage, read>       partial_offset:    array<u32>;
@group(0) @binding(2) var<storage, read_write> partial_write_pos: array<atomic<u32>>;
{{^ptree_desc}}
@group(0) @binding(3) var<storage, read_write> partial_layout:    array<u32>;
{{/ptree_desc}}
{{#ptree_desc}}
// Pair-tree variant: partial_layout is addressed through the A2 arena
// monolith (arena_off.y) so partial_count (arena_off.x) is readable from
// the same rw binding (mixed ro+rw of one buffer is illegal), and the
// scatter also emits the per-position descriptors the tree levels read
// (rel, rem = count - rel — both static across levels, since in-place
// level writes never move a partial between positions):
//   desc[pos]            = rel
//   desc[params.y + pos] = rem
@group(0) @binding(3) var<storage, read_write> arena_a2:          array<u32>;
@group(0) @binding(10) var<storage, read_write> desc_buf:         array<u32>;
@group(0) @binding(11) var<uniform>             arena_off:        vec4<u32>;
{{/ptree_desc}}
@group(0) @binding(4) var<storage, read>       partials_buf:      array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> red_buf:           array<vec4<u32>>;
@group(0) @binding(6) var<storage, read>       planner_meta:      array<u32>;
@group(0) @binding(7) var<storage, read>       window_desc:       array<u32>;
@group(0) @binding(8) var<uniform>             params:            vec4<u32>;
@group(0) @binding(9) var<uniform>             batch_offset:      vec4<u32>;

const WD_STRIDE: u32 = 8u;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }
fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    let m_actual = 2u * S * planner_meta[3] * THREAD_TPB;
    if (slot >= m_actual) { return; }
    let bid = partial_dest[slot];
    if (bid == 0u || bid == NO_BUCKET) { return; }
    let fb = flat_bid(bid, params.x);
    let po = partial_offset[fb];
    let off = po & OFFSET_MASK;
    if ((po & SINGLE_FLAG) != 0u) {
{{^ptree_desc}}
        partial_layout[off] = slot;
{{/ptree_desc}}
{{#ptree_desc}}
        // Singles never enter the tree (copied to red_buf below and not
        // in the active list) — no descriptor needed.
        arena_a2[arena_off.y + off] = slot;
{{/ptree_desc}}
        // Single partial — copy straight to red_buf (v1 filter's fast path).
        let window = bid >> WBID_SHIFT;
        let mag = bid & WBID_MAG_MASK;
        let red_slot = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
        let M_partials = params.y;
        let bx = PG * red_slot;
        red_buf[bx + 0u] = partials_buf[PG * slot + 0u];
        red_buf[bx + 1u] = partials_buf[PG * slot + 1u];
        let by = PG * batch_offset.z + PG * red_slot;
        red_buf[by + 0u] = partials_buf[PG * M_partials + PG * slot + 0u];
        red_buf[by + 1u] = partials_buf[PG * M_partials + PG * slot + 1u];
    } else {
        let pos = atomicAdd(&partial_write_pos[fb], 1u);
{{^ptree_desc}}
        partial_layout[off + pos] = slot;
{{/ptree_desc}}
{{#ptree_desc}}
        arena_a2[arena_off.y + off + pos] = slot;
        let cnt = arena_a2[arena_off.x + fb];
        desc_buf[off + pos] = pos;
        desc_buf[params.y + off + pos] = cnt - pos;
{{/ptree_desc}}
    }

    {{{ recompile }}}
}
