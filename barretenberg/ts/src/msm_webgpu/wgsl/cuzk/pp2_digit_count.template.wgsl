// pp2 preprocess K1 — fused signed-Booth decompose + coarse-bin count.
//
// One thread per point-PAIR of one union member (a single MSM is the
// 1-member union; dispatch y = member). The window schedule is
// CODE-GENERATED and member-LOCAL: each window's bit extraction uses literal
// word indices, shift amounts and masks (see gen_pp2_digit_count_shader), so
// the 8-word scalars load ONCE into vec4 registers and every digit comes
// from static constant-shift expressions — no dynamic register indexing
// (which spills to local memory on mobile drivers) and no runtime-variable
// shifts (unreliable on Adreno). The classic decompose dispatched one thread
// per (point, window) and re-streamed the whole scalar buffer once per
// window — 20x this kernel's scalar traffic at c=13.
//
// Outputs per (window, point-pair): one u32 of the digit array — two u16
// digits, bucket in bits [0..15) and sign at bit 15 per half (bucket ≤ 2^14,
// so 15+1 bits fit exactly; this is one of the two c ≤ 15 constraints) — at
// the window's global point base (pt_base + w_local·n_k) >> 1, plus a
// workgroup-shared histogram of COARSE BINS (bucket >> BIN_SHIFT) for the
// member's windows. Bin granularity keeps the shared array at NW_local ×
// BINS_P ≤ 4096 entries (16 KB) for every supported c; the flush offsets
// member-local rows into the member's global bin_counts rows, which the
// K1.5 flat exclusive scan turns into the K2 scatter cursors.

@group(0) @binding(0) var<storage, read>       scalars:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> digits:     array<u32>;
@group(0) @binding(2) var<storage, read_write> bin_counts: array<u32>;
// params[0] = [n (unread; debugging aid), num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len (unread; debugging aid), BW, 0] (unused here; shared across pp2)
@group(0) @binding(3) var<uniform>             params:     array<vec4<u32>, 2>;
// Per-member geometry comes from the tables every preprocess kernel already
// uses — no separate member table. Dispatch y = member; the activation gate
// guarantees each member runs the same NW-window local schedule, so the
// member's first global window is member*NW, its scalar base sits in that
// window's WindowDesc row (+6, u32 words; 0 for a single MSM), and its point
// range is that window's point_offsets span.
@group(0) @binding(4) var<storage, read>       window_desc:   array<u32>;
@group(0) @binding(5) var<storage, read>       point_offsets: array<u32>;

const WG: u32 = {{ workgroup_size }}u;
const NW: u32 = {{ num_windows }}u;
const BINS_P: u32 = {{ bins_p }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const HIST_LEN: u32 = {{ hist_len }}u; // NW * BINS_P
const WD_STRIDE: u32 = 8u;

var<workgroup> hist: array<atomic<u32>, {{ hist_len }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let tile = wid.x;
    let num_tiles = params[0].y;
    let tile_pts = params[0].z;

    for (var s: u32 = tid; s < HIST_LEN; s = s + WG) {
        atomicStore(&hist[s], 0u);
    }
    workgroupBarrier();

    let member = wid.y;
    let win_base = member * NW;
    // scalar_base is in u32 words (see decompose_scalars_booth's +6 slot);
    // the gate's 16-byte alignment requirement makes the vec4 shift exact.
    let sbase_v4 = window_desc[win_base * WD_STRIDE + 6u] >> 2u;
    let pt_base = point_offsets[win_base];
    let n_k = point_offsets[win_base + 1u] - pt_base;
    let half_n = n_k >> 1u; // n_k even by the pp2 activation gate
    let pr_lo = (tile * tile_pts) >> 1u; // tile_pts is even by construction
    var pr_hi = pr_lo + (tile_pts >> 1u);
    if (pr_hi > half_n) { pr_hi = half_n; }
    for (var pr: u32 = pr_lo + tid; pr < pr_hi; pr = pr + WG) {
        // Both pair halves always exist: pr < n_k/2 and the host gate
        // requires even n_k (an odd tail would alias adjacent windows' cells).
        let p0 = 2u * pr;
        let p1 = p0 + 1u;
        let sa = scalars[sbase_v4 + 2u * p0];
        let sb = scalars[sbase_v4 + 2u * p0 + 1u];
        let sc = scalars[sbase_v4 + 2u * p1];
        let sd = scalars[sbase_v4 + 2u * p1 + 1u];
{{#windows}}
        {
            // window {{ w }}: c={{ c }}, scalar bits [{{ bit_lo }}, {{ bit_hi }})
            let raw = {{{ raw_expr }}};
            let neg = (raw >> {{ c }}u) & 1u;
            let enc = (raw + 1u) >> 1u;
            let bkt = ((enc - neg) ^ (0u - neg)) & {{ mask_c }}u;
            atomicAdd(&hist[{{ w }}u * BINS_P + (bkt >> BIN_SHIFT)], 1u);
            let raw1 = {{{ raw_expr2 }}};
            let neg1 = (raw1 >> {{ c }}u) & 1u;
            let enc1 = (raw1 + 1u) >> 1u;
            let bkt1 = ((enc1 - neg1) ^ (0u - neg1)) & {{ mask_c }}u;
            atomicAdd(&hist[{{ w }}u * BINS_P + (bkt1 >> BIN_SHIFT)], 1u);
            digits[((pt_base + {{ w }}u * n_k) >> 1u) + pr] = (bkt | (neg << 15u)) | ((bkt1 | (neg1 << 15u)) << 16u);
        }
{{/windows}}
    }
    workgroupBarrier();

    // Flush the member-local histogram rows into the member's GLOBAL window
    // rows of the bin-count matrix (win_base = 0 for a single MSM).
    for (var s: u32 = tid; s < HIST_LEN; s = s + WG) {
        bin_counts[(win_base * BINS_P + s) * num_tiles + tile] = atomicLoad(&hist[s]);
    }

    {{{ recompile }}}
}
