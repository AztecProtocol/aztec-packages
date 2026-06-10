// pp2 preprocess K2 (fused variant) — coarse-bin scatter that RECOMPUTES each
// digit from the scalar bits instead of reading a materialized digit array.
//
// The Booth digit is ~10 ALU ops on data the SIMDs would otherwise idle
// through, while the digit array costs a 10.5 MB write (K1) plus a 10.5 MB
// read (here) at logn=17. Recomputing deletes both — K1 shrinks to a
// count-only pass over the scalars and this kernel's only streams are the
// scalar words in and the binned entries out.
//
// Dispatch (num_windows, num_tiles) — windows on x, the FAST axis, so the
// ~20 workgroups touching one point-tile's scalars (32 KB) run adjacently
// and hit L2 instead of re-streaming DRAM per window.
//
// Everything else matches pp2_bin_scatter: per-round shared reorder staging,
// precomputed per-(tile, window, bin) cursors from the scanned bin_counts,
// linear coalesced write-out, and the packed entry layout
// (idx | sign<<21 | bucket_low<<22) that K3 consumes.

const WG: u32 = {{ workgroup_size }}u;
const BINS_P: u32 = {{ bins_p }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const ROUND_PTS: u32 = 1024u;
const PPT: u32 = ROUND_PTS / WG;
const LOW_MASK: u32 = (1u << BIN_SHIFT) - 1u;
const C: u32 = {{ c }}u;
const MASK_C: u32 = {{ mask_c }}u;
const MASK_C1: u32 = {{ mask_c1 }}u;

@group(0) @binding(0) var<storage, read>       scalars:    array<u32>;
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
    let w = wid.x;
    let tile = wid.y;
    let n = params[0].x;
    let num_tiles = params[0].y;
    let tile_pts = params[0].z;

    // Digit-extraction geometry for this window (uniform per workgroup; the
    // shift amounts below are the same runtime-shift pattern the classic
    // decompose's read_bits shipped on every target). Window 0's lookback is
    // a synthetic 0, handled by the w==0 branch in the round loop.
    let lo_bit = select(w * C - 1u, 0u, w == 0u);
    let word = lo_bit >> 5u;
    let off = lo_bit & 31u;
    let spans = off + C + 1u > 32u && word + 1u < 8u;

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

        // Recompute PPT digits, claim a within-(round, bin) rank each.
        var ent: array<u32, {{ ppt }}>;
        var ebin: array<u32, {{ ppt }}>;
        var erank: array<u32, {{ ppt }}>;
        for (var k: u32 = 0u; k < PPT; k = k + 1u) {
            let p = base + tid + k * WG;
            ebin[k] = 0xFFFFFFFFu;
            if (p < p_hi) {
                var raw: u32;
                if (w == 0u) {
                    raw = (scalars[p * 8u] << 1u) & MASK_C1;
                } else {
                    var v = scalars[p * 8u + word] >> off;
                    if (spans) {
                        v = v | (scalars[p * 8u + word + 1u] << (32u - off));
                    }
                    raw = v & MASK_C1;
                }
                let neg = (raw >> C) & 1u;
                let enc = (raw + 1u) >> 1u;
                let bkt = ((enc - neg) ^ (0u - neg)) & MASK_C;
                let b = bkt >> BIN_SHIFT;
                ebin[k] = b;
                ent[k] = p | (neg << 21u) | ((bkt & LOW_MASK) << 22u);
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
