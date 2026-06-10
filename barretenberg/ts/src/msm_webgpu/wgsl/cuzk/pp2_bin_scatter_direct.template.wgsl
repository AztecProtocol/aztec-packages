// pp2 preprocess K2 (direct variant) — fused digit recompute + DIRECT
// bin-cursor scatter, no reorder staging.
//
// The staged K2 routes entries through a workgroup reorder buffer to make
// every DRAM write a full line. On Mali that machinery is the bottleneck,
// not the cure: workgroup "shared" memory is emulated through the load-store
// unit/L1, so the staging round-trip + per-round barriers + Hillis–Steele
// cost ~3 ms at logn=17 — far above the kernel's bandwidth floor — in BOTH
// staged variants. This variant deletes all of it: one shared atomic claim
// per point on a per-(window, bin) cursor, one global write. Claims to the
// same bin from concurrently-running lanes produce ADJACENT addresses, so
// the L2's write combining recovers most of the line efficiency the staging
// bought explicitly.
//
// Same contract as the staged kernels: cursors precomputed per (tile,
// window, bin) by the K1.5 scan (no global atomics, deterministic segment
// partition), same packed entry (idx | sign<<21 | bucket_low<<22), windows
// on the fast dispatch axis for scalar L2 reuse.

const WG: u32 = {{ workgroup_size }}u;
const BINS_P: u32 = {{ bins_p }}u;
const BIN_SHIFT: u32 = {{ bin_shift }}u;
const LOW_MASK: u32 = (1u << BIN_SHIFT) - 1u;
const C: u32 = {{ c }}u;
const MASK_C: u32 = {{ mask_c }}u;
const MASK_C1: u32 = {{ mask_c1 }}u;

// from_digits mode: binding 0 is the digit array K1 materialized (coalesced
// 4 B reads, traffic bounded on every device) instead of the raw scalars,
// whose per-window re-reads depend on L2 keeping the tile hot.
@group(0) @binding(0) var<storage, read>       scalars:    array<u32>;
@group(0) @binding(1) var<storage, read>       bin_counts: array<u32>;
@group(0) @binding(2) var<storage, read_write> binned:     array<u32>;
// params[0] = [n, num_tiles, tile_pts, bins_p]
// params[1] = [base_offset, scan_len, BW, 0]
@group(0) @binding(3) var<uniform>             params:     array<vec4<u32>, 2>;
// Per-window point bases: window w's points span [point_offsets[w],
// point_offsets[w+1]) — w·n for a uniform single MSM, the packed Σ n_w
// prefix for a concatenated union, so per-window point counts come from
// here, not params.
@group(0) @binding(4) var<storage, read>       point_offsets: array<u32>;
{{#lean_meta}}
// Lean meta: this kernel also accumulates the per-(window, bucket) counts
// (host clears the buffer per batch, so pad buckets read 0), letting K3 skip
// its whole histogram phase — one fewer full stream over `binned` plus 2 *
// entries shared atomics, in exchange for one global atomic per point here.
@group(0) @binding(5) var<storage, read_write> counts_out: array<atomic<u32>>;
{{/lean_meta}}

var<workgroup> cursors: array<atomic<u32>, {{ bins_p }}>;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
    let tid = lid.x;
    let w = wid.x;
    let tile = wid.y;
    let num_tiles = params[0].y;
    let tile_pts = params[0].z;
    // This window's point range (even base: the pp2 gate requires even
    // per-window point counts for the u16 digit pairing).
    let po = point_offsets[w];
    let n_w = point_offsets[w + 1u] - po;

{{^from_digits}}
    let lo_bit = select(w * C - 1u, 0u, w == 0u);
    let word = lo_bit >> 5u;
    let off = lo_bit & 31u;
    let spans = off + C + 1u > 32u && word + 1u < 8u;
{{/from_digits}}

    for (var s: u32 = tid; s < BINS_P; s = s + WG) {
        atomicStore(&cursors[s], bin_counts[(w * BINS_P + s) * num_tiles + tile]);
    }
    workgroupBarrier();

    let p_lo = tile * tile_pts;
    var p_hi = p_lo + tile_pts;
    if (p_hi > n_w) { p_hi = n_w; }

{{#from_digits}}
    let dig_base = po >> 1u;
{{/from_digits}}
    for (var p: u32 = p_lo + tid; p < p_hi; p = p + WG) {
{{#from_digits}}
        // u16-packed digit pair: bucket in bits [0..15), sign at bit 15;
        // adjacent threads read the same u32 (warp-broadcast, half traffic).
        let e2 = scalars[dig_base + (p >> 1u)];
        let e = select(e2 & 0xFFFFu, e2 >> 16u, (p & 1u) == 1u);
        let bkt = e & 0x7FFFu;
        let neg = e >> 15u;
{{/from_digits}}
{{^from_digits}}
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
{{/from_digits}}
        let pos = atomicAdd(&cursors[bkt >> BIN_SHIFT], 1u);
        binned[pos] = p | (neg << 21u) | ((bkt & LOW_MASK) << 22u);
{{#lean_meta}}
        atomicAdd(&counts_out[w * params[1].z + bkt], 1u);
{{/lean_meta}}
    }

    {{{ recompile }}}
}
