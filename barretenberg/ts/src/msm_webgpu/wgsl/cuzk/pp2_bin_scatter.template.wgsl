// pp2 preprocess K2 — coarse-bin scatter with workgroup reorder staging.
//
// Dispatch (num_tiles, num_windows): workgroup (tile, window) routes its
// tile's digits into per-(window, coarse-bin) segments of `binned`, replacing
// the old transpose scatter's one-random-4B-write-per-point (each write
// dirtied its own cache line — ~8x effective write amplification on phone
// GPUs). Points are processed in rounds of ROUND_PTS: each round bin-sorts
// its entries into a workgroup-shared reorder buffer, then copies the buffer
// out LINEARLY — consecutive threads write consecutive addresses inside each
// bin run (avg run = ROUND_PTS / BINS_P ≥ a cache line), so the DRAM sees
// coalesced bursts instead of isolated words.
//
// Destination cursors come from the K1.5-scanned bin_counts matrix at
// [window][bin][tile] — this tile's exclusive start within each (window, bin)
// segment — so tiles never contend (no global atomics) and the binned layout
// is fully deterministic at (tile, bin) granularity. In-round order within a
// bin is rank-claim order (racy), which is harmless: K3 re-sorts every bin by
// the low bucket bits anyway, and within-BUCKET order has never been defined
// (the old scatter's shared-cursor claims were racy within a tile too).
//
// Each binned entry packs everything K3 needs — no re-read of `digits`:
//   bits [0..21)  point index within the window's point list
//   bit  21       Booth digit sign
//   bits [22..30) bucket LOW bits (bucket & (2^BIN_SHIFT - 1))
// (n ≤ 2^21 and BIN_SHIFT ≤ 8 by the host-side pp2 activation gate.)

const WG: u32 = {{ workgroup_size }}u;
const BINS_P: u32 = {{ bins_p }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const ROUND_PTS: u32 = 1024u;
const PPT: u32 = ROUND_PTS / WG;
const LOW_MASK: u32 = (1u << BIN_SHIFT) - 1u;

@group(0) @binding(0) var<storage, read>       digits:     array<u32>;
@group(0) @binding(1) var<storage, read>       bin_counts: array<u32>;
@group(0) @binding(2) var<storage, read_write> binned:     array<u32>;
// params[0] = [n, num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len, BW, 0] (unused here)
@group(0) @binding(3) var<uniform>             params:     array<vec4<u32>, 2>;

var<workgroup> reorder: array<u32, 1024>;        // ROUND_PTS
var<workgroup> bin_of: array<u32, 1024>;         // ROUND_PTS
var<workgroup> hist: array<atomic<u32>, {{ bins_p }}>;
var<workgroup> hcount: array<u32, {{ bins_p }}>; // per-round snapshot of hist
var<workgroup> scan_buf: array<u32, {{ bins_p }}>;
var<workgroup> scan_excl: array<u32, {{ bins_p }}>;
var<workgroup> cursors: array<u32, {{ bins_p }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let tile = wid.x;
    let w = wid.y;
    let n = params[0].x;
    let num_tiles = params[0].y;
    let tile_pts = params[0].z;

    // This tile's exclusive write start within each (window, bin) segment.
    for (var s: u32 = tid; s < BINS_P; s = s + WG) {
        cursors[s] = bin_counts[(w * BINS_P + s) * num_tiles + tile];
    }

    let p_lo = tile * tile_pts;
    var p_hi = p_lo + tile_pts;
    if (p_hi > n) { p_hi = n; }
    var tile_n: u32 = 0u;
    if (p_hi > p_lo) { tile_n = p_hi - p_lo; }
    let rounds = (tile_n + ROUND_PTS - 1u) / ROUND_PTS;

    for (var rd: u32 = 0u; rd < rounds; rd = rd + 1u) {
        let base = p_lo + rd * ROUND_PTS;
        for (var s: u32 = tid; s < BINS_P; s = s + WG) {
            atomicStore(&hist[s], 0u);
        }
        workgroupBarrier();

        // Load PPT digits, claim a within-(round, bin) rank each.
        var ent: array<u32, {{ ppt }}>;
        var ebin: array<u32, {{ ppt }}>;
        var erank: array<u32, {{ ppt }}>;
        for (var k: u32 = 0u; k < PPT; k = k + 1u) {
            let p = base + tid + k * WG;
            ebin[k] = 0xFFFFFFFFu;
            if (p < p_hi) {
                let e = digits[w * n + p];
                let bkt = e & 0x7FFFFFFFu;
                let b = bkt >> BIN_SHIFT;
                ebin[k] = b;
                // pack: idx | sign<<21 | low<<22
                ent[k] = p | ((e >> 31u) << 21u) | ((bkt & LOW_MASK) << 22u);
                erank[k] = atomicAdd(&hist[b], 1u);
            }
        }
        workgroupBarrier();

        // Exclusive prefix over the round's bin histogram (Hillis–Steele).
        for (var s: u32 = tid; s < BINS_P; s = s + WG) {
            let h = atomicLoad(&hist[s]);
            hcount[s] = h;
            scan_buf[s] = h;
        }
        workgroupBarrier();
        for (var stride: u32 = 1u; stride < BINS_P; stride = stride * 2u) {
            var x: u32 = 0u;
            if (tid < BINS_P) {
                x = scan_buf[tid];
                if (tid >= stride) {
                    x = x + scan_buf[tid - stride];
                }
            }
            workgroupBarrier();
            if (tid < BINS_P) {
                scan_buf[tid] = x;
            }
            workgroupBarrier();
        }
        for (var s: u32 = tid; s < BINS_P; s = s + WG) {
            scan_excl[s] = scan_buf[s] - hcount[s];
        }
        workgroupBarrier();

        // Place entries bin-sorted into the reorder buffer.
        for (var k: u32 = 0u; k < PPT; k = k + 1u) {
            if (ebin[k] != 0xFFFFFFFFu) {
                let j = scan_excl[ebin[k]] + erank[k];
                reorder[j] = ent[k];
                bin_of[j] = ebin[k];
            }
        }
        workgroupBarrier();

        // Linear write-out: adjacent j → adjacent dst within each bin run.
        var rn = p_hi - base;
        if (rn > ROUND_PTS) { rn = ROUND_PTS; }
        for (var j: u32 = tid; j < rn; j = j + WG) {
            let b = bin_of[j];
            binned[cursors[b] + (j - scan_excl[b])] = reorder[j];
        }
        workgroupBarrier();

        // Advance cursors past this round's entries.
        for (var s: u32 = tid; s < BINS_P; s = s + WG) {
            cursors[s] = cursors[s] + hcount[s];
        }
        workgroupBarrier();
    }

    {{{ recompile }}}
}
