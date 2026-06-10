// pp2 preprocess K2 — direct bin-cursor scatter over the u16 digit array.
//
// The universal composition (WebGPU cannot identify hardware, so one
// algorithm must hold up everywhere): every input is a bounded coalesced
// stream — the u16-packed digits K1 materialized (no bet on L2 keeping
// scalars hot, unlike recomputing digits per window) — and the only
// non-stream cost is ONE workgroup-shared atomic claim per point (no reorder
// staging, which priced in workgroup memory being real SRAM and lost ~3 ms
// on cache-emulated Mali). Claims to the same bin from concurrently-running
// lanes land on adjacent addresses, so L2 write combining recovers most of
// the line efficiency staging bought explicitly.
//
// Dispatch (num_tiles, num_windows) — tiles on the fast axis, so adjacent
// workgroups stream adjacent digit tiles of the same window. Destination
// cursors come from the
// K1.5-scanned bin_counts matrix at [window][bin][tile] — this tile's
// exclusive start within each (window, bin) segment — so tiles never
// contend and the segment partition is deterministic. In-bin order is
// claim order (racy), which is harmless: K3 re-sorts every bin by the low
// bucket bits, and within-BUCKET order has never been defined.
//
// Each binned entry packs everything K3 needs:
//   bits [0..21)  point index within the window's point list
//   bit  21       Booth digit sign
//   bits [22..30) bucket LOW bits (bucket & (2^BIN_SHIFT - 1))
// (n ≤ 2^20 and BIN_SHIFT ≤ 8 by the host-side pp2 activation gate.)

const WG: u32 = {{ workgroup_size }}u;
const BINS_P: u32 = {{ bins_p }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const LOW_MASK: u32 = (1u << BIN_SHIFT) - 1u;

// The u16 digit array K1 materialized: one u32 per point-PAIR per window,
// bucket in bits [0..15) and sign at bit 15 per half.
@group(0) @binding(0) var<storage, read>       digits:     array<u32>;
@group(0) @binding(1) var<storage, read>       bin_counts: array<u32>;
@group(0) @binding(2) var<storage, read_write> binned:     array<u32>;
// params[0] = [n, num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len, BW, 0]
@group(0) @binding(3) var<uniform>             params:     array<vec4<u32>, 2>;
// Per-window point bases: window w's points span [point_offsets[w],
// point_offsets[w+1]) — w·n for a uniform single MSM, the packed Σ n_w
// prefix for a concatenated union.
@group(0) @binding(4) var<storage, read>       point_offsets: array<u32>;

var<workgroup> cursors: array<atomic<u32>, {{ bins_p }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let tile = wid.x;
    let w = wid.y;
    let num_tiles = params[0].y;
    let tile_pts = params[0].z;
    // This window's point range (even base: the pp2 gate requires even
    // per-window point counts for the u16 digit pairing).
    let po = point_offsets[w];
    let n_w = point_offsets[w + 1u] - po;

    // This tile's exclusive write start within each (window, bin) segment.
    for (var s: u32 = tid; s < BINS_P; s = s + WG) {
        atomicStore(&cursors[s], bin_counts[(w * BINS_P + s) * num_tiles + tile]);
    }
    workgroupBarrier();

    let p_lo = tile * tile_pts;
    var p_hi = p_lo + tile_pts;
    if (p_hi > n_w) { p_hi = n_w; }

    let dig_base = po >> 1u;
    for (var p: u32 = p_lo + tid; p < p_hi; p = p + WG) {
        // u16-packed digit pair: adjacent threads read the same u32
        // (warp-broadcast, half the read traffic of u32 digits).
        let e2 = digits[dig_base + (p >> 1u)];
        let e = select(e2 & 0xFFFFu, e2 >> 16u, (p & 1u) == 1u);
        let bkt = e & 0x7FFFu;
        let neg = e >> 15u;
        let pos = atomicAdd(&cursors[bkt >> BIN_SHIFT], 1u);
        binned[pos] = p | (neg << 21u) | ((bkt & LOW_MASK) << 22u);
    }

    {{{ recompile }}}
}
