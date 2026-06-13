// pp2 preprocess K3 — per-(window, bin) counting sort + final emit.
//
// Dispatch (BINS_P, num_windows): workgroup (bin, window) owns one (window,
// coarse-bin) segment of `binned` (bounds = adjacent cells of the K1.5-
// scanned bin_counts matrix; the flat sentinel terminates the last segment)
// and finishes the job the coarse split started:
//
//   phase A  stream the segment, histogram the LOW bucket bits into a
//            workgroup-shared 2^BIN_SHIFT-counter histogram;
//   meta     exclusive-scan the histogram → per-bucket starts; emit
//            active_counts / active_offsets for every bucket the bin covers
//            (including count-0 pads — byte-identical to csr_to_v2_meta's
//            full coverage, so no buffer clear is needed);
//   phase B  re-stream the segment, claim each entry's slot with a shared
//            per-bucket cursor, and write the FINAL l0 entry
//            ((idx + base_offset) | sign<<31) — csr_to_v2_active_sums'
//            base-offset fold happens here, which is what deletes that
//            whole copy pass.
//
// The two-phase chunked stream works for ANY segment size — a profile-E
// giant bucket just means more chunks — so there is no shared-capacity
// overflow path. Shared usage is ~3 KB (LOWS ≤ 256 counters), keeping
// occupancy high. Phase B's writes land in per-bucket runs (avg segment_len /
// LOWS ≥ a cache line), so the "scatter" is line-granular, not word-granular.
//
// Within-bucket order is rank-claim order — undefined, as it has always been
// (the old transpose scatter's within-tile shared-cursor claims were racy);
// bucket sums are order-independent group elements, so every downstream
// consumer only needs the segment partition, counts and offsets, which are
// deterministic.

const WG: u32 = {{ workgroup_size }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const LOWS: u32 = {{ lows }}u; // 1 << BIN_SHIFT
const IDX_MASK: u32 = 0x1FFFFFu; // bits [0..21) — binned-entry point index
const LOW_MASK: u32 = LOWS - 1u;

@group(0) @binding(0) var<storage, read>       binned:      array<u32>;
@group(0) @binding(1) var<storage, read>       bin_counts:  array<u32>;
@group(0) @binding(2) var<storage, read_write> l0_out:      array<u32>;
@group(0) @binding(3) var<storage, read_write> counts_out:  array<u32>;
@group(0) @binding(4) var<storage, read_write> offsets_out: array<u32>;
// params[0] = [n (unread; debugging aid), num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len (unread; debugging aid), BW, 0]
@group(0) @binding(5) var<uniform>             params:      array<vec4<u32>, 2>;

var<workgroup> hist: array<atomic<u32>, {{ lows }}>;
var<workgroup> hcount: array<u32, {{ lows }}>;
var<workgroup> scan_buf: array<u32, {{ lows }}>;
var<workgroup> cursor: array<atomic<u32>, {{ lows }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let bin = wid.x;
    let w = wid.y;
    let num_tiles = params[0].y;
    let bins_p = params[0].w;
    let base_offset = params[1].x;
    let bw = params[1].z;

    // Segment bounds from adjacent scanned cells; the (last, last) segment's
    // end cell is the sentinel at bin_counts[scan_len].
    let seg_base = bin_counts[(w * bins_p + bin) * num_tiles];
    let seg_end = bin_counts[(w * bins_p + bin + 1u) * num_tiles];

    for (var s: u32 = tid; s < LOWS; s = s + WG) {
        atomicStore(&hist[s], 0u);
    }
    workgroupBarrier();

    // Phase A: low-bits histogram of the whole segment.
    for (var i: u32 = seg_base + tid; i < seg_end; i = i + WG) {
        let low = (binned[i] >> 22u) & LOW_MASK;
        atomicAdd(&hist[low], 1u);
    }
    workgroupBarrier();

    // Exclusive prefix over LOWS counters (Hillis–Steele).
    for (var s: u32 = tid; s < LOWS; s = s + WG) {
        let h = atomicLoad(&hist[s]);
        hcount[s] = h;
        scan_buf[s] = h;
    }
    workgroupBarrier();
    for (var stride: u32 = 1u; stride < LOWS; stride = stride * 2u) {
        var x: u32 = 0u;
        if (tid < LOWS) {
            x = scan_buf[tid];
            if (tid >= stride) {
                x = x + scan_buf[tid - stride];
            }
        }
        workgroupBarrier();
        if (tid < LOWS) {
            scan_buf[tid] = x;
        }
        workgroupBarrier();
    }
    // scan_buf is now the inclusive scan; per-bucket start = inclusive − own.
    for (var s: u32 = tid; s < LOWS; s = s + WG) {
        let start = scan_buf[s] - hcount[s];
        atomicStore(&cursor[s], start);
        // Bucket meta: counts and GLOBAL slot offsets, every bucket this bin
        // covers (pads beyond the real bucket range emit count 0).
        let bucket = (bin << BIN_SHIFT) + s;
        if (bucket < bw) {
            let id = w * bw + bucket;
            counts_out[id] = hcount[s];
            offsets_out[id] = seg_base + start;
        }
    }
    workgroupBarrier();

    // Phase B: rank-claim each entry's slot, write the FINAL l0 entry.
    for (var i: u32 = seg_base + tid; i < seg_end; i = i + WG) {
        let e = binned[i];
        let low = (e >> 22u) & LOW_MASK;
        let pos = atomicAdd(&cursor[low], 1u);
        let idx = (e & IDX_MASK) + base_offset;
        l0_out[seg_base + pos] = idx | (((e >> 21u) & 1u) << 31u);
    }

    {{{ recompile }}}
}
