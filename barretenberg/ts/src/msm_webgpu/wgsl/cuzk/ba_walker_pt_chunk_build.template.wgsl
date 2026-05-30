// Chunk-pass: emit chunk descriptors for buckets with count > 1.
//
// One thread per hot bucket. For each bucket with current partial count
// > 1, emit ceil(count / CHUNK_SIZE) chunk descriptors. Each descriptor
// is (in_off, count_in_chunk, out_off, bid) — the combine kernel reads
// these and reduces each chunk to 1 partial.
//
// Output layout after pass:
//   pt_off[g]    advances by old_count (shift-layout)
//   pt_count[g]  becomes ceil(old_count / CHUNK_SIZE)
// Bucket converges when count reaches 1 — subsequent passes emit nothing.
//
// Workgroup-aggregated atomic for chunk-slot reservation: one atomic op
// per WG (mobile-friendly).
//
// params.x = HOT_THRESHOLD (= 8u; used to compute cool_end via bin_offsets)

const CHUNK_SIZE: u32 = 16u;
const HOT_THRESHOLD: u32 = 8u;
const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       sorted_active:    array<u32>;
@group(0) @binding(1) var<storage, read>       bin_offsets:      array<u32>;
@group(0) @binding(2) var<storage, read>       active_count:     array<u32>;
@group(0) @binding(3) var<storage, read_write> pt_off:           array<u32>;
@group(0) @binding(4) var<storage, read_write> pt_count:         array<u32>;
@group(0) @binding(5) var<storage, read_write> pt_chunks:        array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> pt_chunks_total:  array<atomic<u32>>;

var<workgroup> wg_local_offsets: array<u32, {{ workgroup_size }}>;
var<workgroup> wg_wg_total:      atomic<u32>;
var<workgroup> wg_base:          u32;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let g = gid.x;
    let l = lid.x;
    let cool_end = bin_offsets[HOT_THRESHOLD + 1u];
    let NUM_ACTIVE = active_count[0];
    let NUM_HOT = NUM_ACTIVE - cool_end;

    // Per-thread: how many chunks does this bucket emit?
    var n_chunks: u32 = 0u;
    var bid: u32 = 0u;
    var cnt: u32 = 0u;
    var in_off: u32 = 0u;
    let live = g < NUM_HOT;
    if (live) {
        bid = sorted_active[cool_end + g];
        cnt = pt_count[g];
        in_off = pt_off[g];
        if (cnt > 1u) {
            n_chunks = (cnt + CHUNK_SIZE - 1u) / CHUNK_SIZE;
        }
    }

    // === Workgroup-aggregated atomic: one global atomicAdd per WG.
    if (l == 0u) { atomicStore(&wg_wg_total, 0u); }
    workgroupBarrier();
    let local_off = atomicAdd(&wg_wg_total, n_chunks);
    wg_local_offsets[l] = local_off;
    workgroupBarrier();
    if (l == 0u) {
        let total = atomicLoad(&wg_wg_total);
        wg_base = atomicAdd(&pt_chunks_total[0], total);
    }
    workgroupBarrier();

    // === Emit chunks at packed slots; advance per-bucket state.
    if (live && n_chunks > 0u) {
        let task_base = wg_base + wg_local_offsets[l];
        let out_off = in_off + cnt;
        for (var j: u32 = 0u; j < n_chunks; j = j + 1u) {
            let chunk_in_off = in_off + j * CHUNK_SIZE;
            let remaining = cnt - j * CHUNK_SIZE;
            var chunk_count: u32 = CHUNK_SIZE;
            if (remaining < CHUNK_SIZE) { chunk_count = remaining; }
            let chunk_out_off = out_off + j;
            pt_chunks[task_base + j] = vec4<u32>(chunk_in_off, chunk_count, chunk_out_off, bid);
        }
        pt_off[g] = out_off;
        pt_count[g] = n_chunks;
    }

    {{{ recompile }}}
}
