#include "./scalar_multiplication_fast.hpp"

#include "./pippenger_arena_layout.hpp"
#include "./pippenger_constantine.hpp"
#include "./pippenger_dedup.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/groups/affine_add_packed.hpp"
#include "barretenberg/ecc/groups/element_impl.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include <barretenberg/env/hardware_concurrency.hpp>

#include <algorithm>
#include <atomic>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <span>
#include <vector>

#ifdef __wasm_simd128__
#include <wasm_simd128.h>
#endif

namespace bb::scalar_multiplication {

size_t window_bits_tuning_oversub_factor(size_t n_input)
{
#ifdef __wasm__
    if (n_input <= (size_t{ 1 } << 11)) {
        return 1;
    }
    if (n_input <= (size_t{ 1 } << 15)) {
        return 2;
    }
    return 4;
#else
    static_cast<void>(n_input);
    return 4;
#endif
}

namespace round_parallel_detail {

// Anonymous namespace gives all TU-private helpers in `round_parallel_detail` internal
// linkage (clang-tidy `misc-use-anonymous-namespace`). It is briefly closed and reopened
// around `pippenger_round_parallel_jacobian_fast`, which has external linkage via
// `extern template` declarations in the header.
namespace {

// Bulk-copy a 64-byte affine point (BN254 / Grumpkin layout: 8 × uint64_t).
// On wasm, V8 TurboFan compiles the default struct copy to 8 i64 loads/stores; explicit
// v128 loads/stores halve that and roughly double throughput on random-gather access.
// On native, std::memcpy of a constant-size struct already lowers to 4 × movdqu.
template <typename AffineElement>
[[gnu::always_inline]] inline void copy_affine64(AffineElement& dst, const AffineElement& src) noexcept
{
    static_assert(sizeof(AffineElement) == 64, "copy_affine64 requires 64-byte affine point");
    static_assert(std::is_trivially_copyable_v<AffineElement>,
                  "AffineElement must be trivially copyable for memcpy / SIMD bulk copy "
                  "(also required by the bulk std::memcpy of reduce_chunk output into "
                  "ThreadScratch::window_pts in recursive_affine_bucket_reduce_strided's caller)");
#ifdef __wasm_simd128__
    const auto* s = reinterpret_cast<const v128_t*>(&src);
    auto* d = reinterpret_cast<v128_t*>(&dst);
    const v128_t a = wasm_v128_load(s + 0);
    const v128_t b = wasm_v128_load(s + 1);
    const v128_t c = wasm_v128_load(s + 2);
    const v128_t e = wasm_v128_load(s + 3);
    wasm_v128_store(d + 0, a);
    wasm_v128_store(d + 1, b);
    wasm_v128_store(d + 2, c);
    wasm_v128_store(d + 3, e);
#else
    std::memcpy(&dst, &src, sizeof(AffineElement));
#endif
}

// Constantine signed-Booth window recoder (scalar + SIMD x4 paths) lives in
// pippenger_constantine.hpp.

// `choose_window_bits` and `build_window_schedule` are defined inline in
// `pippenger_arena_layout.hpp` so the test suite can build identical schedules.
// `MAX_SCHEDULE_WINDOWS` and `WindowSchedule` likewise live there.

// Sentinel value for `msb_per_scalar[i]` when scalar i is zero. uint8_t fits the 254 valid msb
// positions (0..253) plus this sentinel; matching `msb_hist` bin layout uses bin 0 = zero count
// so callers index via `msb + 1` (with -1 → bin 0 for the zero case).
inline constexpr uint8_t MSB_ZERO_SENTINEL = 255;

// Batched-affine drain trigger. `tree_reduce_in_place` accumulates same-bucket pair
// candidates into the per-thread `points_to_add` / `pair_dest` scratch and drains via a
// single inversion + N-pair add when the queue hits this size. Sizing trade-off:
//   - higher = larger inversion amortisation = lower per-pair cost,
//   - lower = smaller scratch / less L1 pressure but more drain calls.
// 256 was chosen empirically: keeps `points_to_add` (256 × 64 B = 16 KB) inside L1, is
// well above the ~32-pair amortisation breakeven, and is the value the per-OS-thread
// scratch buffers (`points_to_add`, `inversion_scratch`, `pair_dest`) are sized for.
//
// Deliberately a compile-time constant rather than a per-call parameter: the only sites
// that ever passed a different value were chunks shorter than 256, where the early-drain
// branch never fires anyway (the end-of-loop drain catches the residue). Keeping it
// constexpr lets the compiler turn the per-iter `if (pair_count >= BATCH_CAPACITY)` into
// a compare-against-immediate and fold the drain-trigger condition into the loop shape.
// `BATCH_CAPACITY` is defined in `pippenger_arena_layout.hpp` so the layout struct can
// reference it without depending on this TU.

inline int msb_of_2limb(uint64_t lo, uint64_t hi) noexcept
{
    if (hi != 0) {
        return 64 + 63 - __builtin_clzll(hi);
    }
    if (lo != 0) {
        return 63 - __builtin_clzll(lo);
    }
    return -1;
}

// Accepts the raw `uint64_t[4]` `.data` of `uint256_t` / field elements directly.
inline int msb_of_4limb(const uint64_t (&d)[4]) noexcept // NOLINT(cppcoreguidelines-avoid-c-arrays)
{
    if (d[3] != 0) {
        return 192 + 63 - __builtin_clzll(d[3]);
    }
    if (d[2] != 0) {
        return 128 + 63 - __builtin_clzll(d[2]);
    }
    if (d[1] != 0) {
        return 64 + 63 - __builtin_clzll(d[1]);
    }
    if (d[0] != 0) {
        return 63 - __builtin_clzll(d[0]);
    }
    return -1;
}

inline void record_msb(int msb, uint8_t& dst, std::array<uint32_t, 256>& th_hist) noexcept
{
    dst = (msb < 0) ? MSB_ZERO_SENTINEL : static_cast<uint8_t>(msb);
    ++th_hist[static_cast<size_t>(msb) + 1];
}

/**
 * @brief Build a uniform window schedule.
 */
// `AffineBucketChunkInfo` is defined in `pippenger_arena_layout.hpp` (included above).

/**
 * @brief Per-thread scratch: VIEWS into the per-MSM_fast arena. Each `std::span` is rebound at
 *        the start of every `pippenger_round_parallel` call to point into a slice
 *        of the static arena. The struct never owns storage.
 *
 *        The pippenger_fast function pre-sizes each span large enough for that call's worst
 *        case so kernels can read/write without bounds checks on the hot path.
 */
template <typename Curve> struct ThreadScratch {
    using AffineElement = typename Curve::AffineElement;
    using Element = typename Curve::Element;
    using BaseField = typename Curve::BaseField;
    using BaseParams = typename BaseField::Params;

    // reduce_chunk's tree-reduce buffer. Per level the inner loop walks with a read cursor
    // `i` and a write cursor `next_len ≤ i`, compacting in-place; the next level re-enters
    // the same buffer without a swap.
    // it does not make sense to store `curr_pts` in packed form because of the structure of the algorithm; we walk
    // through marchstep with curr_buckets and perform conditional operations if the digits are the same.
    std::span<AffineElement> curr_pts;
    std::span<uint32_t> curr_buckets;

    // reduce_chunk's batch-affine drain, held packed in SIMD form (VectorField groups). For each
    // same-bucket pair, tree_reduce pushes one point into `lhs` and the other into `rhs`; drain_batch
    // runs the packed affine add and scatters each sum back to curr_pts. `out` shares `lhs`'s backing
    // (the add runs in place), `add_scratch` holds the dx/dy/xsum/inv working buffers, and
    // `pair_dest[k]` is the curr_pts slot the k-th sum is written to.
    bb::VectorAffineElementPushSpan<BaseParams> lhs;
    bb::VectorAffineElementPushSpan<BaseParams> rhs;
    bb::VectorAffineElementPushSpan<BaseParams> out;
    bb::group_elements::BatchAffineAddScratch<BaseParams> add_scratch;
    std::span<uint32_t> pair_dest;

    size_t result_len = 0;

    // Stage 6a seam-overflow buffer: when a sub-chunk emits a partial for a slot whose
    // dense bucket entry is already populated (i.e. the digit's run was split across two
    // sub-chunks), the partial is deferred here and merged at end-of-window via a single
    // Montgomery-batched tree reduce. Reset to length 0 between windows.
    std::span<uint32_t> overflow_slots;
    std::span<AffineElement> overflow_pts;
    size_t overflow_len = 0;

    // Recursive affine bucket reduction scratch (cross-window batched, sparse-aware).
    //   `dense_buckets` holds W chunks worth of dense AffineElement arrays back-to-back.
    //       Layout: dense_buckets[w * affine_bucket_stride + i] for window w and 0-indexed slot i.
    //   `is_present` is a parallel uint8_t array marking non-identity slots (0 = empty, 1 = present).
    //   `affine_bucket_pairs` is the scratch buffer for the real-pairs list (single pass: filtered
    //       inline as candidates are generated, no intermediate candidate buffer).
    //   `affine_bucket_indices` is the scratch index buffer for the doubling kernel.
    //   `affine_bucket_inversion_scratch` is reused for the indexed batch-affine kernels.
    std::span<AffineElement> dense_buckets;
    std::span<uint8_t> is_present;
    std::span<std::pair<uint32_t, uint32_t>> affine_bucket_pairs;
    std::span<uint32_t> affine_bucket_indices;
    std::span<BaseField> affine_bucket_inversion_scratch;
    size_t affine_bucket_stride = 0;
    // Per-window metadata consumed by recursive_affine_bucket_reduce_strided (lo, hi, buckets_padded,
    // empty per window). Filled in the lambda before the call.
    std::span<AffineBucketChunkInfo> chunk_infos;
};

struct MsmArena {
    std::unique_ptr<std::byte[]> local_owner; // NOLINT(cppcoreguidelines-avoid-c-arrays)
    std::byte* data = nullptr;
    uintptr_t base_addr = 0;
    size_t capacity = 0;
    size_t cursor = 0;

    MsmArena(size_t required_bytes, std::span<std::byte> external_arena)
    {
        if (!external_arena.empty() && required_bytes <= external_arena.size()) {
            data = external_arena.data();
            capacity = external_arena.size();
        } else {
            // NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
            local_owner = std::make_unique_for_overwrite<std::byte[]>(required_bytes);
            data = local_owner.get();
            capacity = required_bytes;
        }
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        base_addr = reinterpret_cast<uintptr_t>(data);
    }

    template <typename T> std::span<T> alloc(size_t count) { return bump_alloc<T>(count, cursor, capacity, 0); }

    template <typename T> std::span<T> bump_alloc(size_t count, size_t& local_cursor, size_t bound, size_t base_offset)
    {
        const size_t align = alignof(T);
        const uintptr_t cur_addr = base_addr + base_offset + local_cursor;
        const uintptr_t aligned_addr = (cur_addr + align - 1) & ~(uintptr_t{ align } - 1);
        const size_t aligned_local = static_cast<size_t>(aligned_addr - (base_addr + base_offset));
        const size_t bytes = count * sizeof(T);
        BB_ASSERT_LTE(aligned_local + bytes, bound);
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        T* p = reinterpret_cast<T*>(data + base_offset + aligned_local);
        local_cursor = aligned_local + bytes;
        return std::span<T>{ p, count };
    }
};

template <typename Curve> inline void drain_batch(ThreadScratch<Curve>& s, size_t pair_count) noexcept
{
    if (pair_count == 0) {
        return;
    }
    constexpr size_t W = bb::VectorField<typename Curve::BaseField::Params>::SIZE;

    // Add every queued pair at once: out[k] = lhs[k] + rhs[k], in place (out shares lhs's backing).
    bb::group_elements::batch_affine_add(s.lhs, s.rhs, s.out, s.add_scratch);

    // Scatter each sum back to curr_pts, group-major so to_array() unpacks each VectorField once.
    // pair_dest[k] is the `next_len` value recorded when the k-th pair was queued, which is < the
    // read cursor at that level — so the write lands on an already-read slot (see tree_reduce_in_place).
    size_t k = 0;
    for (size_t g = 0; g < s.out.num_full_vectors(); ++g) {
        const auto xs = s.out.x[g].to_array();
        const auto ys = s.out.y[g].to_array();
        for (size_t l = 0; l < W; ++l, ++k) {
            s.curr_pts[s.pair_dest[k]].x = xs[l];
            s.curr_pts[s.pair_dest[k]].y = ys[l];
        }
    }
    const auto* xt = s.out.x.tail_data();
    const auto* yt = s.out.y.tail_data();
    for (size_t t = 0; t < s.out.tail(); ++t, ++k) {
        s.curr_pts[s.pair_dest[k]].x = xt[t];
        s.curr_pts[s.pair_dest[k]].y = yt[t];
    }

    s.lhs.reset();
    s.rhs.reset();
}

/**
 * @brief In-place tree reduce on (curr_pts, curr_buckets)[0..initial_len).
 *
 *        Per level, walks the buffer with a read cursor `i` and write cursor
 *        `next_len ≤ i`, pairing consecutive same-bucket entries and batching their adds via
 *        Montgomery's trick. The invariant `next_len ≤ i` holds throughout (singletons
 *        advance both by 1; pairs advance i by 2 and next_len by 1) — so every
 *        compacted-write `curr_pts[next_len] = curr_pts[i]` and every drain-write at
 *        `pair_dest[k] = next_len_at_record < i` lands on a slot that has already been
 *        read this level. After the inner pass, the level's output occupies
 *        curr_pts[0..next_len) and we re-enter the loop without needing a swap.
 *
 *        On return, `s.result_len` holds the deduplicated count and the surviving
 *        (point, bucket) pairs occupy curr_pts/curr_buckets[0..result_len).
 */
template <typename Curve> void tree_reduce_in_place(ThreadScratch<Curve>& s, size_t initial_len) noexcept
{
    size_t curr_len = initial_len;

    while (true) {
        size_t i = 0;
        size_t next_len = 0;
        size_t pair_count = 0;
        bool made_pair = false;

        while (i < curr_len) {
            if (i + 1 < curr_len && s.curr_buckets[i] == s.curr_buckets[i + 1]) {
                s.lhs.push_point(s.curr_pts[i].x, s.curr_pts[i].y);
                s.rhs.push_point(s.curr_pts[i + 1].x, s.curr_pts[i + 1].y);
                s.curr_buckets[next_len] = s.curr_buckets[i];
                s.pair_dest[pair_count] = static_cast<uint32_t>(next_len);
                ++next_len;
                ++pair_count;
                i += 2;
                made_pair = true;

                if (pair_count >= BATCH_CAPACITY) {
                    drain_batch<Curve>(s, pair_count);
                    pair_count = 0;
                }
            } else {
                s.curr_pts[next_len] = s.curr_pts[i];
                s.curr_buckets[next_len] = s.curr_buckets[i];
                ++next_len;
                ++i;
            }
        }

        drain_batch<Curve>(s, pair_count);

        if (!made_pair) {
            break;
        }

        curr_len = next_len;
    }

    s.result_len = curr_len;
}

/**
 * @brief Merge per-thread Stage 6a seam-overflow partials back into the per-window dense
 *        bucket buffer.
 *
 *        When a sub-chunk emits a partial for a slot whose dense entry is already
 *        populated (the slot's bucket run was split across sub-chunks), the partial is
 *        appended to (overflow_slots, overflow_pts) instead of overwriting. This routine
 *        builds a tree-reduce input by, for each unique slot, emitting the existing
 *        dense entry as the head followed by all overflow partials for that slot, then
 *        runs `tree_reduce_in_place` once across all affected slots — sharing one
 *        Montgomery batch per tree level instead of one inversion per partial.
 *
 *        Overflow entries arrive in slot-sorted order by construction (sub-chunks process
 *        buckets in sorted order), so no sort is needed. On return, `overflow_len` is
 *        reset to 0.
 */
template <typename Curve>
void merge_overflow(ThreadScratch<Curve>& s, typename Curve::AffineElement* dst_dense) noexcept
{
    if (s.overflow_len == 0) {
        return;
    }

    size_t merge_len = 0;
    size_t i = 0;
    while (i < s.overflow_len) {
        const uint32_t slot = s.overflow_slots[i];
        s.curr_buckets[merge_len] = slot;
        s.curr_pts[merge_len] = dst_dense[slot];
        ++merge_len;
        while (i < s.overflow_len && s.overflow_slots[i] == slot) {
            s.curr_buckets[merge_len] = slot;
            s.curr_pts[merge_len] = s.overflow_pts[i];
            ++merge_len;
            ++i;
        }
    }

    tree_reduce_in_place<Curve>(s, merge_len);

    for (size_t k = 0; k < s.result_len; ++k) {
        dst_dense[s.curr_buckets[k]] = s.curr_pts[k];
    }

    s.overflow_len = 0;
}

/**
 * @brief Tree-reduce one thread's bucket-aligned slice of the bucket-partitioned schedule,
 *        emitting directly into `curr_pts / curr_buckets` for the caller's running-sum pass.
 */
template <typename Curve>
void reduce_chunk(ThreadScratch<Curve>& s,
                  const uint32_t* schedule,
                  const size_t* bucket_start,
                  size_t chunk_lo,
                  size_t chunk_hi,
                  size_t& bucket_cursor,
                  size_t chunk_bucket_hi,
                  std::span<const typename Curve::AffineElement> points,
                  std::span<const typename Curve::AffineElement> dedup_extra_points = {}) noexcept
{
    const size_t chunk_len = chunk_hi - chunk_lo;
    if (chunk_len == 0) {
        s.result_len = 0;
        return;
    }

    BB_ASSERT_LTE(chunk_len, s.curr_pts.size());
    static_assert(BATCH_CAPACITY <= 4096, "BATCH_CAPACITY must fit in pair_dest scratch");

    // Compact entries while loading: dedup non-rep entries (DEDUP_SKIP_BIT set in the
    // schedule entry) carry no contribution — their points are already accumulated
    // into the cluster's combined `extra_points[cid]` emitted at the rep's slot. Skip
    // them to avoid double-counting and to shrink the tree-reduce input.
    size_t valid_len = 0;
    size_t bucket = bucket_cursor;
    size_t pos = chunk_lo;
    while (bucket <= chunk_bucket_hi && pos < chunk_hi) {
        const size_t run_lo = std::max(pos, bucket_start[bucket]);
        const size_t run_hi = std::min(chunk_hi, bucket_start[bucket + 1]);
        if (run_lo >= run_hi) {
            ++bucket;
            continue;
        }

        const uint32_t bucket_u32 = static_cast<uint32_t>(bucket);
        for (size_t i = run_lo; i < run_hi; ++i) {
            // The schedule read is sequential but the point fetch below is a
            // data-dependent random 64-byte load over the SRS span; the loop is branchy
            // enough that hardware runahead alone does not sustain full memory-level
            // parallelism. Prefetching 16 entries ahead recovers 4-10% of MSM wall at
            // n >= 2^18 (EC2 bencher, 16 threads), neutral below. The clamp keeps the
            // address inside `points` for dedup-redirect entries whose payload indexes
            // the smaller extra_points array (harmless wrong-but-mapped line).
            if (i + round_parallel_detail::GATHER_PREFETCH_DIST < chunk_hi) {
                const size_t pf_idx = std::min<size_t>(
                    schedule[i + round_parallel_detail::GATHER_PREFETCH_DIST] & SCHEDULE_INDEX_MASK, points.size() - 1);
                __builtin_prefetch(points.data() + pf_idx, 0, 3);
            }
            const uint32_t e = schedule[i];
            if ((e & DEDUP_SKIP_BIT) != 0) {
                continue; // non-rep: skip, don't consume a curr_pts slot
            }
            const uint32_t raw_idx = e & SCHEDULE_INDEX_MASK;
            const bool neg = (e & SCHEDULE_SIGN_BIT) != 0;
            s.curr_buckets[valid_len] = bucket_u32;
            // SIMD-widened gather: 4 × v128.load on WASM (2× faster than the
            // default 8 × i64.load struct copy on V8 TurboFan); 4 × movdqu on
            // native (already optimal). The conditional negation runs after the
            // copy because Fq::operator-() is a modular subtract, not a bit flip,
            // so it can't be folded into the SIMD load lanes.
            auto& dst_pt = s.curr_pts[valid_len];
            // Dedup redirect: if the redirect bit is set, fetch from the dedup
            // extra-points buffer (combined point for a cluster of duplicate scalars)
            // instead of the original points span. The branch is always-not-taken when
            // dedup is inactive (`dedup_extra_points` empty) and predictably-mostly-taken-or-not
            // when active, since cluster-rep scheduling is uniform per MSM_fast.
            if ((e & DEDUP_REDIRECT_BIT) != 0) {
                copy_affine64(dst_pt, dedup_extra_points[raw_idx]);
            } else {
                copy_affine64(dst_pt, points[raw_idx]);
            }
            if (neg) {
                dst_pt.y = -dst_pt.y;
            }
            ++valid_len;
        }
        pos = run_hi;
        if (pos < chunk_hi) {
            ++bucket;
        }
    }
    bucket_cursor = bucket;

    tree_reduce_in_place<Curve>(s, valid_len);
}

// `ChunkOutput<Curve>` (Stage 6 per-chunk bucket-reduce output) is defined in
// `pippenger_arena_layout.hpp` so the test suite can size the Zone S slot the
// same way the live allocator does.

// `AffineBucketChunkInfo` is defined in `pippenger_arena_layout.hpp` (forward declared
// above at line ~674 for ThreadScratch). It describes one chunk's contribution to the
// cross-window recursive affine bucket reduction (lo/hi digit bounds, buckets_padded,
// empty flag).

/**
 * @brief Inline filter for one (dst, src) candidate pair, called from each phase's
 *        candidate-emission loop. Replaces the previous two-pass `filter_and_batch_add`
 *        function (which gathered all candidates into a buffer and then filtered into a
 *        real-pairs buffer): the inline version handles each candidate as it's generated,
 *        so we never materialise the candidate buffer at all. Single memory pass per phase
 *        iter, half the buffer scratch.
 *
 * Identity / coincidence cases per candidate (handled inline, no batch dispatch):
 *   - src is identity: skip entirely (dst unchanged).
 *   - dst is identity, src is not: copy src into dst (set is_present[dst]=1). No add issued.
 *   - dst and src share the same affine point (Phase A's "copy through empty slots" can
 *     leave two adjacent slots with identical values): issue a Jacobian doubling out-of-band.
 *   - dst and src are inverses (same x, opposite y): result is identity; clear dst.
 * Otherwise emits a "real pair" to `real_pairs[*real_count]` for later batch-affine dispatch.
 *
 * Caller is responsible for invoking `batch_affine_add_indexed_impl` once on the accumulated
 * `real_pairs` array after the candidate-emission loop completes.
 */
template <typename Curve>
[[gnu::always_inline]] inline void try_filter_pair(typename Curve::AffineElement* buckets,
                                                   uint8_t* is_present,
                                                   uint32_t dst_idx,
                                                   uint32_t src_idx,
                                                   std::pair<uint32_t, uint32_t>* real_pairs,
                                                   size_t& real_count) noexcept
{
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;

    if (is_present[src_idx] == 0) {
        return; // src is identity → no-op
    }
    if (is_present[dst_idx] == 0) {
        buckets[dst_idx] = buckets[src_idx]; // dst was identity → just copy
        is_present[dst_idx] = 1;
        return;
    }
    // Edge case: dst.x == src.x. Since both points are on-curve, this means either
    // dst == src (doubling case) or dst == -src (inverse case, result is identity).
    // batch_affine_add_indexed_impl would invert zero here, so handle out-of-band.
    if (buckets[dst_idx].x == buckets[src_idx].x) {
        if (buckets[dst_idx].y == buckets[src_idx].y) {
            // dst == src → result is 2 * dst.
            Element doubled = Element(buckets[dst_idx]);
            doubled.self_dbl();
            buckets[dst_idx] = AffineElement{ doubled };
        } else {
            // dst == -src → result is identity.
            buckets[dst_idx].self_set_infinity();
            is_present[dst_idx] = 0;
        }
        return;
    }
    real_pairs[real_count++] = { dst_idx, src_idx };
}

/**
 * @brief Inline filter for one doubling candidate. If the slot is populated, append its
 *        index to `real_indices`; otherwise skip silently. The caller invokes
 *        `batch_affine_double_indexed_impl` on the accumulated `real_indices` array.
 */
[[gnu::always_inline]] inline void try_filter_idx(const uint8_t* is_present,
                                                  uint32_t idx,
                                                  uint32_t* real_indices,
                                                  size_t& real_count) noexcept
{
    if (is_present[idx] != 0) {
        real_indices[real_count++] = idx;
    }
}

/**
 * @brief Recursive affine bucket reduction (Mitschabaude et al., ZPrize 2022). Pairs
 *        adjacent non-empty buckets and applies one batched-affine round per recursion
 *        level; the per-thread cross-window bucket accumulation step.
 *
 *        For each chunk c (one per window in the batch), computes
 *          R_c = Σ_d B_{c,d}                    (simple sum)
 *          L_c = Σ_d (d - lo_c + 1) · B_{c,d}   (weighted sum)
 *        and writes them into `outputs[w].R / .L`. The caller's `chunk_contribution` then
 *        recovers Σ_d d · B_{c,d} as `L_c + (lo_c - 1) · R_c`.
 *
 *        Algorithm — 4 phases:
 *          A: per-sub-partition suffix sums. Slot `d*L0 + i` ends up holding
 *             Σ_{j=i..L0-1} buckets[w][d*L0 + j].
 *          B: log-recombine sub-partition sums (slot 0, L0, 2L0, ...) into slot 0,
 *             producing R_c. R_c is captured to outputs at this point.
 *          C: doubling pass. Each slot d*L0 (d ≥ 1) is doubled (c0 + level_of_d) times,
 *             where level_of_d is the highest j with 2^j·L0 | d*L0. Combined with the
 *             suffix-sum structure from A, this primes phase D.
 *          D: flat tree-add over the buckets_padded slots; slot 0 ends up holding L_c.
 *
 *        The is_present[] mask filters identity slots out of every batch-affine call, so
 *        sparse chunks don't waste inversions on dead points. Pairs from all windows_in_batch
 *        chunks share the same batch-affine inversion at every phase step (with D
 *        sub-partitions, phase A batches up to windows_in_batch · D pairs).
 *
 * @param s                   per-thread scratch buffers.
 * @param chunk_infos         per-window metadata (lo, hi, buckets_padded, empty); caller-set.
 * @param windows_in_batch    number of chunks in this batch.
 * @param outputs_base        per-window output cells (strided by output_stride); .R / .L are
 *                            written in place.
 *
 * @note Caller must have densified buckets at `s.dense_buckets[w*stride + i]`, set
 *       is_present[w*stride + i] for populated slots, and called
 *       s.ensure_affine_bucket_capacity(windows_in_batch, stride) with
 *       stride = max_w(buckets_padded_w).
 */
template <typename Curve>
void recursive_affine_bucket_reduce_strided(ThreadScratch<Curve>& s,
                                            const AffineBucketChunkInfo* chunk_infos,
                                            size_t windows_in_batch,
                                            ChunkOutput<Curve>* outputs_base,
                                            size_t output_stride) noexcept
{
    using AffineElement = typename Curve::AffineElement;
    using Element = typename Curve::Element;

    auto out_at = [outputs_base, output_stride](size_t w) -> ChunkOutput<Curve>& {
        return outputs_base[w * output_stride];
    };

    if (windows_in_batch == 0) {
        return;
    }

    // Stride is the caller's pre-sized layout width (`s.affine_bucket_stride`, set via
    // `ensure_affine_bucket_capacity`). The densification step in the caller scattered buckets at
    // `w * s.affine_bucket_stride + i`, so we MUST use the same value for our own indexing — any
    // re-derivation that disagrees with the layout would index neighbouring windows. The
    // pre-size already enforces `stride ≥ max_w(buckets_padded_w)` AND `stride ≥ 2` AND
    // `stride is a power of two`, so the trivial-stride fast path and the 4-phase math
    // both stay valid here. Per-window buckets_padded controls how many slots each window walks
    // and is bounded by `stride` — verified below in debug.
    const size_t stride = s.affine_bucket_stride;
    bool any_nonempty = false;
    for (size_t w = 0; w < windows_in_batch; ++w) {
        if (chunk_infos[w].empty == 0) {
            any_nonempty = true;
            BB_ASSERT_LTE(chunk_infos[w].buckets_padded, stride);
        }
    }
    if (!any_nonempty) {
        for (size_t w = 0; w < windows_in_batch; ++w) {
            out_at(w).R = Curve::Group::point_at_infinity;
            out_at(w).L = Curve::Group::point_at_infinity;
        }
        return;
    }

    AffineElement* const buckets = s.dense_buckets.data();
    uint8_t* const is_present = s.is_present.data();

    // Pick L0 (the leaf-partition size). c0 = floor(log2(stride) / 2)
    // gives L0 ≈ sqrt(stride) — balances Phase A batch size (W·D) vs Phase A iter count
    // (L0 - 1). Both L0 and D = stride / L0 must be powers of two.
    BB_ASSERT_GT(stride, size_t{ 0 });
    const size_t c_log = static_cast<size_t>(std::countr_zero(stride));
    BB_ASSERT_EQ(static_cast<size_t>(1) << c_log, stride);
    // Trivial-stride fast paths. The 4-phase algorithm requires c_log ≥ 2 (so we can pick
    // c0 ∈ [1, c_log - 1]) — fall back to direct computation for stride ∈ {1, 2}.
    if (stride <= 2) {
        for (size_t w = 0; w < windows_in_batch; ++w) {
            if (chunk_infos[w].empty != 0) {
                out_at(w).R = Curve::Group::point_at_infinity;
                out_at(w).L = Curve::Group::point_at_infinity;
                continue;
            }
            // Walk the (up to two) populated slots directly.
            const size_t base = w * stride;
            Element R = Curve::Group::point_at_infinity;
            Element L = Curve::Group::point_at_infinity;
            for (size_t i = 0; i < chunk_infos[w].buckets_padded; ++i) {
                if (is_present[base + i] == 0) {
                    continue;
                }
                R += Element(buckets[base + i]);
                L += Element(buckets[base + i]); // weight 1
                if (i == 1) {
                    L += Element(buckets[base + i]); // weight 2 for i=1
                }
            }
            out_at(w).R = R;
            out_at(w).L = L;
        }
        return;
    }

    // Choose c0 = floor(c_log / 2), clamped so that 1 ≤ c0 ≤ c_log - 1.
    size_t c0 = c_log / 2;
    if (c0 == 0) {
        c0 = 1;
    }
    if (c0 >= c_log) {
        c0 = c_log - 1;
    }
    const size_t L0 = static_cast<size_t>(1) << c0;
    const size_t D = stride >> c0; // == stride / L0
    BB_ASSERT_EQ(L0 * D, stride);
    BB_ASSERT_GTE(L0, size_t{ 2 });
    BB_ASSERT_GTE(D, size_t{ 2 });

    auto* const reals = s.affine_bucket_pairs.data();
    auto* const dbl_reals = s.affine_bucket_indices.data();
    auto* const inv_scratch = s.affine_bucket_inversion_scratch.data();

    // Phase A: per-sub-partition running-sum (suffix sums).
    // For each window w and each sub-partition d, walk slots from L0-1 down to 1 within the
    // sub-partition, accumulating buckets[w*stride + d*L0 + l - 1] += buckets[... l]. All
    // (w, d, l) triples for a fixed l share one batch-affine inversion (up to windows_in_batch
    // · D pairs). Short windows (my_M_w < L0) are treated as a single sub-partition of length
    // my_M_w to skip dead candidates; effective per-(w, d) length is min(L0, my_M_w - d·L0).
    {
        for (size_t l = L0 - 1; l >= 1; --l) {
            size_t real_count = 0;
            for (size_t w = 0; w < windows_in_batch; ++w) {
                if (chunk_infos[w].empty != 0) {
                    continue;
                }
                const size_t my_M_w = chunk_infos[w].buckets_padded;
                const size_t base = w * stride;
                if (my_M_w < L0) {
                    // Short window: single sub-partition of effective length `my_M_w`.
                    if (l >= my_M_w) {
                        continue; // l is in the empty-padding region, skip
                    }
                    const uint32_t src = static_cast<uint32_t>(base + l);
                    const uint32_t dst = static_cast<uint32_t>(base + l - 1);
                    try_filter_pair<Curve>(buckets, is_present, dst, src, reals, real_count);
                } else {
                    const size_t my_D = my_M_w >> c0; // ≥ 1
                    for (size_t d = 0; d < my_D; ++d) {
                        const uint32_t src = static_cast<uint32_t>(base + (d * L0) + l);
                        const uint32_t dst = static_cast<uint32_t>(base + (d * L0) + l - 1);
                        try_filter_pair<Curve>(buckets, is_present, dst, src, reals, real_count);
                    }
                }
            }
            if (real_count > 0) {
                bb::group_elements::batch_affine_add_indexed_impl<typename Curve::AffineElement,
                                                                  typename Curve::BaseField>(
                    buckets, reals, real_count, inv_scratch);
            }
        }
    }

    // After Phase A, each window's slot 0 holds the simple sum of its sub-partition 0,
    // and slot d*L0 (d ≥ 1) holds the simple sum of sub-partition d. The other slots within
    // each sub-partition hold suffix sums that Phase D will combine.

    // Phase B: log-recombine sub-partition simple sums into slot 0.
    // For L1 = L0, 2*L0, 4*L0, ..., stride/2: pair (slot 2d*L1, slot (2d+1)*L1).
    {
        size_t L1 = L0;
        while (L1 < stride) {
            size_t real_count = 0;
            const size_t step = 2 * L1;
            for (size_t w = 0; w < windows_in_batch; ++w) {
                if (chunk_infos[w].empty != 0) {
                    continue;
                }
                const size_t my_M = chunk_infos[w].buckets_padded;
                if (step > my_M) {
                    continue;
                }
                const size_t base = w * stride;
                const size_t num_pairs_w = my_M / step;
                for (size_t d = 0; d < num_pairs_w; ++d) {
                    const uint32_t dst = static_cast<uint32_t>(base + ((2 * d) * L1));
                    const uint32_t src = static_cast<uint32_t>(base + (((2 * d) + 1) * L1));
                    try_filter_pair<Curve>(buckets, is_present, dst, src, reals, real_count);
                }
            }
            if (real_count > 0) {
                bb::group_elements::batch_affine_add_indexed_impl<typename Curve::AffineElement,
                                                                  typename Curve::BaseField>(
                    buckets, reals, real_count, inv_scratch);
            }
            L1 *= 2;
        }
    }

    // After Phase B, each window's slot 0 holds Σ_d B_{c,d} = R_c. Save R_c into outputs
    // before Phase D's tree-add overwrites slot 0.
    for (size_t w = 0; w < windows_in_batch; ++w) {
        if (chunk_infos[w].empty != 0) {
            out_at(w).R = Curve::Group::point_at_infinity;
            continue;
        }
        const AffineElement& slot0 = buckets[w * stride];
        if (is_present[w * stride] == 0) {
            out_at(w).R = Curve::Group::point_at_infinity;
        } else {
            out_at(w).R = Element(slot0);
        }
    }

    // Phase C: doublings.
    // The candidate index list for the initial pass is constant across all c0 iters —
    // every slot d*L0 for d ∈ [1, my_D - 1] in every non-empty window. Build the empty-
    // filtered list once and chain c0 doublings on it instead of filtering c0 times.
    // Subsequent levels (L1 = 2*L0, 4*L0, ...) do one doubling per level on level-specific
    // index sets handled separately below.
    {
        size_t real_count = 0;
        for (size_t w = 0; w < windows_in_batch; ++w) {
            if (chunk_infos[w].empty != 0) {
                continue;
            }
            const size_t my_M_w = chunk_infos[w].buckets_padded;
            const size_t my_D = (my_M_w >= L0) ? (my_M_w >> c0) : size_t{ 0 };
            const size_t base = w * stride;
            for (size_t d = 1; d < my_D; ++d) {
                try_filter_idx(is_present, static_cast<uint32_t>(base + (d * L0)), dbl_reals, real_count);
            }
        }
        // c0 chained doublings on the same real list.
        if (real_count > 0) {
            for (size_t j = 0; j < c0; ++j) {
                bb::group_elements::batch_affine_double_indexed_impl<typename Curve::AffineElement,
                                                                     typename Curve::BaseField>(
                    buckets, dbl_reals, real_count, inv_scratch);
            }
        }
    }
    // Successive: at L1 = 2*L0, 4*L0, ..., stride/2: every d ≥ 1 in the sub-partition
    // grid of size `stride / L1` gets one more doubling.
    {
        size_t L1 = 2 * L0;
        while (L1 < stride) {
            size_t real_count = 0;
            for (size_t w = 0; w < windows_in_batch; ++w) {
                if (chunk_infos[w].empty != 0) {
                    continue;
                }
                const size_t my_M = chunk_infos[w].buckets_padded;
                if (L1 >= my_M) {
                    continue; // this window has no sub-partitions at this hierarchy
                }
                const size_t my_D1 = my_M / L1;
                const size_t base = w * stride;
                for (size_t d = 1; d < my_D1; ++d) {
                    try_filter_idx(is_present, static_cast<uint32_t>(base + (d * L1)), dbl_reals, real_count);
                }
            }
            if (real_count > 0) {
                bb::group_elements::batch_affine_double_indexed_impl<typename Curve::AffineElement,
                                                                     typename Curve::BaseField>(
                    buckets, dbl_reals, real_count, inv_scratch);
            }
            L1 *= 2;
        }
    }

    // Phase D: flat tree-add over the buckets_padded slots. For m = 1, 2, 4, ...,
    // buckets_padded/2: pair (slot pos, slot pos+m) for pos = 0, 2m, 4m, ...
    // Once the level's candidate count drops below BATCH_AFFINE_BREAKEVEN, the per-batch
    // inversion overhead exceeds the projective per-add cost; bail and finish in Jacobian.
    constexpr size_t BATCH_AFFINE_BREAKEVEN = 32;
    size_t m = 1;
    while (m < stride) {
        // Live-slot count after this iter: stride / (2m) per window worst-case.
        // Decision: would this iter's batch be too small? Estimate as
        // `windows_in_batch * stride / (2m)` (upper bound on candidates).
        const size_t est_cands_this_iter = windows_in_batch * (stride / (2 * m));
        if (est_cands_this_iter < BATCH_AFFINE_BREAKEVEN) {
            break;
        }
        size_t real_count = 0;
        const size_t step = 2 * m;
        for (size_t w = 0; w < windows_in_batch; ++w) {
            if (chunk_infos[w].empty != 0) {
                continue;
            }
            const size_t my_M = chunk_infos[w].buckets_padded;
            if (m >= my_M) {
                continue;
            }
            const size_t base = w * stride;
            for (size_t pos = 0; pos + m < my_M; pos += step) {
                try_filter_pair<Curve>(buckets,
                                       is_present,
                                       static_cast<uint32_t>(base + pos),
                                       static_cast<uint32_t>(base + pos + m),
                                       reals,
                                       real_count);
            }
        }
        if (real_count > 0) {
            bb::group_elements::batch_affine_add_indexed_impl<typename Curve::AffineElement, typename Curve::BaseField>(
                buckets, reals, real_count, inv_scratch);
        }
        m *= 2;
    }

    // Write L_c. After Phase D's loop, `m` is the level NOT performed (or `stride` if all
    // levels ran). The "live" slots — those holding cumulative tree-sums of consecutive m
    // original buckets each — are {0, m, 2m, 3m, ...} ∩ [0, my_M):
    //   - loop completed (m == stride):  only slot 0 is live; it holds the final L.
    //   - loop broke at level m:         sum the live slots in Jacobian (live_step = m).
    //   - loop broke at m == 1:          every original bucket is still live, sum them all.
    // The Jacobian sum recovers what the unfinished levels would have computed in the
    // batch-affine inner loop.
    for (size_t w = 0; w < windows_in_batch; ++w) {
        if (chunk_infos[w].empty != 0) {
            out_at(w).L = Curve::Group::point_at_infinity;
            continue;
        }
        const size_t base = w * stride;
        const size_t my_M = chunk_infos[w].buckets_padded;
        Element L = Curve::Group::point_at_infinity;
        const size_t live_step = m; // distance between live slots after the affine phase
        for (size_t pos = 0; pos < my_M; pos += live_step) {
            if (is_present[base + pos] != 0) {
                L += Element(buckets[base + pos]);
            }
        }
        out_at(w).L = L;
    }
}

/**
 * @brief Single chunk's contribution to its window's weighted bucket sum.
 *
 * The local Horner pre-bakes weight `(d - lo_t + 1)` onto each bucket-d in chunk t's `L`.
 * Adding the global offset `(lo_t - 1) · R_t` then yields total weight `d` on bucket d, i.e.
 * exactly the window's contribution restricted to the chunk. The window sum is therefore a
 * trivial reduction `Σ_t (L_t + (lo_t - 1) · R_t)` over non-empty chunks — no inter-chunk
 * suffix sum needed. (factor · R) uses double-and-add since `lo_t - 1 < 2^c ≤ 2^20`.
 *
 * Algebraic proof: substituting `H_i = total_running − Σ_{s<i} R_s` into the running-sum
 * formula `Σ L_i + Σ (lo_upper(i) − lo_i) · H_i + (lo_0 − 1) · total_running`, the
 * cross-chunk factor sum telescopes to `hi_max + 1 − lo_first`, which combines with the
 * `(lo_first − 1)` tail to make the `total_running` coefficient `hi_max`. Re-grouping by
 * chunk then drops the suffix-sum structure entirely.
 */
template <typename Curve>
[[gnu::always_inline]] inline typename Curve::Element chunk_contribution(const ChunkOutput<Curve>& chunk) noexcept
{
    using Element = typename Curve::Element;
    if (chunk.empty != 0) {
        return Curve::Group::point_at_infinity;
    }
    const uint32_t k = chunk.lo - 1;
    Element acc = chunk.L;
    if (k != 0) {
        Element p = chunk.R;
        uint32_t kk = k;
        while (kk != 0) {
            if ((kk & 1U) != 0) {
                acc += p;
            }
            kk >>= 1;
            if (kk != 0) {
                p.self_dbl();
            }
        }
    }
    return acc;
}

} // namespace
// `pippenger_round_parallel_jacobian_fast` has external linkage via the `extern template`
// declarations in the header (used by the batched driver). Defined at namespace scope.

/**
 * @brief Small-N fast-path: per-thread Jacobian Pippenger over a partition of the input.
 *
 * Bypasses the round-parallel scaffolding (biased recoding, count histogram, prefix sum,
 * scatter, partition, recursive affine bucket reduction) entirely. Caller must have already
 * converted `scalars` from Montgomery form to standard form. Each thread runs a textbook
 * Pippenger over its slice of the input, with the result summed across threads at the end.
 *
 * Per round (high-bit slice → low-bit slice):
 *   - Reset `present` bitmap.
 *   - For each point in the thread's range, extract the window_bits-wide scalar slice; if
 *     non-zero, either ASSIGN the bucket (Z = 1) on first hit or `Element += AffineElement`
 *     (mixed Jacobian-affine, 7M+4S, no inversion) on subsequent hits.
 *   - Running suffix sum over populated buckets only.
 *   - Double the running result by `window_bits` bits (or `remainder` for the last round)
 *     and add the bucket sum.
 *
 * No batched-affine path, no modular inversions, no count-sort.
 */
// Dispatch `body` across `num_threads` pool workers, running inline when
// single-threaded. The inline branch is what makes a thread-capped
// (max_threads=1) pipeline safe to call from inside a pool worker: the pool is
// not re-entrant (a worker that re-enters bb::parallel_for lazily constructs
// its own thread-local pool), so the capped path must never reach it.
template <typename F> inline void msm_parallel_for(size_t num_threads, F&& body) noexcept
{
    if (num_threads <= 1) {
        if constexpr (std::is_invocable_v<F&, const ThreadChunk&>) {
            body(ThreadChunk{ 0, 1 });
        } else {
            body(size_t{ 0 });
        }
        return;
    }
    bb::parallel_for(num_threads, std::forward<F>(body));
}

template <typename Curve>
[[gnu::noinline]] typename Curve::Element pippenger_round_parallel_jacobian_fast(
    std::span<const typename Curve::ScalarField> scalars,
    std::span<const typename Curve::AffineElement> points,
    size_t min_pts_per_thread_override,
    size_t max_threads) noexcept
{
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;

    const size_t n = scalars.size();
    if (n == 0) {
        return Curve::Group::point_at_infinity;
    }

    constexpr size_t NUM_BITS = ScalarField::modulus.get_msb() + 1;

    // Cost-model window-size selection (mirrors MSM_fast<Curve>::get_optimal_log_num_buckets,
    // with BUCKET_ACCUMULATION_COST = 5 = J-J-add-equiv-muls / J-A-add-equiv-muls ≈ 16/11
    // rounded up). We do NOT delegate to the public method — keeping it self-contained
    // avoids dragging the AffineAddition / AFFINE_TRICK_THRESHOLD machinery in here.
    constexpr size_t BUCKET_ACCUMULATION_COST = 5;
    constexpr uint32_t MAX_C = 18;
    auto cost = [n](uint32_t bits) -> size_t {
        size_t rounds = (NUM_BITS + bits - 1) / bits;
        size_t buckets = size_t{ 1 } << bits;
        return rounds * (n + buckets * BUCKET_ACCUMULATION_COST);
    };
    uint32_t window_bits = 1;
    size_t best_cost = cost(1);
    for (uint32_t b = 2; b <= MAX_C; ++b) {
        const size_t this_cost = cost(b);
        if (this_cost < best_cost) {
            best_cost = this_cost;
            window_bits = b;
        }
    }
    const size_t num_buckets = size_t{ 1 } << window_bits;
    const uint32_t num_rounds = static_cast<uint32_t>((NUM_BITS + window_bits - 1) / window_bits);
    const uint32_t last_round_bits =
        static_cast<uint32_t>(NUM_BITS - (static_cast<size_t>(num_rounds - 1) * window_bits));

    // Each thread owns a num_buckets-sized scratch slice and runs num_rounds passes; below
    // ~256 points per thread the parallel_for wakeup + per-call bucket reset dominate.
    // wasm is forced single-threaded — its barrier cost is much higher than native.
#ifdef __wasm__
    constexpr size_t MIN_PTS_PER_THREAD_DEFAULT = SIZE_MAX;
#else
    constexpr size_t MIN_PTS_PER_THREAD_DEFAULT = 256;
#endif
    const size_t MIN_PTS_PER_THREAD =
        (min_pts_per_thread_override == 0) ? MIN_PTS_PER_THREAD_DEFAULT : min_pts_per_thread_override;
    const size_t hw_threads = max_threads == 0 ? get_num_cpus() : std::min(max_threads, get_num_cpus());
    size_t num_threads = std::min(std::max<size_t>(1, n / MIN_PTS_PER_THREAD), hw_threads);
    if (num_threads == 0) {
        num_threads = 1;
    }

    // Allocate the per-thread bucket + presence scratch ONCE, indexed by tid inside the
    // parallel_for. Allocating inside the lambda body would re-malloc on every call (and
    // on WASM the malloc cost is non-trivial relative to the arithmetic work at small n).
    std::vector<Element> per_thread_results(num_threads);
    std::vector<Element> all_buckets(num_threads * num_buckets);
    std::vector<uint8_t> all_present(num_threads * num_buckets);

    auto thread_body = [&](size_t tid) {
        const size_t lo = (tid * n) / num_threads;
        const size_t hi = ((tid + 1) * n) / num_threads;

        Element* const buckets = all_buckets.data() + (tid * num_buckets);
        uint8_t* const present = all_present.data() + (tid * num_buckets);

        Element result = Curve::Group::point_at_infinity;

        for (uint32_t round = 0; round < num_rounds; ++round) {
            std::memset(present, 0, num_buckets);

            const size_t hi_bit = NUM_BITS - (static_cast<size_t>(round) * window_bits);
            const size_t lo_bit = (hi_bit < window_bits) ? size_t{ 0 } : (hi_bit - window_bits);
            const size_t actual_size = hi_bit - lo_bit;
            const size_t start_limb = lo_bit >> 6;
            const size_t end_limb = hi_bit >> 6;
            const size_t lo_off = lo_bit & 63;
            const size_t lo_bits = (64 - lo_off < actual_size) ? (64 - lo_off) : actual_size;
            const size_t hi_bits = actual_size - lo_bits;
            const uint64_t lo_mask = (lo_bits == 64) ? ~uint64_t{ 0 } : ((uint64_t{ 1 } << lo_bits) - 1);
            const uint64_t hi_mask = (hi_bits == 0) ? uint64_t{ 0 } : ((uint64_t{ 1 } << hi_bits) - 1);

            for (size_t i = lo; i < hi; ++i) {
                const uint64_t s_lo = (scalars[i].data[start_limb] >> lo_off) & lo_mask;
                const uint64_t s_hi = (start_limb != end_limb) ? (scalars[i].data[end_limb] & hi_mask) : uint64_t{ 0 };
                const uint32_t slice = static_cast<uint32_t>(s_lo | (s_hi << lo_bits));
                if (slice == 0) {
                    continue;
                }
                if (present[slice] == 0) {
                    buckets[slice].x = points[i].x;
                    buckets[slice].y = points[i].y;
                    buckets[slice].z = BaseField::one();
                    present[slice] = 1;
                } else {
                    buckets[slice] += points[i];
                }
            }

            // Running suffix sum over populated buckets only.
            //   acc        = Σ_{j ≥ i, present[j]} bucket[j]
            //   bucket_sum = Σ_{i in [first_pop_low, top]} acc(i)   = Σ_k k * bucket[k]
            // Bucket 0 carries no contribution and is never added.
            std::ptrdiff_t top = static_cast<std::ptrdiff_t>(num_buckets) - 1;
            while (top >= 1 && present[static_cast<size_t>(top)] == 0) {
                --top;
            }
            Element bucket_sum = Curve::Group::point_at_infinity;
            if (top >= 1) {
                Element acc = buckets[static_cast<size_t>(top)];
                bucket_sum = acc;
                for (std::ptrdiff_t i = top - 1; i >= 1; --i) {
                    if (present[static_cast<size_t>(i)] != 0) {
                        acc += buckets[static_cast<size_t>(i)];
                    }
                    bucket_sum += acc;
                }
            }

            const uint32_t doublings = (round == num_rounds - 1) ? last_round_bits : window_bits;
            for (uint32_t d = 0; d < doublings; ++d) {
                result.self_dbl();
            }
            result += bucket_sum;
        }

        per_thread_results[tid] = result;
    };

    if (num_threads == 1) {
        thread_body(0);
    } else {
        round_parallel_detail::msm_parallel_for(num_threads, thread_body);
    }

    Element total = per_thread_results[0];
    for (size_t t = 1; t < num_threads; ++t) {
        total += per_thread_results[t];
    }
    return total;
}

// PerWorkerArenaLayout (and its dependencies BATCH_CAPACITY, DEDUP_MAX_CHUNK_MEMBERS,
// AffineBucketChunkInfo) lives in `pippenger_arena_layout.hpp`. Used by the sizer
// below, the live allocator in `pippenger_round_parallel`, and the arena-layout
// regression test.
} // namespace round_parallel_detail

/**
 * @brief Round-parallel Pippenger MSM_fast. Windows process sequentially (high-to-low) but each
 *        window is fully parallel across threads. Windows are processed in batches of
 *        `windows_in_batch` to amortise parallel_for barriers; the batch count is sized at
 *        runtime to fit BATCH_MEM_BUDGET (~32 MiB).
 *
 *        Per batch the stages are:
 *          1. digit extraction   — decode signed digits, tally per-(thread, window) digit counts
 *          2. bucket histogram   — Σ_t counts[w][t][d] + within-digit offsets
 *          3. bucket offsets     — per-window prefix sum
 *          4. digit scatter      — write into digit-partitioned schedules
 *          5. chunk partition    — pick per-thread digit-aligned chunk boundaries
 *          6a. bucket partials   — each thread reduces its chunk into a dense bucket buffer
 *          6b. cross-thread merge — reduce per-thread partials across threads via the
 *                                   recursive affine bucket reduction
 *          7. cross-window combine — Horner over per-window partials into the final point.
 */
#include "./pippenger_fallbacks.hpp"

// Compute the exact arena bytes a single MSM_fast of `n_input` points will need.
// Mirrors the inline budget calculation inside `pippenger_round_parallel`.
// Returns 0 when N is small enough that we'll fall back to the Jacobian fast path
// (no affine arena needed). Exposed (declared in `scalar_multiplication_fast.hpp`)
// so the test suite can exercise the same sizer the live allocator uses.
template <typename Curve>
size_t compute_arena_bytes_for_msm(size_t n_input,
                                   bool external_glv_provided,
                                   bool dedup_active,
                                   size_t max_threads) noexcept
{
    using ScalarField = typename Curve::ScalarField;
    constexpr size_t FULL_NUM_BITS = ScalarField::modulus.get_msb() + 1;
    const size_t hw_threads = max_threads == 0 ? bb::get_num_cpus() : std::min(max_threads, bb::get_num_cpus());

    if (n_input < 4) {
        return 0; // trivial path
    }

    const bool use_glv = external_glv_provided || (n_input <= round_parallel_detail::GLV_SMALL_N_THRESHOLD);
    const size_t n = use_glv ? 2 * n_input : n_input;
    const size_t NUM_BITS = use_glv ? size_t{ 128 } : FULL_NUM_BITS;
    BB_ASSERT_LTE(n,
                  size_t{ round_parallel_detail::SCHEDULE_INDEX_MASK } + 1,
                  "working scalar indices must fit in the 29-bit schedule payload");

    using round_parallel_detail::BATCH_MEM_BUDGET;
    using round_parallel_detail::MIN_AFFINE_THREAD_RATIO;
    using round_parallel_detail::MIN_BATCH_CAPACITY;
    using round_parallel_detail::SUBCHUNK_ENTRIES_CAP;

    // window-bits selection uses the ideal per-window oversubscription factor (not the dispatch lmul).
    const size_t num_logical_threads_for_c = hw_threads * window_bits_tuning_oversub_factor(n_input);
    const size_t window_bits =
        round_parallel_detail::choose_window_bits(n, NUM_BITS, n_input, num_logical_threads_for_c);
    const size_t num_windows = (NUM_BITS + 2 + window_bits - 1) / window_bits;
    const size_t num_buckets = (size_t{ 1 } << (window_bits - 1)) + 1;

    const size_t desired_threads = std::max<size_t>(1, hw_threads);
    const size_t max_threads_for_min_batch = n / MIN_BATCH_CAPACITY;
    const size_t min_threads_allowed =
        std::max<size_t>(1, (desired_threads + MIN_AFFINE_THREAD_RATIO - 1) / MIN_AFFINE_THREAD_RATIO);

    if (max_threads_for_min_batch < min_threads_allowed) {
        return 0; // jacobian-fast fallback, no affine arena
    }

    const size_t num_threads = std::min(desired_threads, std::max<size_t>(1, max_threads_for_min_batch));

    // num_threads sizes the per-task arrays; worker_total sizes the per-OS-thread scratch
    // (FIFO-shared by every task that lands on that OS thread).
    const size_t worker_total_for_budget = num_threads;
    const size_t dense_stride_est = round_parallel_detail::compute_dense_stride(num_buckets, num_threads);

    // Pre-schedule conservative per-window cost: uses `num_buckets` (= 2^(c-1)+1) as the
    // B upper bound. The lambda below recomputes once the actual schedule is built.
    const size_t per_window_bytes = round_parallel_detail::compute_per_window_bytes<Curve>(
        num_threads, num_buckets, n, dense_stride_est, worker_total_for_budget);

    const size_t global_max_overflow_per_window =
        round_parallel_detail::compute_global_max_overflow_per_window(n, num_threads, SUBCHUNK_ENTRIES_CAP);

    const bool inline_glv_double = use_glv && !external_glv_provided;
    const size_t profile_threads = std::max<size_t>(1, hw_threads);
    const size_t phase_one_prologue_bytes =
        round_parallel_detail::compute_phase_one_prologue_bytes(n, use_glv, inline_glv_double, profile_threads);

    const auto phase_a_caps = round_parallel_detail::compute_phase_a_caps(n, num_threads);
    const size_t phase_a_cluster_members_cap = phase_a_caps.members_cap;
    const size_t phase_a_cluster_offsets_cap = phase_a_caps.offsets_cap;

    // Zone W per-worker UNION via the canonical layout walk. Stage 6a, Stage 6b, and
    // Phase A overlay the same per-worker bytes; the struct returns the max-of-layouts
    // (the Stage 6 wpb-dependent tail is added below once `windows_per_batch` is known).
    // Passing `windows_per_batch = 0` here skips the tail — we only need the union bytes
    // for the fixed_overhead → wpb solve.
    const round_parallel_detail::PerWorkerArenaLayout<Curve> union_layout(/*chunk_capacity=*/SUBCHUNK_ENTRIES_CAP,
                                                                          global_max_overflow_per_window,
                                                                          dedup_active,
                                                                          phase_a_cluster_members_cap,
                                                                          phase_a_cluster_offsets_cap,
                                                                          /*windows_per_batch=*/0,
                                                                          /*dense_stride_est=*/0);
    const size_t worker_union_bytes = union_layout.per_worker_union_bytes;

    const size_t fixed_overhead = (worker_union_bytes * worker_total_for_budget) +
                                  round_parallel_detail::window_sums_storage_bytes<Curve>() +
                                  (size_t{ 8 } * (num_threads + 1)) // rebalanced_bucket_lo_partition
                                  + phase_one_prologue_bytes;

    // wpb fallback when fixed_overhead has eaten the BATCH_MEM_BUDGET headroom: the inline
    // `solve_wpb` in `pippenger_round_parallel` returns `W_R` (the whole region) — running
    // every window in a single batch — when `available_budget == 0`. Previously the sizer
    // returned `wpb = 1` and relied on a `worst_case_arena = BATCH_MEM_BUDGET + 32K` floor;
    // that floor failed for large num_threads where fixed_overhead alone exceeds the budget.
    const size_t available_budget_outer =
        (BATCH_MEM_BUDGET > fixed_overhead) ? (BATCH_MEM_BUDGET - fixed_overhead) : size_t{ 0 };
    const size_t windows_per_batch =
        round_parallel_detail::solve_wpb(per_window_bytes, available_budget_outer, num_windows);
    // Dedup state lives in the arena (allocated post-Phase-1, retained through Stage 6a).
    // Worst-case sizes: redirect_lookup is one uint32 per working scalar (4n bytes);
    // extra_points is the fixed DEDUP_MAX_CLUSTERS cap (≈1 MB) regardless of n.
    const size_t dedup_bytes = dedup_active ? ((size_t{ 4 } * n) + (size_t{ sizeof(typename Curve::AffineElement) } *
                                                                    round_parallel_detail::DEDUP_MAX_CLUSTERS))
                                            : size_t{ 0 };
    auto arena_bytes_for_window_layout = [&](size_t bit_budget, size_t wb) {
        const auto layout_sched = round_parallel_detail::build_window_schedule(bit_budget, wb);
        // Uniform schedule: the widest window's bucket count is the per-window cap.
        const size_t B_eff_layout = (size_t{ 1 } << (wb - 1)) + 1;
        const size_t dense_stride_layout = round_parallel_detail::compute_dense_stride(B_eff_layout, num_threads);
        const size_t per_window_bytes_layout = round_parallel_detail::compute_per_window_bytes<Curve>(
            num_threads, B_eff_layout, n, dense_stride_layout, worker_total_for_budget);

        const size_t available_budget =
            (BATCH_MEM_BUDGET > fixed_overhead) ? (BATCH_MEM_BUDGET - fixed_overhead) : size_t{ 0 };
        const size_t wpb = round_parallel_detail::solve_wpb(
            per_window_bytes_layout, available_budget, static_cast<size_t>(layout_sched.num_windows));
        return fixed_overhead + (wpb * per_window_bytes_layout) + 32768 + dedup_bytes;
    };

    // Tight return: the arena holds `fixed_overhead + wpb · per_window_bytes` of typed
    // buffers plus a 32 KiB alignment pad and the dedup state (when active). Sizing
    // tightly — rather than padding up to BATCH_MEM_BUDGET — matters for many-MSM_fast flows
    // (e.g. PerMsmChonk's 256 separate per-circuit MSMs) where every per-MSM_fast
    // `make_unique_for_overwrite<std::byte[]>` mmap/munmaps the buffer above glibc's
    // M_MMAP_THRESHOLD; a 32 MiB floor here would tax every MSM_fast with the page-fault
    // first-touch cost regardless of how much of the arena the small MSM_fast actually uses.
    size_t arena_bytes = fixed_overhead + (windows_per_batch * per_window_bytes) + 32768 + dedup_bytes;

    // The live pipeline chooses window_bits from the *effective* (nonzero) scalar count and the
    // observed bit budget after Phase 1: c = choose_window_bits(n_active, effective_num_bits) with
    // n_active <= n and effective_num_bits <= NUM_BITS. Fewer active points => smaller c => more
    // windows => a larger arena (most sharply once fixed_overhead has eaten the batch budget and
    // every window runs in a single batch). Size for the worst reachable c so the bound holds for
    // any scalar density, with no extra scalar scan.
    //
    // For a fixed c, bit_budget = NUM_BITS maximizes the window count (effective_num_bits <=
    // NUM_BITS) and 2^(c-1)+1 caps B_eff, so arena_bytes_for_window_layout(NUM_BITS, c) dominates
    // every live (effective_num_bits, c) layout. The reachable c span is [2, c_max]: choose is
    // non-decreasing in the point count (n_active <= n bounds it above), but the ceil() in the round
    // count makes it non-monotonic in the bit budget by ±1, so c_max is the max over bit budgets,
    // not simply choose(n, NUM_BITS).
    size_t c_max_reachable = window_bits;
    for (size_t bit_budget = 1; bit_budget <= NUM_BITS; ++bit_budget) {
        c_max_reachable = std::max(c_max_reachable,
                                   static_cast<size_t>(round_parallel_detail::choose_window_bits(
                                       n, bit_budget, n_input, num_logical_threads_for_c)));
    }
    for (size_t wb = 2; wb <= c_max_reachable; ++wb) {
        arena_bytes = std::max(arena_bytes, arena_bytes_for_window_layout(NUM_BITS, wb));
    }
    return arena_bytes;
}

// Round-parallel Pippenger MSM_fast.
//   `external_glv_doubled` — optional caller-supplied [P_0, φP_0, …, P_{n-1}, φP_{n-1}]
//     buffer (length 2·n_input). When non-empty, forces use_glv=true and skips the
//     internal doubling pass. The interleaved layout means longer-prefix aliasing
//     (length 2·Nmax) is valid for any n ≤ Nmax with no copy.
//   `external_arena` — optional caller-supplied scratch buffer ≥ this MSM_fast's required
//     bytes. When empty, allocate per-MSM_fast via make_unique_for_overwrite and free at
//     return. The batched driver supplies a single arena sized to the largest member.
template <typename Curve>
// NOLINTNEXTLINE(readability-function-size, readability-function-cognitive-complexity,
// google-readability-function-size)
typename Curve::Element pippenger_round_parallel(PolynomialSpan<const typename Curve::ScalarField> scalars_span,
                                                 std::span<const typename Curve::AffineElement> all_points,
                                                 size_t dedup_info,
                                                 std::span<const typename Curve::AffineElement> external_glv_doubled,
                                                 std::span<std::byte> external_arena,
                                                 size_t max_threads) noexcept
{
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;

    const size_t n_input = scalars_span.size();
    if (n_input == 0) {
        return Curve::Group::point_at_infinity;
    }

    // Bail to trivial_msm_threaded when each worker would own fewer than
    // MIN_PTS_PER_THREAD_FOR_PIPPENGER points — pippenger_fast's per-window scaffolding loses
    // to straus_msm at this density. Caller-supplied GLV doubling is wasted at this size,
    // but the overhead is negligible.
    const size_t hw_threads = max_threads == 0 ? bb::get_num_cpus() : std::min(max_threads, bb::get_num_cpus());
    {
        const size_t num_threads_dispatch = std::max<size_t>(1, std::min(n_input, hw_threads));
        const size_t pts_per_thread = (n_input + num_threads_dispatch - 1) / num_threads_dispatch;
        if (pts_per_thread < MIN_PTS_PER_THREAD_FOR_PIPPENGER) {
            return trivial_msm_threaded<Curve>(scalars_span, all_points, hw_threads);
        }
    }

    BB_ASSERT_GTE(all_points.size(), scalars_span.start_index + n_input);
    std::span<const AffineElement> input_points(&all_points[scalars_span.start_index], n_input);

    constexpr size_t FULL_NUM_BITS = ScalarField::modulus.get_msb() + 1;

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    ScalarField* scalar_ptr = const_cast<ScalarField*>(&scalars_span[scalars_span.start_index]);
    std::span<ScalarField> input_scalars(scalar_ptr, n_input);

    // GLV: split k ≡ k1 − k2·λ (mod r), giving 2n pairs at NUM_BITS=128. Halves num_windows;
    // costs an extra n point doubles. Applied only below GLV_SMALL_N_THRESHOLD where the
    // win-on-windows beats the lose-on-doubled-scan, OR forced on by the batched dispatcher
    // supplying `external_glv_doubled` (it amortises the doubling across the whole batch).
    // Empirical crossover (best-of-3 sweep at HC=16, P ∈ {4, 8, 16}): wasmtime keeps GLV up
    // to n=2^16; native to n=2^13 (clang's branchless bias-decode is fast enough that the 2×
    // point-count cost dominates above that). Threshold is platform-conditional in the
    // hoisted GLV_SMALL_N_THRESHOLD declaration.
    const bool external_glv_provided = !external_glv_doubled.empty();
    const bool use_glv = external_glv_provided || n_input <= round_parallel_detail::GLV_SMALL_N_THRESHOLD;

    // Stage 6 splits into 6a (per-thread bucket partials over the contiguous-by-schedule-
    // index partition) and 6b (cross-thread bucket reduction over a uniform-width digit
    // slice). Small MSMs short-circuit to trivial_msm_threaded above this point.

    // n is the working scalar/point count (GLV doubles it); NUM_BITS is the post-recoding
    // window-bit budget (128 for GLV, FULL_NUM_BITS otherwise).
    const size_t n = use_glv ? (2 * n_input) : n_input;
    const size_t NUM_BITS = use_glv ? size_t{ 128 } : FULL_NUM_BITS;
    BB_ASSERT_LTE(n,
                  size_t{ round_parallel_detail::SCHEDULE_INDEX_MASK } + 1,
                  "working scalar indices must fit in the 29-bit schedule payload");
    std::span<ScalarField> scalars;
    std::span<const AffineElement> points;
    const bool inline_glv_double = use_glv && !external_glv_provided;

    // Activation gate: caller-supplied hint opts this MSM_fast into the dedup pre-pass.
    // Hint-driven so polynomials with low duplicate density (PC counters, range checks)
    // skip the O(n) tagging cost. The small-n bail above (pts_per_thread <
    // MIN_PTS_PER_THREAD_FOR_PIPPENGER) already shed every case where dedup wouldn't fit
    // — n ≥ MIN_PTS_PER_THREAD_FOR_PIPPENGER * 1 = 24 here.
    const bool dedup_active = dedup_info != 0;
    // dedup_info >= 2 carries a caller-measured duplicate count (e.g. an adjacent-run
    // count from grand-product construction); 1 means hinted with no estimate.
    const size_t dedup_count_estimate = dedup_info >= 2 ? dedup_info : 0;

    // ---------------------------------------------------------------------------------------
    // Arena setup (pre-Phase-1).
    //
    // The per-MSM_fast arena is allocated BEFORE Phase 1 so the Phase 1 prologue (msb_per_scalar,
    // glv_*_storage, per_thread_msb_hist) lives inside the arena instead of on the heap.
    // Once Phase 1 finishes and the window schedule is known (T, B_eff, dense_stride, wpb),
    // we partition the remaining capacity into three named zones
    // (Zone P / Zone W / Zone S) — see the "Arena zone layout" block after the wpb solve.
    //
    // We size the buffer using `compute_arena_bytes_for_msm`, whose conservative bound
    // dominates the inline-tight (P + W + S) sum for any wpb we choose below.
    // ---------------------------------------------------------------------------------------
    const size_t arena_total_bytes =
        compute_arena_bytes_for_msm<Curve>(n_input, external_glv_provided, dedup_active, hw_threads);
    round_parallel_detail::MsmArena arena(arena_total_bytes, external_arena);

    // ---------------------------------------------------------------------------------------
    // Phase 1 — convert scalars from Montgomery, optionally GLV-split, populate msb buffer.
    // The msb_per_scalar buffer feeds max-msb num_windows selection;
    // per-thread msb_hist counts (bin 0 = zero, bin k+1 = msb == k) feed the n_active gate
    // and the active-scalar gate.
    //
    // When dedup is active the per-scalar dedup work (hash + linear-probe shared atomic
    // table, per-thread dup_pair recording) is fused into the same per-thread loop so
    // scalars stay hot in L1 between from-Mont and the hash. The post-pass (sort, cluster
    // build, chunked tree-reduce, redirect_lookup) runs sequentially after the parallel_for
    // — see `dedup_finalize_parallel`.
    // ---------------------------------------------------------------------------------------
    using round_parallel_detail::MSB_ZERO_SENTINEL;
    const size_t profile_threads = std::max<size_t>(1, hw_threads);
    auto msb_per_scalar = arena.template alloc<uint8_t>(n);
    auto per_thread_msb_hist = arena.template alloc<std::array<uint32_t, 256>>(profile_threads);
    // MsmArena::alloc returns uninitialised memory; the histograms must be zero-initialised so
    // record_msb's increments land on a clean slate.
    std::fill_n(per_thread_msb_hist.data(), profile_threads, std::array<uint32_t, 256>{});

    // GLV storage (optional). `glv_scalars_storage` is the GLV-split working scalar buffer;
    // `glv_points_storage` is the inline-doubled point buffer (skipped when the caller
    // supplied an external doubled buffer). Both span empty when `use_glv` is false.
    std::span<ScalarField> glv_scalars_storage;
    std::span<AffineElement> glv_points_storage;
    if (use_glv) {
        glv_scalars_storage = arena.template alloc<ScalarField>(n);
        if (inline_glv_double) {
            glv_points_storage = arena.template alloc<AffineElement>(n);
        } else {
            BB_ASSERT_EQ(external_glv_doubled.size(), n);
        }
    }

    {
        BB_BENCH_NAME("MSM_fast::Phase1_from_montgomery");
        if (use_glv) {
            // Convert each input scalar from-Mont into a stack local, GLV-split it, store both
            // 128-bit halves and their msb into the profile buffer. input_scalars is read-only on
            // this path so the user's buffer is preserved (no Montgomery restore needed). Inline
            // path additionally GLV-doubles the points in the same parallel pass; external path
            // aliases the caller-supplied doubled buffer.
            const BaseField beta = inline_glv_double ? BaseField::cube_root_of_unity() : BaseField{};
            round_parallel_detail::msm_parallel_for(hw_threads, [&](const ThreadChunk& chunk) {
                auto& th_hist = per_thread_msb_hist[chunk.thread_index];
                for (size_t i : chunk.range(n_input)) {
                    const ScalarField canonical = input_scalars[i].from_montgomery_form_reduced();
                    const auto split = ScalarField::split_into_endomorphism_scalars(canonical);
                    const auto& k1 = split.first;
                    const auto& k2 = split.second;
                    glv_scalars_storage[2 * i].data[0] = k1[0];
                    glv_scalars_storage[2 * i].data[1] = k1[1];
                    glv_scalars_storage[2 * i].data[2] = 0;
                    glv_scalars_storage[2 * i].data[3] = 0;
                    glv_scalars_storage[(2 * i) + 1].data[0] = k2[0];
                    glv_scalars_storage[(2 * i) + 1].data[1] = k2[1];
                    glv_scalars_storage[(2 * i) + 1].data[2] = 0;
                    glv_scalars_storage[(2 * i) + 1].data[3] = 0;
                    if (inline_glv_double) {
                        glv_points_storage[2 * i] = input_points[i];
                        glv_points_storage[(2 * i) + 1].x = input_points[i].x * beta;
                        glv_points_storage[(2 * i) + 1].y = -input_points[i].y;
                    }
                    round_parallel_detail::record_msb(
                        round_parallel_detail::msb_of_2limb(k1[0], k1[1]), msb_per_scalar[2 * i], th_hist);
                    round_parallel_detail::record_msb(
                        round_parallel_detail::msb_of_2limb(k2[0], k2[1]), msb_per_scalar[(2 * i) + 1], th_hist);
                }
            });
            points =
                inline_glv_double ? std::span<const AffineElement>(glv_points_storage.data(), n) : external_glv_doubled;
            scalars = glv_scalars_storage;
        } else {
            // Non-GLV path: in-place from-Mont (later restored in the Stage-7 epilogue).
            round_parallel_detail::msm_parallel_for(hw_threads, [&](const ThreadChunk& chunk) {
                auto& th_hist = per_thread_msb_hist[chunk.thread_index];
                for (size_t i : chunk.range(n_input)) {
                    input_scalars[i].self_from_montgomery_form_reduced();
                    round_parallel_detail::record_msb(
                        round_parallel_detail::msb_of_4limb(input_scalars[i].data), msb_per_scalar[i], th_hist);
                }
            });
            scalars = input_scalars;
            points = input_points;
        }
    }

    std::array<uint64_t, 256> msb_hist{};
    for (size_t t = 0; t < profile_threads; ++t) {
        for (size_t b = 0; b < 256; ++b) {
            msb_hist[b] += per_thread_msb_hist[t][b];
        }
    }
    const size_t n_active_early = n - static_cast<size_t>(msb_hist[0]);

    // ---------------------------------------------------------------------------------------
    // Phase 2 — bail to trivial_msm_threaded when n_active is too small to amortise pippenger_fast's
    // per-window scaffolding. trivial_msm_threaded -> straus_msm wants Montgomery scalars, so
    // re-Mont-form them in parallel before dispatching.
    // ---------------------------------------------------------------------------------------
    {
        const size_t threads_for_dispatch = std::max<size_t>(1, std::min(n_active_early, hw_threads));
        const size_t pts_per_thread = (n_active_early + threads_for_dispatch - 1) / threads_for_dispatch;
        if (pts_per_thread < MIN_PTS_PER_THREAD_FOR_PIPPENGER) {
            round_parallel_detail::msm_parallel_for(hw_threads, [&](const ThreadChunk& chunk) {
                for (size_t i : chunk.range(n)) {
                    scalars[i].self_to_montgomery_form();
                }
            });
            std::span<const ScalarField> scalars_const(scalars.data(), n);
            PolynomialSpan<const ScalarField> ps(0, scalars_const);
            return trivial_msm_threaded<Curve>(ps, points, hw_threads);
        }
    }

    // ---------------------------------------------------------------------------------------
    // Phase 3 — pick the window layout, build the schedule, run the pipeline, sum into the result.
    // ---------------------------------------------------------------------------------------
    const size_t num_logical_threads_for_c = hw_threads * window_bits_tuning_oversub_factor(n_input);

    // Shrink the bit budget to the highest non-empty msb_hist bin so num_windows is determined
    // by the actual data, not the conservative GLV / FULL_NUM_BITS bound.
    size_t effective_num_bits = 0;
    for (size_t bin = 256; bin > 1;) {
        --bin;
        if (msb_hist[bin] != 0) {
            effective_num_bits = bin;
            break;
        }
    }
    if (effective_num_bits == 0 || effective_num_bits > NUM_BITS) {
        effective_num_bits = NUM_BITS;
    }
    // Drive window selection by the count of *nonzero* working scalars (n_active_early), not the
    // nominal size n. The native cost model rounds*(num_points + BUCKET_ACC_COST*buckets) charges
    // num_points for bucket accumulation, which only touches nonzero scalars; feeding nominal n for
    // a sparse MSM (e.g. a chonk commit at ~20% density) inflates that term ~5x and overshoots c.
    // Using the effective count picks the right window for sparse and dense MSMs alike.
    // Dedup-hinted MSMs lose roughly another half of their active points to the duplicate
    // pre-pass (measured on Honk wires: ~48% of nonzero coefficients are cluster non-reps),
    // but Phase A runs after the window is chosen — discount up front so the pick matches
    // the points that actually reach the buckets.
    // Estimate the post-dedup count from the zero fraction: on wire-style polynomials
    // the duplicate mass roughly tracks the zero mass (both come from trace padding and
    // value reuse), while dense hinted polynomials (z_perm: no zeros, ~16% real repeats)
    // lose far less. A blanket halving over-discounts those and drops their window 2-3
    // bits below optimum at n ~ 2^19. Clamp the estimate to [15%, 50%] of the active set.
    size_t n_for_window = n_active_early;
    if (dedup_active) {
        // Prefer a caller-measured duplicate count (dedup_info >= 2, e.g. the adjacent-run
        // count recorded when the polynomial was built); otherwise estimate from the zero
        // fraction, clamped to [15%, 50%] of the active set.
        const size_t zeros = n - n_active_early;
        size_t dup_est = std::clamp(zeros, (n_active_early * 3) / 20, n_active_early / 2);
        if (dedup_count_estimate != 0) {
            // Cap a caller-measured count at 90% of the active set: the count is only an estimate
            // of what the dedup pre-pass will actually fold (short scalars are skipped), so keep a
            // 10% floor of effective points to avoid choosing a window for a near-empty MSM.
            dup_est = std::min(dedup_count_estimate, (n_active_early * 9) / 10);
        }
        n_for_window = std::max<size_t>(1, n_active_early - dup_est);
    }
    const size_t window_bits =
        round_parallel_detail::choose_window_bits(n_for_window, effective_num_bits, n_input, num_logical_threads_for_c);
    const size_t num_buckets = (size_t{ 1 } << (window_bits - 1)) + 1;

    // Schedule-based dedup state. The two arrays are allocated from the per-MSM_fast arena
    // *from the arena after Phase 1.
    // Until then, both spans are empty.
    // Lifetimes:
    //   redirect_lookup  — written by Phase A; read by Stage 4b's dedup_patch_schedule per batch
    //   extra_points     — written by Phase A; read by Stage 6a's reduce_chunk per batch
    // Both must survive until the last Stage 6a, so they sit in the arena (which is freed
    // when this function returns).
    round_parallel_detail::DedupResult<Curve> dedup_state;

    // Variable-window split was removed from the production path after Chonk traces showed
    // it regressing this rewrite. Keep the schedule uniform and run one region over all
    // non-zero scalars.
    const auto sched = round_parallel_detail::build_window_schedule(effective_num_bits, window_bits);
    BB_ASSERT_LTE(sched.num_windows,
                  round_parallel_detail::MAX_SCHEDULE_WINDOWS,
                  "window schedule exceeds compile-time max window count");

    using round_parallel_detail::BATCH_CAPACITY;
    using round_parallel_detail::BATCH_MEM_BUDGET;
    using round_parallel_detail::MIN_BATCH_CAPACITY;
    using round_parallel_detail::SUBCHUNK_ENTRIES_CAP;

    // Thread count: one parallel_for task per available core, capped at
    // `n / MIN_BATCH_CAPACITY` so each task's chunk stays large enough to saturate the
    // batched-affine drains. `bb::get_num_cpus() <= 1` is the chonk batch-verifier's
    // signal that outer parallelism owns all cores — run sequentially.
    const size_t desired_threads = std::max<size_t>(1, hw_threads);
    const size_t max_threads_for_min_batch = std::max<size_t>(1, n / MIN_BATCH_CAPACITY);
    const size_t num_threads = std::min(desired_threads, max_threads_for_min_batch);

    // Stage 6's tree-reduce splits each thread's chunk into sub-chunks of at most
    // SUBCHUNK_ENTRIES_CAP entries before calling reduce_chunk, bounding per-thread scratch
    // independent of n. 2048 keeps level-0 saturated (≥ 4 BATCH_CAPACITY drains at typical
    // c=16) while the deepest level still hits BATCH_AFFINE_BREAKEVEN (~32 pairs); halving
    // breaks the deep levels and doubling wastes memory.
    // Pick windows_in_batch so per-MSM_fast working set fits in ~32 MB. Empirically 32 MB
    // performs as well as 128 MB on the WASM grid (the recursive affine bucket reduction
    // recovers most of the small-batch loss).
    // The per_window_bytes / fixed_overhead formulas below mirror this enum of allocations
    // exactly. Anyone adding an arena buffer must update both the alloc and the corresponding
    // term in those formulas, otherwise windows_per_batch drifts off the BATCH_MEM_BUDGET.

    // Per-(w, t) slot stride must fit the widest schedule window. The schedule is uniform, so the
    // widest window's bucket count is the per-window cap computed above.
    const size_t B_eff = num_buckets;

    const size_t worker_total_for_budget = num_threads;
    const size_t dense_stride_est = round_parallel_detail::compute_dense_stride(B_eff, num_threads);
    const size_t bucket_partials_per_window_max =
        round_parallel_detail::compute_bucket_partials_max(B_eff, num_threads);
    const size_t per_window_bytes_lo = round_parallel_detail::compute_per_window_bytes<Curve>(
        num_threads, B_eff, n, dense_stride_est, worker_total_for_budget);

    const size_t global_max_overflow_per_window_for_budget =
        round_parallel_detail::compute_global_max_overflow_per_window(n, num_threads, SUBCHUNK_ENTRIES_CAP);

    const size_t phase_one_prologue_bytes =
        round_parallel_detail::compute_phase_one_prologue_bytes(n, use_glv, inline_glv_double, profile_threads);

    const auto phase_a_caps = round_parallel_detail::compute_phase_a_caps(n, num_threads);
    const size_t phase_a_cluster_members_cap = phase_a_caps.members_cap;
    const size_t phase_a_cluster_offsets_cap = phase_a_caps.offsets_cap;

    // Zone W per-worker UNION via the canonical layout walk. The wpb-dependent Stage 6
    // tail is added separately after `windows_per_batch` is solved; here we only need
    // the union bytes for the fixed_overhead → wpb budget.
    const round_parallel_detail::PerWorkerArenaLayout<Curve> budget_layout(
        /*chunk_capacity=*/SUBCHUNK_ENTRIES_CAP,
        global_max_overflow_per_window_for_budget,
        dedup_active,
        phase_a_cluster_members_cap,
        phase_a_cluster_offsets_cap,
        /*windows_per_batch=*/0,
        /*dense_stride_est=*/0);
    const size_t worker_union_bytes_for_budget = budget_layout.per_worker_union_bytes;

    const size_t fixed_overhead = (worker_union_bytes_for_budget * worker_total_for_budget) +
                                  round_parallel_detail::window_sums_storage_bytes<Curve>() +
                                  (size_t{ 8 } * (num_threads + 1)) // rebalanced_bucket_lo_partition
                                  + phase_one_prologue_bytes;

    // Solve `wpb · per_window_bytes ≤ BATCH_MEM_BUDGET − fixed_overhead`.
    const size_t available_budget =
        (BATCH_MEM_BUDGET > fixed_overhead) ? (BATCH_MEM_BUDGET - fixed_overhead) : size_t{ 0 };
    const size_t windows_per_batch =
        round_parallel_detail::solve_wpb(per_window_bytes_lo, available_budget, sched.num_windows);

    // Per-thread chunk-capacity scratch sizing. A thread's per-window slice is split into
    // sub-chunks of at most SUBCHUNK_ENTRIES_CAP entries. Worst-case overflow per
    // (thread, window) is one partial per sub-chunk boundary that lands mid-run, bounded
    // above by `ceil(max_chunk_len / SUBCHUNK_ENTRIES_CAP)` where max_chunk_len ≤ n/T.
    // The Stage 6a end-of-window overflow merge runs tree_reduce on `2 × overflow` entries
    // (each affected slot contributes a dense head + ≥1 overflow entry). Tree-reduce
    // scratch must fit either a sub-chunk's reduce_chunk input (up to SUBCHUNK_ENTRIES_CAP)
    // or a full overflow merge — take the max.
    const size_t global_max_chunk_len = (n + num_threads - 1) / num_threads;
    const size_t global_max_overflow_per_window =
        (global_max_chunk_len + SUBCHUNK_ENTRIES_CAP - 1) / SUBCHUNK_ENTRIES_CAP;
    const size_t chunk_capacity = std::max(SUBCHUNK_ENTRIES_CAP, 2 * global_max_overflow_per_window);

    // Per-task scratch. Every parallel_for stage below runs `num_threads` tasks, and
    // `thread_scratch` holds one slot per task index, so no two concurrent tasks ever
    // share a slot. Every field is overwritten fresh at task start; nothing is read
    // across tasks. Phase A scratch overlays the same arena bytes (see Zone W below)
    // because the Phase A and Stage 6 parallel phases never run concurrently.
    const size_t worker_total = num_threads;
    std::vector<round_parallel_detail::ThreadScratch<Curve>> thread_scratch(worker_total);
    std::vector<round_parallel_detail::PhaseAScratch<Curve>> phase_a_scratch;
    if (dedup_active) {
        phase_a_scratch.resize(worker_total);
    }

    // ---------------------------------------------------------------------------------------
    // Arena zone layout — set up after Phase 1 and schedule selection (see
    // https://gist.github.com/AztecBot/7c5ef0581350f6fdb9711679552fd86f §1, §4, §5).
    //
    //   [0 .. bytes_P)                  Zone P — whole-MSM_fast permanent
    //                                       msb_per_scalar (already alloc'd above)
    //                                       glv_scalars / glv_points (already alloc'd above)
    //                                       per_thread_msb_hist (already alloc'd above)
    //                                       window_sums (Stage 7 accumulator)
    //                                       redirect_lookup, extra_points (dedup, if active)
    //   [bytes_P .. bytes_P + bytes_W)  Zone W — per-worker union slab × T
    //                                       Stage 6a/6b ThreadScratch fields and PhaseA
    //                                       scratch overlay the same per-worker bytes; the
    //                                       wpb-dependent Stage 6 fields sit immediately
    //                                       after the union. Stage 6a, Stage 6b, and Phase A
    //                                       run in distinct parallel_for invocations and
    //                                       never co-exist on a worker.
    //   [bytes_P + bytes_W .. arena.capacity)
    //                                   Zone S — per-batch swing region (schedule, HIST slot,
    //                                       DENSE slot, partition metadata).
    //                                       HIST slot overlays H ↔ O on one byte slab:
    //                                         H (S1-S4): digit_cursors
    //                                         O (S6b-S7): chunk_outputs/window_partial_sums
    //                                       Slot per-window = max(H, O). At chonk this is
    //                                       H-bound (~256 KiB/window).
    //                                       DENSE slot is dedicated for D (S6a-S6b):
    //                                         bucket_partials_dense / _present
    //                                       (~135 KiB/window at chonk). The D-class was
    //                                       moved out of the HIST slot to eliminate L1
    //                                       cache aliasing on the Stage 6a scatter writes
    //                                       (+1.29% regression observed when D was overlaid
    //                                       at the HIST offset).
    //
    // wpb solve: BATCH_MEM_BUDGET - bytes_P - bytes_W_fixed - bytes_S_shared - 32 KiB pad,
    // divided by (bytes_S_per_window + bytes_W_per_wpb). per_window_bytes_shared accounts
    // for HIST + DENSE as two separate slots.
    // ---------------------------------------------------------------------------------------

    // Freeze Zone P prefix at the post-Phase-1 cursor — everything allocated so far
    // (msb_per_scalar, glv storage, per_thread_msb_hist) is Zone P permanent state.
    const size_t bytes_P_prefix = arena.cursor;

    // Per-worker fixed-bytes "union": ThreadScratch's wpb-independent fields overlay the
    // PhaseAScratch fields. Compute each layout's strict byte requirement (including the
    // alignment slop a bump cursor would consume), then take the max.
    auto align_up = [](size_t off, size_t align) -> size_t { return (off + align - 1) & ~(align - 1); };
    auto layout_add = [&](size_t& off, size_t bytes, size_t align) { off = align_up(off, align) + bytes; };

    // Per-worker layout via the canonical walk (single source of truth shared with
    // `compute_arena_bytes_for_msm`). Pre-wpb-solve usage there passes wpb=0; here we
    // pass the actual windows_per_batch so the Stage 6 wpb-dependent tail is included.
    const round_parallel_detail::PerWorkerArenaLayout<Curve> worker_layout(chunk_capacity,
                                                                           global_max_overflow_per_window,
                                                                           dedup_active,
                                                                           phase_a_cluster_members_cap,
                                                                           phase_a_cluster_offsets_cap,
                                                                           windows_per_batch,
                                                                           dense_stride_est);
    constexpr size_t WORKER_SLAB_ALIGN = round_parallel_detail::PerWorkerArenaLayout<Curve>::WORKER_SLAB_ALIGN;
    const size_t per_worker_union_bytes = worker_layout.per_worker_union_bytes;
    const size_t per_worker_bytes = worker_layout.per_worker_bytes;

    // Zone P extra (post-decision permanent state): window_sums + dedup state. Sized
    // with the strict alignment a bump cursor would apply.
    constexpr size_t WINDOW_SUMS_CAP = round_parallel_detail::MAX_SCHEDULE_WINDOWS;
    size_t bytes_P_extra_layout = 0;
    layout_add(bytes_P_extra_layout, round_parallel_detail::window_sums_storage_bytes<Curve>(), alignof(Element));
    if (dedup_active) {
        layout_add(bytes_P_extra_layout, sizeof(uint32_t) * n, alignof(uint32_t));
        layout_add(bytes_P_extra_layout,
                   sizeof(AffineElement) * round_parallel_detail::DEDUP_MAX_CLUSTERS,
                   alignof(AffineElement));
    }

    // Zone sizes. The Zone W slab uses `MsmArena::bump_alloc` which aligns in ABSOLUTE address
    // space (the arena buffer base is only `__STDCPP_DEFAULT_NEW_ALIGNMENT__`-aligned, but
    // AffineElement is alignas(64)). To make the per-worker layout match the layout-only
    // calc (which assumes the slab starts on a 64-byte boundary), bias bytes_P so the
    // absolute address `arena.data + bytes_P` is 64-aligned.
    const size_t arena_base_misalign = static_cast<size_t>(arena.base_addr & (WORKER_SLAB_ALIGN - 1));
    const size_t bytes_P_min = align_up(bytes_P_prefix, alignof(Element)) + bytes_P_extra_layout;
    const size_t bytes_P = align_up(bytes_P_min + arena_base_misalign, WORKER_SLAB_ALIGN) - arena_base_misalign;
    // bytes_W: per_worker_bytes is already rounded to WORKER_SLAB_ALIGN, so consecutive
    // slabs stay aligned once the first slab is aligned.
    const size_t bytes_W = per_worker_bytes * worker_total;

    // Sanity: zones must fit. The conservative `compute_arena_bytes_for_msm` upper bound
    // sized the buffer to `BATCH_MEM_BUDGET + 32K + dedup_bytes` at worst, which dominates
    // every reachable (P + W + S) sum at the inline-tight wpb chosen above.
    BB_ASSERT_LTE(bytes_P + bytes_W, arena.capacity);
    const size_t bytes_S_total = arena.capacity - bytes_P - bytes_W;

    // Per-zone bump cursors. Zone P continues from `bytes_P_prefix`; Zones W and S start
    // fresh at their zone base. Zone P's bound is `bytes_P` so the bump cursor stays inside
    // its slot even if the extra slabs alignment-slop a hair.
    size_t zone_P_cursor = bytes_P_prefix;
    size_t zone_S_cursor = 0;
    auto zone_P_alloc = [&]<typename T>(size_t count) -> std::span<T> {
        return arena.template bump_alloc<T>(count, zone_P_cursor, bytes_P, 0);
    };
    auto zone_S_alloc = [&]<typename T>(size_t count) -> std::span<T> {
        return arena.template bump_alloc<T>(count, zone_S_cursor, bytes_S_total, bytes_P + bytes_W);
    };
    // Zone W is carved into per-worker slabs directly via `MsmArena::bump_alloc` below — each
    // worker gets its own (cursor, bound) pair, so a single zone-wide allocator would not
    // capture the per-worker discipline.
    // The pre-Phase-1 `MsmArena::alloc` cursor is retired here — every subsequent allocation
    // routes through `zone_P_alloc`, the per-worker Zone W allocators, or `zone_S_alloc`.

    // Zone W: per-worker union slab — Stage6a/6b ThreadScratch and PhaseA fields overlay the
    // same per-worker bytes, with the wpb-dependent Stage 6 fields immediately after.
    for (size_t t = 0; t < worker_total; ++t) {
        // Each worker's slab is a contiguous `per_worker_bytes` window inside Zone W.
        const size_t slab_base = t * per_worker_bytes;
        auto& s = thread_scratch[t];

        // ThreadScratch fixed fields — first view into the union. Bound = union size.
        size_t ts_fixed_cur = 0;
        auto ts_fixed_alloc = [&]<typename T>(size_t count) -> std::span<T> {
            return arena.template bump_alloc<T>(count, ts_fixed_cur, per_worker_union_bytes, bytes_P + slab_base);
        };
        s.curr_pts = ts_fixed_alloc.template operator()<AffineElement>(chunk_capacity);
        s.curr_buckets = ts_fixed_alloc.template operator()<uint32_t>(chunk_capacity);
        // Packed batch-affine drain backing, each run sized for BATCH_CAPACITY elements. The run count
        // is sourced from PerWorkerArenaLayout so these allocations and the sizer's layout walk cannot
        // drift. Index map below; `out` shares `lhs`'s backing (the add runs in place).
        using BaseParams = typename BaseField::Params;
        using VecField = bb::VectorField<BaseParams>;
        constexpr size_t packed_runs =
            round_parallel_detail::PerWorkerArenaLayout<Curve>::PACKED_DRAIN_VECTORFIELD_RUNS;
        const size_t pack_cap = (BATCH_CAPACITY / VecField::SIZE) + 1;
        std::array<std::span<VecField>, packed_runs> packed;
        for (auto& run : packed) {
            run = ts_fixed_alloc.template operator()<VecField>(pack_cap);
        }
        // packed = { lhs.x, lhs.y, rhs.x, rhs.y, dx, dy, xsum, inv }
        s.lhs = { packed[0], packed[1] };
        s.rhs = { packed[2], packed[3] };
        s.out = { packed[0], packed[1] };
        s.add_scratch = { bb::VectorFieldPushSpan<BaseParams>{ packed[4] },
                          bb::VectorFieldPushSpan<BaseParams>{ packed[5] },
                          bb::VectorFieldPushSpan<BaseParams>{ packed[6] },
                          bb::VectorFieldPushSpan<BaseParams>{ packed[7] } };
        s.pair_dest = ts_fixed_alloc.template operator()<uint32_t>(BATCH_CAPACITY);
        s.overflow_slots = ts_fixed_alloc.template operator()<uint32_t>(global_max_overflow_per_window);
        s.overflow_pts = ts_fixed_alloc.template operator()<AffineElement>(global_max_overflow_per_window);

        // PhaseA fields — second view, overlays the SAME per-worker union bytes. PhaseA's
        // parallel_for never overlaps Stage 6a/6b on the same worker, so reusing the bytes is
        // safe; the union's size is max(ts_fixed_layout, pa_layout) by construction.
        if (dedup_active) {
            size_t pa_cur = 0;
            auto pa_alloc = [&]<typename T>(size_t count) -> std::span<T> {
                return arena.template bump_alloc<T>(count, pa_cur, per_worker_union_bytes, bytes_P + slab_base);
            };
            auto& ps = phase_a_scratch[t];
            using PWAL = round_parallel_detail::PerWorkerArenaLayout<Curve>;
            ps.cluster_members = pa_alloc.template operator()<uint32_t>(phase_a_cluster_members_cap);
            ps.cluster_offsets = pa_alloc.template operator()<uint32_t>(phase_a_cluster_offsets_cap);
            ps.dirty_slots = pa_alloc.template operator()<uint16_t>(PWAL::PHASE_A_DIRTY_SLOTS_CAP);
            ps.bucket_rep = pa_alloc.template operator()<uint32_t>(PWAL::PHASE_A_BUCKET_REP_CAP);
            ps.staged = pa_alloc.template operator()<std::pair<uint32_t, uint32_t>>(PWAL::PHASE_A_STAGED_CAP);
            ps.chunk_pts = pa_alloc.template operator()<AffineElement>(PWAL::PHASE_A_CHUNK_CAP);
            ps.chunk_ids = pa_alloc.template operator()<uint32_t>(PWAL::PHASE_A_CHUNK_CAP);
        }

        // Stage 6 wpb-dependent fields — tail of the per-worker slab, BEYOND the union. Bound
        // = full per-worker slab size; cursor starts at per_worker_union_bytes so we don't
        // overwrite the union region.
        size_t ts_tail_cur = per_worker_union_bytes;
        auto ts_tail_alloc = [&]<typename T>(size_t count) -> std::span<T> {
            return arena.template bump_alloc<T>(count, ts_tail_cur, per_worker_bytes, bytes_P + slab_base);
        };
        const size_t dense_total = windows_per_batch * dense_stride_est;
        const size_t dense_pair_max = dense_total / 2;
        s.dense_buckets = ts_tail_alloc.template operator()<AffineElement>(dense_total);
        s.is_present = ts_tail_alloc.template operator()<uint8_t>(dense_total);
        s.affine_bucket_pairs = ts_tail_alloc.template operator()<std::pair<uint32_t, uint32_t>>(dense_pair_max);
        s.affine_bucket_indices = ts_tail_alloc.template operator()<uint32_t>(dense_pair_max);
        s.affine_bucket_inversion_scratch = ts_tail_alloc.template operator()<BaseField>(dense_pair_max);
        s.chunk_infos =
            ts_tail_alloc.template operator()<round_parallel_detail::AffineBucketChunkInfo>(windows_per_batch);
        std::fill_n(s.chunk_infos.begin(), windows_per_batch, round_parallel_detail::AffineBucketChunkInfo{});
        s.affine_bucket_stride = dense_stride_est;
    }

    // Zone S: per-batch swing region — schedule + HIST slot + DENSE slot + partition metadata.
    const size_t schedule_total = windows_per_batch * n;
    auto schedule = zone_S_alloc.template operator()<uint32_t>(schedule_total);

    // ----- HIST slot ------------------------------------------------------------------
    // Single byte slab backing two non-coexisting lifetime classes:
    //   Epoch H (Stages 1-4): digit_cursors.
    //   Epoch O (Stages 6b-7): chunk_outputs, window_partial_sums.
    // H dies before O is born (Stage 4 cursor advance ends before Stage 6b first writes
    // chunk_outputs / window_partial_sums).
    //
    // D-class (bucket_partials_dense + bucket_partials_present) previously overlaid this
    // slot too, but a 10× interleaved WASM Chonk bench showed Stage 6a regressed +1.29%
    // (t=+58) because of L1 cache aliasing on the `dense[slot]/present[slot]` scatter
    // writes when D sat at the HIST-overlaid offset. D-class now has its own dedicated
    // Zone-S DENSE slot below — see "DENSE slot" comment block.
    //
    // Phase 4: `digit_cursors` is dual-role within epoch H. After Stage 1 it holds
    // per-(w, t) counts of digit d; Stage 2 walks each (w, d) column from t = 0..T-1
    // reading the count from slot k and writing back the exclusive prefix-sum offset
    // (the count is consumed into `running` BEFORE the slot is overwritten, so the
    // in-place transform is mathematically identical to the previous out-of-place
    // version). Stage 4 then advances each (w, t) slice as a per-thread cursor.
    // Strict aliasing: every access goes through a std::span<T> obtained by
    //   reinterpret_cast<T*>(hist_slot.data() + offset)
    // which is well-defined because std::byte is allowed by [basic.lval] to alias any
    // POD type. All overlaid types (uint32_t, size_t, Element, ChunkOutput<Curve>) are
    // trivially copyable / standard layout so the two epochs do not require construction
    // or destruction calls when the role of the bytes changes.
    static_assert(alignof(Element) <= 32, "HIST slot O layout assumes alignof(Element) <= 32");
    static_assert(alignof(round_parallel_detail::ChunkOutput<Curve>) <= 32,
                  "HIST slot O layout assumes alignof(ChunkOutput) <= 32");

    auto align_up_local = [](size_t off, size_t a) -> size_t { return (off + a - 1) & ~(a - 1); };

    // Exact byte requirements for each epoch (matches the budget formula above).
    const size_t hist_h_bytes_total = (size_t{ 4 } * windows_per_batch * num_threads * B_eff); // digit_cursors

    // O epoch layout — chunk_outputs first, then window_partial_sums. Both are alignof
    // <= 32; align each up to its own alignment.
    size_t o_layout_cur = 0;
    o_layout_cur = align_up_local(o_layout_cur, alignof(round_parallel_detail::ChunkOutput<Curve>));
    const size_t off_chunk_outputs = o_layout_cur;
    o_layout_cur += sizeof(round_parallel_detail::ChunkOutput<Curve>) * windows_per_batch * num_threads;
    o_layout_cur = align_up_local(o_layout_cur, alignof(typename Curve::Element));
    const size_t off_window_partial_sums = o_layout_cur;
    o_layout_cur += sizeof(typename Curve::Element) * num_threads * windows_per_batch;
    const size_t hist_o_bytes_total = o_layout_cur;

    const size_t hist_slot_bytes_total = std::max(hist_h_bytes_total, hist_o_bytes_total);
    // Round up to AffineElement size so the bump allocator below treats the slot as a
    // whole number of 64-byte alignas(64) cells. Allocate via AffineElement to force the
    // slot base to be 64-byte aligned in absolute address space — sufficient for the
    // H-epoch uint32 digit_cursors span (alignof 4) and the O-epoch ChunkOutput/Element
    // spans (alignof ≤ 32).
    const size_t hist_slot_cells = (hist_slot_bytes_total + sizeof(AffineElement) - 1) / sizeof(AffineElement);
    auto hist_slot_cells_span = zone_S_alloc.template operator()<AffineElement>(hist_slot_cells);
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    std::byte* const hist_slot_bytes = reinterpret_cast<std::byte*>(hist_slot_cells_span.data());

    // H-epoch view — live S1..S4. `digit_cursors[(w*T + t) * stride + d]` holds three
    // distinct meanings depending on stage:
    //   * After Stage 1:  per-(w, t) count of digit d's occurrences in thread t's slice.
    //   * After Stage 2:  per-(w, t) exclusive prefix-sum offset (cursor base) for the
    //                     bucket-d run inside that window's schedule slot.
    //   * After Stage 4:  offset + count (final cursor end-state); dead from then on.
    // Stage 2 reads each (w, t, d) count from this buffer and writes the running prefix
    // sum back to the SAME slot before advancing `running`, so the count is preserved
    // long enough to feed the accumulator. Stage 4's `++` post-increment on each
    // thread's slice runs without atomics because each thread owns its (w, t, *) row
    // exclusively.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    auto digit_cursors =
        std::span<uint32_t>{ reinterpret_cast<uint32_t*>(hist_slot_bytes), windows_per_batch * num_threads * B_eff };

    // O-epoch views — live S6b..S7. Backed by the SAME bytes as above; H contents are
    // dead by the time these are touched. ChunkOutput<Curve> and Curve::Element have
    // user-defined constructors so are not formally trivially_copyable, but they are
    // standard-layout PODs of fixed bytes (Element is alignas(32) over a fixed-width Fq
    // field array). The existing arena pre-Phase-3 already aliases them through std::byte
    // buffers via `make_unique_for_overwrite<std::byte[]>` + reinterpret_cast; the
    // std::byte aliasing rule in [basic.lval] applies regardless of trivial-copyability.
    auto chunk_outputs = std::span<round_parallel_detail::ChunkOutput<Curve>>{
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        reinterpret_cast<round_parallel_detail::ChunkOutput<Curve>*>(hist_slot_bytes + off_chunk_outputs),
        windows_per_batch * num_threads
    };
    auto window_partial_sums = std::span<typename Curve::Element>{
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        reinterpret_cast<typename Curve::Element*>(hist_slot_bytes + off_window_partial_sums),
        num_threads * windows_per_batch
    };
    // window_partial_sums is reset to identity at the start of each Stage 6b worker
    // (`my_partials[w] = point_at_infinity` loop), so we deliberately do NOT initialise
    // it here. chunk_outputs is written unconditionally per (w, tprime) in Stage 6b
    // (the empty path sets `out.empty = 1`), so no pre-init is needed either.
    // ----- end HIST slot --------------------------------------------------------------

    // ----- DENSE slot -----------------------------------------------------------------
    // Dedicated Zone-S slot for D-class (bucket_partials_dense + bucket_partials_present).
    // Lifetime is Stages 6a-6b only. Isolated from the HIST slot so Stage 6a's tight
    // scatter loop
    //   `dst_dense[slot] = pt; dst_present[slot] = 1;`
    // does not L1-alias against the HIST slot's H/O bytes (the previous co-located
    // layout caused a +1.29% Stage 6a regression in WASM, t=+58 across 10× interleaved
    // runs). The dense ↔ present pair stays packed at fixed aligned offsets within this
    // slot — they MUST stay close because Stage 6a reads `present[slot]` then writes
    // `dense[slot]` / `present[slot]` in tandem in the inner loop.
    static_assert(alignof(AffineElement) == 64, "DENSE slot D layout assumes alignof(AffineElement) == 64");
    const size_t bp_total = windows_per_batch * bucket_partials_per_window_max;
    size_t d_layout_cur = 0;
    const size_t off_dense = d_layout_cur;
    d_layout_cur += sizeof(AffineElement) * bp_total; // bucket_partials_dense
    const size_t off_present = d_layout_cur;
    d_layout_cur += sizeof(uint8_t) * bp_total; // bucket_partials_present
    const size_t dense_slot_bytes_total = d_layout_cur;
    const size_t dense_slot_cells = (dense_slot_bytes_total + sizeof(AffineElement) - 1) / sizeof(AffineElement);
    // Allocate via AffineElement to force 64-byte alignment for the leading
    // bucket_partials_dense view.
    auto dense_slot_cells_span = zone_S_alloc.template operator()<AffineElement>(dense_slot_cells);
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    std::byte* const dense_slot_bytes = reinterpret_cast<std::byte*>(dense_slot_cells_span.data());

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    auto bucket_partials_dense =
        std::span<AffineElement>{ reinterpret_cast<AffineElement*>(dense_slot_bytes + off_dense), bp_total };
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
    auto bucket_partials_present =
        std::span<uint8_t>{ reinterpret_cast<uint8_t*>(dense_slot_bytes + off_present), bp_total };
    // ----- end DENSE slot -------------------------------------------------------------

    auto bucket_start_all = zone_S_alloc.template operator()<size_t>(windows_per_batch * (B_eff + 1));
    auto chunk_start_all = zone_S_alloc.template operator()<size_t>(windows_per_batch * (num_threads + 1));
    // chunk_bucket_lo_all[w*(T+1) + t] = bucket index of the first schedule entry in
    //                                     chunk t of window w.
    // chunk_bucket_hi_all[w*T + t]    = bucket index of the last schedule entry in chunk t.
    // Chunks are partitioned by schedule index (uniform t·m/T), not by bucket boundary, so
    // a bucket's run can straddle threads — both threads then carry a partial for that
    // shared bucket and Stage 7's chunk_contribution sum (Σ_d d · partial_d_in_t over t)
    // combines them without an explicit merge step.
    auto chunk_bucket_lo_all = zone_S_alloc.template operator()<size_t>(windows_per_batch * (num_threads + 1));
    auto chunk_bucket_hi_all = zone_S_alloc.template operator()<size_t>(windows_per_batch * num_threads);

    // bucket_partials_offsets is the index table that maps (thread, window) -> slot
    // start in bucket_partials_dense/present. Lives S5..S6b alongside chunk_start_all,
    // and stays as its own Zone S allocation (separate from the DENSE slot).
    auto bucket_partials_offsets = zone_S_alloc.template operator()<size_t>((num_threads * windows_per_batch) + 1);

    // Stage 6b rebalanced-task partition. The bucket range [1, num_buckets) is split evenly
    // across `num_threads` rebalanced tasks t'. The partition is uniform in num_buckets so
    // we store T+1 boundaries (not per-window). For each window we record the half-open
    // range of original threads whose chunk range intersects each task t' — usually 1-2
    // originals per task.
    auto rebalanced_bucket_lo_partition = zone_S_alloc.template operator()<size_t>(num_threads + 1);
    auto orig_thread_lo = zone_S_alloc.template operator()<size_t>(windows_per_batch * num_threads);
    auto orig_thread_hi = zone_S_alloc.template operator()<size_t>(windows_per_batch * num_threads);

    // Zone P: window_sums (Stage 7 accumulator — survives the whole MSM_fast).
    auto window_sums = zone_P_alloc.template operator()<typename Curve::Element>(WINDOW_SUMS_CAP);
    std::fill_n(window_sums.begin(), WINDOW_SUMS_CAP, Curve::Group::point_at_infinity);

    // Zone P: dedup state — written by Phase A and read through Stage 6a of every batch,
    // so it must outlive every batch.
    // - redirect_lookup: parallel-filled with DEDUP_INVALID_EXTRA below before Phase A reads it.
    // - extra_points:    no init needed; Phase A writes per-thread cid ranges, and consumers
    //                    only read indices Phase A actually populated.
    if (dedup_active) {
        dedup_state.redirect_lookup = zone_P_alloc.template operator()<uint32_t>(n);
        dedup_state.extra_points =
            zone_P_alloc.template operator()<AffineElement>(round_parallel_detail::DEDUP_MAX_CLUSTERS);
        BB_BENCH_NAME("MSM_fast::dedup/redirect_invalid_fill");
        uint32_t* const rl = dedup_state.redirect_lookup.data();
        round_parallel_detail::msm_parallel_for(hw_threads, [&](const ThreadChunk& chunk) {
            for (size_t i : chunk.range(n)) {
                rl[i] = round_parallel_detail::DEDUP_INVALID_EXTRA;
            }
        });
    }

    // BUCKET_MASK strips the sign bit off a packed (sign | bucket) digit produced by
    // get_constantine_packed_digit, leaving the unsigned bucket index.
    constexpr uint32_t BUCKET_MASK = (uint32_t{ 1 } << 31) - 1;

    // Phase A runs at most once per MSM_fast (not per batch). Cluster membership is determined
    // by scalar value (memcmp) — independent of which window we walk — and bucket
    // adjacency holds in any window's sorted schedule because true duplicates land in the
    // same bucket of every window. So we Phase A on the very first batch's window-0
    // schedule, populate `dedup_state.{redirect_lookup, extra_points}` once, and reuse the
    // result for every subsequent batch.
    bool phase_a_done = false;

    auto run_batch = [&](size_t batch_start, size_t windows_in_batch, size_t B_R) noexcept {
        // Per-(w, t) slot stride uses `B_eff` = max(num_buckets, B_lo, B_hi); each call
        // iterates only the region's first B_R entries. The arena was sized for B_eff per slot.
        const size_t bucket_stride = B_eff;
        // Per-window slice params. The final window can be narrower when the bit budget
        // does not divide evenly by the default window size; the Booth recoder must use
        // that narrower width or it encroaches on bits beyond the schedule.
        constexpr size_t SCALAR_UINT64_LIMBS = sizeof(ScalarField) / sizeof(uint64_t);
        std::array<round_parallel_detail::ConstantineSliceParams, 128> slice_params{};
        std::array<round_parallel_detail::ConstantineSliceParamsU32, 128> slice_params_u32{};
        std::array<round_parallel_detail::ConstantineSlicePath, 128> slice_paths{};
        std::array<round_parallel_detail::SimdU32x4, 128> lo_mask_vectors{};
        std::array<round_parallel_detail::SimdU32x4, 128> hi_mask_vectors{};
        std::array<round_parallel_detail::SimdU32x4, 128> val_mask_vectors{};
        std::array<uint8_t, 128> per_window_bits{};
        constexpr size_t SCALAR_U32_LIMBS = sizeof(ScalarField) / sizeof(uint32_t);
        for (size_t w = 0; w < windows_in_batch; ++w) {
            const size_t global_w = batch_start + w;
            const size_t window_bits_w = sched.window_bits_per_window[global_w];
            per_window_bits[w] = static_cast<uint8_t>(window_bits_w);
            slice_params[w] = round_parallel_detail::compute_constantine_slice_params(
                sched.bit_base[global_w], window_bits_w, SCALAR_UINT64_LIMBS);
            slice_params_u32[w] = round_parallel_detail::compute_constantine_slice_params_u32(
                sched.bit_base[global_w], window_bits_w, SCALAR_U32_LIMBS);
            slice_paths[w] = round_parallel_detail::classify_slice_path_u32(slice_params_u32[w]);
            const uint32_t lo_mask = slice_params_u32[w].lo_mask;
            const uint32_t hi_mask = slice_params_u32[w].hi_mask;
            const uint32_t val_mask = (uint32_t{ 1 } << static_cast<uint32_t>(window_bits_w)) - 1;
            lo_mask_vectors[w] = round_parallel_detail::SimdU32x4{ lo_mask, lo_mask, lo_mask, lo_mask };
            hi_mask_vectors[w] = round_parallel_detail::SimdU32x4{ hi_mask, hi_mask, hi_mask, hi_mask };
            val_mask_vectors[w] = round_parallel_detail::SimdU32x4{ val_mask, val_mask, val_mask, val_mask };
        }

        constexpr size_t SIMD_BATCH = 64;
        static_assert(SIMD_BATCH % 4 == 0, "SIMD_BATCH must be divisible by 4");
        constexpr size_t LIMBS_PER_SCALAR = sizeof(ScalarField) / sizeof(uint32_t);
        const auto* scalars_u32 = reinterpret_cast<const uint32_t*>(scalars.data());
        const round_parallel_detail::SimdU32x4 one_v = round_parallel_detail::SimdU32x4{ 1, 1, 1, 1 };
        auto fill_packed_digit_buffer = [&](size_t w, size_t i, uint32_t* packed_buf) noexcept {
            const auto& sp32 = slice_params_u32[w];
            const uint32_t window_bits_w = static_cast<uint32_t>(per_window_bits[w]);
            if (slice_paths[w] == round_parallel_detail::ConstantineSlicePath::Localised) {
                for (size_t k = 0; k < SIMD_BATCH; k += 4) {
                    round_parallel_detail::store_constantine_packed_digits_x4_localised(
                        packed_buf + k,
                        scalars_u32 + ((i + k + 0) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 1) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 2) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 3) * LIMBS_PER_SCALAR),
                        sp32.lo_limb,
                        sp32.lo_off,
                        lo_mask_vectors[w],
                        one_v,
                        val_mask_vectors[w],
                        window_bits_w);
                }
            } else if (slice_paths[w] == round_parallel_detail::ConstantineSlicePath::Bottom) {
                for (size_t k = 0; k < SIMD_BATCH; k += 4) {
                    round_parallel_detail::store_constantine_packed_digits_x4_bottom(
                        packed_buf + k,
                        scalars_u32 + ((i + k + 0) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 1) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 2) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 3) * LIMBS_PER_SCALAR),
                        sp32.hi_limb,
                        sp32.lo_bits,
                        hi_mask_vectors[w],
                        one_v,
                        val_mask_vectors[w],
                        window_bits_w);
                }
            } else {
                for (size_t k = 0; k < SIMD_BATCH; k += 4) {
                    round_parallel_detail::store_constantine_packed_digits_x4_boundary(
                        packed_buf + k,
                        scalars_u32 + ((i + k + 0) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 1) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 2) * LIMBS_PER_SCALAR),
                        scalars_u32 + ((i + k + 3) * LIMBS_PER_SCALAR),
                        sp32.lo_limb,
                        sp32.hi_limb,
                        sp32.lo_off,
                        sp32.lo_bits,
                        lo_mask_vectors[w],
                        hi_mask_vectors[w],
                        one_v,
                        val_mask_vectors[w],
                        window_bits_w);
                }
            }
        };

        // Capture the dedup state before Stage 1. The first batch must build the ordinary
        // R14 schedule so Phase A can discover clusters, then patch+compact that batch.
        // Later batches can schedule cluster reps directly and omit non-reps up front.
        const bool phase_a_done_at_batch_start = phase_a_done;
        const bool dedup_known_for_batch =
            dedup_active && phase_a_done_at_batch_start && dedup_state.n_dedup_extras != 0;

        // Stage 1 (digit extraction): per-thread per-window bucket histograms. Work is
        // scalar-blocked across the windows in this batch so scalars/msb/dedup metadata are
        // read once per block and reused while still hot.
        auto stage1_digit_extract = [&]<bool DedupKnown>(size_t tid) noexcept {
            [[maybe_unused]] const uint32_t* const rl_data = dedup_state.redirect_lookup.data();
            for (size_t w = 0; w < windows_in_batch; ++w) {
                uint32_t* my_counts = digit_cursors.data() + (((w * num_threads) + tid) * bucket_stride);
                std::memset(my_counts, 0, B_R * sizeof(uint32_t));
            }
            const size_t start = tid * n / num_threads;
            const size_t end = (tid + 1) * n / num_threads;

            alignas(16) std::array<uint32_t, SIMD_BATCH> packed_buf{};
            // Pack the per-block filter into a uint64 bitmask. When every scalar in the block
            // is active (common in dense workloads), the inner scatter takes an all_included
            // fast path that drops the per-element predicate; mixed blocks bit-scan the mask.
            auto compute_include_mask = [&](size_t block_start) noexcept -> uint64_t {
                uint64_t include_mask = 0;
                for (size_t k = 0; k < SIMD_BATCH; ++k) {
                    const size_t scalar_idx = block_start + k;
                    const uint8_t m = msb_per_scalar[scalar_idx];
                    bool include = (m != MSB_ZERO_SENTINEL);
                    if constexpr (DedupKnown) {
                        if (include) {
                            const uint32_t patch = rl_data[scalar_idx];
                            include = (patch == round_parallel_detail::DEDUP_INVALID_EXTRA ||
                                       (patch & round_parallel_detail::DEDUP_SKIP_BIT) == 0);
                        }
                    }
                    include_mask |= static_cast<uint64_t>(include) << k;
                }
                return include_mask;
            };

            size_t i = start;
            while (i + SIMD_BATCH <= end) {
                const uint64_t include_mask = compute_include_mask(i);
                if (include_mask == 0) {
                    i += SIMD_BATCH;
                    continue;
                }
                const bool all_included = include_mask == ~uint64_t{ 0 };
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    fill_packed_digit_buffer(w, i, packed_buf.data());
                    uint32_t* my_counts = digit_cursors.data() + (((w * num_threads) + tid) * bucket_stride);
                    if (all_included) {
                        for (size_t k = 0; k < SIMD_BATCH; ++k) {
                            ++my_counts[packed_buf[k] & BUCKET_MASK];
                        }
                    } else {
                        uint64_t scatter_mask = include_mask;
                        for (size_t k = 0; k < SIMD_BATCH; ++k) {
                            if ((scatter_mask & uint64_t{ 1 }) != 0) {
                                ++my_counts[packed_buf[k] & BUCKET_MASK];
                            }
                            scatter_mask >>= 1;
                        }
                    }
                }
                i += SIMD_BATCH;
            }

            // Tail (0..SIMD_BATCH-1 scalars). Same scalar-major loop order; per-scalar
            // active check inlined since the block is short.
            for (; i < end; ++i) {
                const uint8_t m = msb_per_scalar[i];
                if (m == MSB_ZERO_SENTINEL) {
                    continue;
                }
                if constexpr (DedupKnown) {
                    const uint32_t patch = rl_data[i];
                    if (patch != round_parallel_detail::DEDUP_INVALID_EXTRA &&
                        (patch & round_parallel_detail::DEDUP_SKIP_BIT) != 0) {
                        continue;
                    }
                }
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    uint32_t* my_counts = digit_cursors.data() + (((w * num_threads) + tid) * bucket_stride);
                    const round_parallel_detail::ConstantineSliceParams sp = slice_params[w];
                    const uint32_t window_bits_w = static_cast<uint32_t>(per_window_bits[w]);
                    const uint32_t packed =
                        round_parallel_detail::get_constantine_packed_digit(scalars[i].data,
                                                                            sp.lo_limb,
                                                                            sp.hi_limb,
                                                                            sp.lo_off,
                                                                            sp.lo_bits,
                                                                            sp.lo_mask,
                                                                            sp.hi_mask,
                                                                            sp.slice_localised_to_one_u64,
                                                                            window_bits_w);
                    ++my_counts[packed & BUCKET_MASK];
                }
            }
        };
        {
            BB_BENCH_NAME("MSM_fast::Stage1_digit_extract");
            if (dedup_known_for_batch) {
                round_parallel_detail::msm_parallel_for(
                    num_threads, [&](size_t tid) { stage1_digit_extract.template operator()<true>(tid); });
            } else {
                round_parallel_detail::msm_parallel_for(
                    num_threads, [&](size_t tid) { stage1_digit_extract.template operator()<false>(tid); });
            }
        }

        // Stage 2 (bucket histogram): per-window per-digit totals + per-thread within-digit
        // offsets. Parallelised over digit-chunks; each worker handles its slice of 2^window_bits
        // for all windows_in_batch windows. In-place exclusive prefix-sum: each slot
        // `digit_cursors[(w*T + t) * stride + d]` is read for its Stage 1 count and then
        // overwritten with the running prefix sum (== the cursor base Stage 4 needs). The
        // count must be read BEFORE the write or `running` would skip its contribution.
        // Phase 5: the per-digit total `running` is written directly into
        // `bucket_start_all[w][d+1]` (one cell past where Stage 3 will read), so Stage 3 can
        // prefix-sum in place without a separate `bucket_total_counts` buffer. The size_t
        // bucket_start cell widens the uint32_t total implicitly.
        {
            BB_BENCH_NAME("MSM_fast::Stage2_bucket_histogram");
            round_parallel_detail::msm_parallel_for(num_threads, [&](size_t tid) {
                const size_t d_start = tid * B_R / num_threads;
                const size_t d_end = (tid + 1) * B_R / num_threads;
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    size_t* const bucket_start_w = bucket_start_all.data() + (w * (bucket_stride + 1));
                    for (size_t d = d_start; d < d_end; ++d) {
                        if (d == 0) {
                            continue;
                        }
                        uint32_t running = 0;
                        for (size_t t = 0; t < num_threads; ++t) {
                            const size_t k = (((w * num_threads) + t) * bucket_stride) + d;
                            const uint32_t cnt = digit_cursors[k];
                            digit_cursors[k] = running;
                            running += cnt;
                        }
                        bucket_start_w[d + 1] = running;
                    }
                }
            });
        }

        // Stage 3 (bucket offsets / prefix sum): per-window serial prefix sum in place.
        // Stage 2 already deposited each digit's per-window total at bucket_start[d+1];
        // the loop accumulates the running prefix-sum without a separate counts buffer.
        {
            BB_BENCH_NAME("MSM_fast::Stage2_3_bucket_offsets");
            auto build_bucket_offsets_for_window = [&](size_t w) noexcept {
                size_t* bucket_start = bucket_start_all.data() + (w * (bucket_stride + 1));
                bucket_start[0] = 0;
                bucket_start[1] = 0;
                for (size_t d = 1; d < B_R; ++d) {
                    bucket_start[d + 1] += bucket_start[d];
                }
            };
            const size_t offset_threads = std::min(num_threads, windows_in_batch);
            if (offset_threads <= 1) {
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    build_bucket_offsets_for_window(w);
                }
            } else {
                round_parallel_detail::msm_parallel_for(offset_threads, [&](size_t tid) {
                    for (size_t w = tid; w < windows_in_batch; w += offset_threads) {
                        build_bucket_offsets_for_window(w);
                    }
                });
            }
        }

        // Stage 4 (digit scatter): scalar-cache-blocked, window-local scatter. Re-decodes each
        // (point, window) signed digit via the same Constantine carry-less recoder Stage 1 used.
        // Stage 4 stores only `sign | scalar_idx`; bucket magnitude is recovered later from
        // bucket_start ranges.
        // Stage 1 benefits from full scalar-major order because it only updates compact
        // per-window histograms. Stage 4 writes large bucket schedules, so full scalar-major
        // order opens too many cold write/cursor streams. Instead, process a scalar tile across
        // all windows: scalar/msb/dedup metadata are reused while the tile is cache-hot, but each
        // inner loop still scatters to one window's schedule at a time.
        //
        // First-batch Stage 4 is dedup-unaware: every scalar is emitted as
        // `sched_w[idx] = sign | scalar_idx`, then Phase A + patch/compact tags cluster
        // reps and removes non-reps. Later batches with known dedup state skip non-reps
        // here and emit redirect reps directly.
        // Splitting the dedup work out of this hot loop avoids a per-iteration
        // closure-indirection chain through `dedup_state.redirect_lookup[i]`
        // that the WASM JIT does not hoist (~13 ns/iter penalty observed).
        auto stage4_emit = [&]<bool DedupKnown>(size_t tid) noexcept {
            [[maybe_unused]] const uint32_t* const rl_data = dedup_state.redirect_lookup.data();
            const size_t start = tid * n / num_threads;
            const size_t end = (tid + 1) * n / num_threads;
            std::array<uint32_t*, 128> cursors{};
            std::array<const size_t*, 128> bucket_starts{};
            std::array<uint32_t*, 128> schedules{};
            for (size_t w = 0; w < windows_in_batch; ++w) {
                cursors[w] = digit_cursors.data() + (((w * num_threads) + tid) * bucket_stride);
                bucket_starts[w] = bucket_start_all.data() + (w * (bucket_stride + 1));
                schedules[w] = schedule.data() + (w * n);
            }

            alignas(16) std::array<uint32_t, SIMD_BATCH> packed_buf{};
            constexpr size_t STAGE4_SCALAR_TILE = 2048;
            std::array<uint8_t, STAGE4_SCALAR_TILE> active_tile{};
            [[maybe_unused]] std::array<uint32_t, STAGE4_SCALAR_TILE> out_base_tile{};

            for (size_t tile_start = start; tile_start < end; tile_start += STAGE4_SCALAR_TILE) {
                const size_t tile_end = std::min(end, tile_start + STAGE4_SCALAR_TILE);
                const size_t tile_len = tile_end - tile_start;
                for (size_t j = 0; j < tile_len; ++j) {
                    const size_t scalar_idx = tile_start + j;
                    const uint8_t m = msb_per_scalar[scalar_idx];
                    bool include = (m != MSB_ZERO_SENTINEL);
                    if constexpr (DedupKnown) {
                        uint32_t out_base = static_cast<uint32_t>(scalar_idx);
                        if (include) {
                            const uint32_t patch = rl_data[scalar_idx];
                            if (patch != round_parallel_detail::DEDUP_INVALID_EXTRA) {
                                include = (patch & round_parallel_detail::DEDUP_SKIP_BIT) == 0;
                                out_base = patch;
                            }
                        }
                        out_base_tile[j] = out_base;
                    }
                    active_tile[j] = static_cast<uint8_t>(include);
                }

                for (size_t w = 0; w < windows_in_batch; ++w) {
                    uint32_t* my_cursor = cursors[w];
                    const size_t* bucket_start = bucket_starts[w];
                    uint32_t* sched_w = schedules[w];
                    size_t i = tile_start;
                    while (i + SIMD_BATCH <= tile_end) {
                        const size_t rel = i - tile_start;
                        uint64_t include_mask = 0;
                        for (size_t k = 0; k < SIMD_BATCH; ++k) {
                            include_mask |= static_cast<uint64_t>(active_tile[rel + k]) << k;
                        }
                        if (include_mask == 0) {
                            i += SIMD_BATCH;
                            continue;
                        }
                        fill_packed_digit_buffer(w, i, packed_buf.data());
                        uint64_t scatter_mask = include_mask;
                        for (size_t k = 0; k < SIMD_BATCH; ++k) {
                            if ((scatter_mask & uint64_t{ 1 }) != 0) {
                                const uint32_t packed = packed_buf[k];
                                const uint32_t bucket_idx = packed & BUCKET_MASK;
                                if (bucket_idx != 0) {
                                    const uint32_t idx =
                                        static_cast<uint32_t>(bucket_start[bucket_idx]) + my_cursor[bucket_idx]++;
                                    uint32_t out = packed & round_parallel_detail::SCHEDULE_SIGN_BIT;
                                    if constexpr (DedupKnown) {
                                        out |= out_base_tile[rel + k];
                                    } else {
                                        out |= static_cast<uint32_t>(i + k);
                                    }
                                    sched_w[idx] = out;
                                }
                            }
                            scatter_mask >>= 1;
                        }
                        i += SIMD_BATCH;
                    }
                    for (; i < tile_end; ++i) {
                        const size_t rel = i - tile_start;
                        if (active_tile[rel] == 0) {
                            continue;
                        }
                        const round_parallel_detail::ConstantineSliceParams sp = slice_params[w];
                        const uint32_t packed = round_parallel_detail::get_constantine_packed_digit(
                            scalars[i].data,
                            sp.lo_limb,
                            sp.hi_limb,
                            sp.lo_off,
                            sp.lo_bits,
                            sp.lo_mask,
                            sp.hi_mask,
                            sp.slice_localised_to_one_u64,
                            static_cast<uint32_t>(per_window_bits[w]));
                        const uint32_t bucket_idx = packed & BUCKET_MASK;
                        if (bucket_idx != 0) {
                            const uint32_t idx =
                                static_cast<uint32_t>(bucket_start[bucket_idx]) + my_cursor[bucket_idx]++;
                            uint32_t out = packed & round_parallel_detail::SCHEDULE_SIGN_BIT;
                            if constexpr (DedupKnown) {
                                out |= out_base_tile[rel];
                            } else {
                                out |= static_cast<uint32_t>(i);
                            }
                            sched_w[idx] = out;
                        }
                    }
                }
            }
        };

        {
            BB_BENCH_NAME("MSM_fast::Stage4_digit_scatter");
            if (dedup_known_for_batch) {
                round_parallel_detail::msm_parallel_for(
                    num_threads, [&](size_t tid) { stage4_emit.template operator()<true>(tid); });
            } else {
                round_parallel_detail::msm_parallel_for(
                    num_threads, [&](size_t tid) { stage4_emit.template operator()<false>(tid); });
            }
        }

        // Phase A: schedule-based dedup detection on window 0. Each thread owns a
        // contiguous range of window 0's schedule. Detects duplicate clusters via
        // consecutive-pair check (same bucket + memcmp on full scalar value), tree-reduces
        // members into an aggregate, and publishes results into `dedup_state.extra_points`,
        // `dedup_state.redirect_lookup`, and zeroed `msb_per_scalar` entries for non-reps.
        // Per-thread cluster-id ranges keep writes disjoint — no atomics needed.
        // Phase A: schedule-based dedup detection. Runs at most ONCE per MSM_fast (gated on
        // `phase_a_done` from the enclosing function scope). Cluster membership is decided
        // by scalar value (memcmp), so any window's bucket-sorted schedule places duplicates
        // consecutively — Phase A on this first-batch's window-0 schedule produces the
        // correct redirect_lookup + extra_points for all subsequent batches. We deliberately
        // do not re-run Phase A per batch: the dedup_state is populated once and reused.
        if (dedup_active && windows_in_batch > 0 && !phase_a_done) {
            BB_BENCH_NAME("MSM_fast::PhaseA_dedup_detect");
            uint32_t* sched_w0 = schedule.data();
            // Pre-Phase-A bucket sort: Stage 4 emits each bucket's run in scalar-emit
            // order, so different-value scalars that happen to share a window-0 digit
            // (bucket collisions are common — c=11 → 2048 buckets vs 60-90k entries)
            // interleave with same-value entries and break Phase A's consecutive-pair
            // detection. Sorting each bucket's run by scalar value makes same-value
            // entries adjacent so the simple consecutive-pair walk finds every cluster.
            // Sort cost: per bucket of size K, ~K log K comparisons × 32-byte memcmp;
            // for typical K=44 this is ~500 cycles per bucket × 2048 buckets = ~1 ms
            // wall (parallelized across threads).
            const uint32_t cids_per_thread =
                static_cast<uint32_t>(round_parallel_detail::DEDUP_MAX_CLUSTERS / num_threads);
            // Hash-based per-bucket dedup detection: every thread owns a
            // contiguous bucket range of window-0's schedule and runs an
            // open-addressing hash table over that range's long-scalar entries.
            // O(K) per bucket, avoids the 32-byte memcmp comparator inside any
            // sort, and keeps thread balance uniform because short-scalar
            // entries (the source of mega-buckets like digit_0 = 1) are skipped.
            // Catches ~99.94 % of long-scalar duplicates against MSM_DUMP's
            // theoretical maximum (`dup_input_extras`).
            {
                BB_BENCH_NAME("MSM_fast::PhaseA_dedup_detect_hash");
                const size_t* const w0_bucket_start = bucket_start_all.data();
                std::atomic<size_t> dedup_cluster_count{ 0 };
                round_parallel_detail::msm_parallel_for(num_threads, [&, w0_bucket_start](size_t tid) noexcept {
                    const size_t b_lo = 1 + ((tid * (B_R - 1)) / num_threads);
                    const size_t b_hi = 1 + (((tid + 1) * (B_R - 1)) / num_threads);
                    const uint32_t cid_lo = static_cast<uint32_t>(tid) * cids_per_thread;
                    const uint32_t cid_max = cid_lo + cids_per_thread;
                    const size_t local_clusters = round_parallel_detail::dedup_phase_a_worker_hash<Curve>(
                        sched_w0,
                        w0_bucket_start,
                        b_lo,
                        b_hi,
                        std::span<const ScalarField>(scalars.data(), n),
                        points,
                        std::span<AffineElement>(dedup_state.extra_points),
                        std::span<uint32_t>(dedup_state.redirect_lookup),
                        msb_per_scalar.data(),
                        window_bits,
                        cid_lo,
                        cid_max,
                        phase_a_scratch[tid]);
                    if (local_clusters != 0) {
                        dedup_cluster_count.fetch_add(local_clusters, std::memory_order_relaxed);
                    }
                });
                dedup_state.n_dedup_extras = dedup_cluster_count.load(std::memory_order_relaxed);
            }
            phase_a_done = true;
        }

        // Schedule patch post-pass: tags cluster-member entries with SKIP/REDIRECT bits.
        // Runs only for the batch that just ran Phase A: later batches with known dedup
        // state skip non-reps in Stage 1/4 and emit redirect reps directly.
        // Parallel by window (one window per worker) because each window's slice of the
        // schedule is disjoint. Hoisting `redirect_lookup.data()` to a raw pointer outside
        // the lambda + passing it by value into the inner function avoids the per-iter
        // closure-indirection chain that made the inline form 3× slower per iter on WASM.
        auto partition_chunks_for_window = [&](size_t w) noexcept {
            const size_t* bucket_start = bucket_start_all.data() + (w * (bucket_stride + 1));
            const size_t* const bucket_start_end = bucket_start + B_R + 1;
            size_t* chunk_start = chunk_start_all.data() + (w * (num_threads + 1));
            size_t* chunk_bucket_lo = chunk_bucket_lo_all.data() + (w * (num_threads + 1));
            size_t* chunk_bucket_hi = chunk_bucket_hi_all.data() + (w * num_threads);
            const size_t m = bucket_start[B_R];
            const size_t* search_begin = bucket_start + 1;
            size_t lo = 0;
            chunk_start[0] = lo;
            for (size_t t = 0; t < num_threads; ++t) {
                const size_t hi = ((t + 1) == num_threads) ? m : (((t + 1) * m) / num_threads);
                chunk_start[t + 1] = hi;
                if (lo < hi) {
                    const size_t* const lo_it = std::upper_bound(search_begin, bucket_start_end, lo);
                    const size_t lo_bucket = static_cast<size_t>(lo_it - bucket_start - 1);
                    const size_t* const hi_it = std::upper_bound(lo_it, bucket_start_end, hi - 1);
                    const size_t hi_bucket = static_cast<size_t>(hi_it - bucket_start - 1);
                    chunk_bucket_lo[t] = lo_bucket;
                    chunk_bucket_hi[t] = hi_bucket;
                    search_begin = hi_it;
                } else {
                    chunk_bucket_lo[t] = B_R;
                    chunk_bucket_hi[t] = 0;
                }
                lo = hi;
            }
            chunk_bucket_lo[num_threads] = B_R;
        };

        bool chunk_partition_done = false;
        if (dedup_active && windows_in_batch > 0 && phase_a_done && !phase_a_done_at_batch_start) {
            BB_BENCH_NAME("MSM_fast::dedup_patch_schedule");
            const uint32_t* const rl_data = dedup_state.redirect_lookup.data();
            const size_t bs_stride = bucket_stride + 1;
            const size_t br = B_R;
            const size_t cap_R = n;
            round_parallel_detail::msm_parallel_for(
                num_threads, [&, rl_data, bs_stride, br, cap_R](size_t tid) noexcept {
                    for (size_t w = tid; w < windows_in_batch; w += num_threads) {
                        uint32_t* sched_w = schedule.data() + (w * cap_R);
                        size_t* bucket_start_w = bucket_start_all.data() + (w * bs_stride);
                        round_parallel_detail::dedup_patch_schedule_window<Curve>(sched_w, bucket_start_w, br, rl_data);
                        partition_chunks_for_window(w);
                    }
                });
            chunk_partition_done = true;
        }

        // Per-window chunk partition at schedule-index granularity (chunk_start[t] = t·m/T).
        // Balances across threads regardless of bucket-distribution skew. When the partition
        // lands mid-bucket, both adjacent threads build their own partial into the boundary
        // bucket; chunk_contribution combines them in Stage 7.
        {
            BB_BENCH_NAME("MSM_fast::Stage5_chunk_partition");
            if (!chunk_partition_done) {
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    partition_chunks_for_window(w);
                }
            }
        }

        // Stage 6 bucket accumulation per thread:
        //   (1) For each window w: reduce_chunk emits a digit-sorted (point, digit) list,
        //       which we densify into a per-window dense bucket array at
        //       tid's affine bucket buffer + w * stride. Empty slots stay identity.
        //   (2) Call recursive_affine_bucket_reduce_strided once across all windows_in_batch
        //       chunks; it computes (R_w, L_w) for each non-empty chunk via batch-affine
        //       arithmetic, amortising the inversion across windows at every phase step.
        //   (3) chunk_contribution(out) folds L_w + (lo_w-1)·R_w into the thread's per-window
        //       partial.
        // The Stage-6 scratch is pre-sized for every thread BEFORE entering the parallel_for
        // so the per-thread vector resizes don't race the heap allocator.
        auto next_pow2 = [](size_t x) -> size_t {
            if (x <= 1) {
                return 1;
            }
            size_t p = 1;
            while (p < x) {
                p <<= 1;
            }
            return p;
        };
        // Drives reduce_chunk's per-thread tree-reduce buffer sizing.
        size_t max_chunk_len = 0;
        for (size_t t = 0; t < num_threads; ++t) {
            for (size_t w = 0; w < windows_in_batch; ++w) {
                const size_t* chunk_start = chunk_start_all.data() + (w * (num_threads + 1));
                const size_t entries_in_chunk = chunk_start[t + 1] - chunk_start[t];
                if (entries_in_chunk == 0) {
                    continue;
                }
                max_chunk_len = std::max(max_chunk_len, entries_in_chunk);
            }
        }

        // global_stride drives the per-thread `dense_buckets` layout (sized via
        // `ensure_affine_bucket_capacity` below). Stage 6a writes its per-thread bucket
        // partials into `bucket_partials_dense` (a separate buffer packed via
        // `bucket_partials_offsets`, no power-of-two stride); Stage 6b copies them into
        // `s.dense_buckets` keyed by Stage 6b's uniform bucket-index slice of width
        // `buckets_per_task ≈ ⌈(num_buckets-1)/T⌉`. The recursive bucket-reduction
        // algorithm (phases A-D) operates on `s.dense_buckets` with power-of-two row
        // stride — that's where `next_pow2` matters.
        size_t global_stride = 0;

        {
            // Stage 6b's bucket-balanced partition. Uniform across windows: each rebalanced
            // task t' owns active digits [d_lo'[t'], d_hi'[t']] where d_lo'[t'] = 1 + t · (B-1) / T.
            const size_t active_digits = (B_R > 0) ? (B_R - 1) : 0;
            for (size_t t = 0; t <= num_threads; ++t) {
                rebalanced_bucket_lo_partition[t] = 1 + (t * active_digits) / num_threads;
            }
            rebalanced_bucket_lo_partition[num_threads] = B_R;
            size_t max_buckets_per_task = 0;
            for (size_t t = 0; t + 1 <= num_threads; ++t) {
                const size_t hi_d = (t + 1 == num_threads) ? (B_R - 1) : (rebalanced_bucket_lo_partition[t + 1] - 1);
                const size_t lo_d = rebalanced_bucket_lo_partition[t];
                if (hi_d >= lo_d) {
                    max_buckets_per_task = std::max(max_buckets_per_task, hi_d - lo_d + 1);
                }
            }
            global_stride = next_pow2(max_buckets_per_task);
            global_stride = std::max<size_t>(global_stride, 2);

            // Per-window orig-thread contributing ranges (O(W·T·T) total — only paid for
            // the rebalance path, where T is small enough that this is sub-µs).
            for (size_t w = 0; w < windows_in_batch; ++w) {
                const size_t* chunk_bucket_lo = chunk_bucket_lo_all.data() + (w * (num_threads + 1));
                const size_t* chunk_bucket_hi = chunk_bucket_hi_all.data() + (w * num_threads);
                const size_t* chunk_start_w = chunk_start_all.data() + (w * (num_threads + 1));
                for (size_t tprime = 0; tprime < num_threads; ++tprime) {
                    const size_t lo_d = rebalanced_bucket_lo_partition[tprime];
                    const size_t hi_d =
                        (tprime + 1 == num_threads) ? (B_R - 1) : (rebalanced_bucket_lo_partition[tprime + 1] - 1);
                    size_t lo_orig = num_threads;
                    size_t hi_orig = 0;
                    for (size_t t = 0; t < num_threads; ++t) {
                        const size_t entries = chunk_start_w[t + 1] - chunk_start_w[t];
                        if (entries == 0) {
                            continue;
                        }
                        const size_t cl = chunk_bucket_lo[t];
                        const size_t ch = chunk_bucket_hi[t];
                        if (ch < lo_d || cl > hi_d) {
                            continue;
                        }
                        if (lo_orig == num_threads) {
                            lo_orig = t;
                        }
                        hi_orig = t;
                    }
                    orig_thread_lo[(w * num_threads) + tprime] = lo_orig;
                    orig_thread_hi[(w * num_threads) + tprime] = hi_orig;
                }
            }

            // bucket_partials_dense / _present packed via bucket_partials_offsets — each
            // (thread, window) row holds exactly buckets_per_thread[t][w] AffineElements (no
            // padding). The arena pre-sized to `windows_per_batch · (num_buckets - 1 + T)`
            // (covers the T-1 boundary-bucket shares); only the actual prefix is touched.
            size_t bucket_partials_cursor = 0;
            for (size_t t = 0; t < num_threads; ++t) {
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    bucket_partials_offsets[(t * windows_in_batch) + w] = bucket_partials_cursor;
                    const size_t* chunk_bucket_lo_w = chunk_bucket_lo_all.data() + (w * (num_threads + 1));
                    const size_t* chunk_bucket_hi_w = chunk_bucket_hi_all.data() + (w * num_threads);
                    const size_t* chunk_start_w = chunk_start_all.data() + (w * (num_threads + 1));
                    const size_t entries = chunk_start_w[t + 1] - chunk_start_w[t];
                    if (entries > 0) {
                        bucket_partials_cursor += chunk_bucket_hi_w[t] - chunk_bucket_lo_w[t] + 1;
                    }
                }
            }
            bucket_partials_offsets[num_threads * windows_in_batch] = bucket_partials_cursor;
            const size_t bucket_partials_total = bucket_partials_cursor;
            BB_ASSERT_LTE(bucket_partials_total, bucket_partials_dense.size());
            std::memset(bucket_partials_present.data(), 0, bucket_partials_total);
        }

        // thread_scratch is worker-indexed (one slot per OS thread, FIFO-shared by tasks);
        // update the stride on each worker's slot.
        for (size_t t = 0; t < worker_total; ++t) {
            thread_scratch[t].affine_bucket_stride = global_stride;
        }

        {
            // Stage 6a — per-thread bucket partials. Each thread `tid` reduces its schedule
            // slice via reduce_chunk and scatters the (digit, point) output directly into the
            // per-thread dense bucket buffer at slot `(digit - chunk_bucket_lo[tid])`. Stage
            // 6b then reads this buffer with O(1) slot lookup. `bucket_partials_present` is
            // pre-zeroed per batch.
            auto bucket_partials_per_thread_lambda = [&](size_t tid) {
                auto& s = thread_scratch[tid];
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    const size_t* chunk_start_w = chunk_start_all.data() + (w * (num_threads + 1));
                    const size_t cs_lo = chunk_start_w[tid];
                    const size_t cs_hi = chunk_start_w[tid + 1];
                    if (cs_lo == cs_hi) {
                        continue;
                    }
                    const uint32_t* sched_w = schedule.data() + (w * n);
                    const size_t* bucket_start = bucket_start_all.data() + (w * (bucket_stride + 1));
                    AffineElement* dst_dense =
                        bucket_partials_dense.data() + bucket_partials_offsets[(tid * windows_in_batch) + w];
                    uint8_t* dst_present =
                        bucket_partials_present.data() + bucket_partials_offsets[(tid * windows_in_batch) + w];
                    const size_t* chunk_bucket_lo = chunk_bucket_lo_all.data() + (w * (num_threads + 1));
                    const uint32_t my_lo = static_cast<uint32_t>(chunk_bucket_lo[tid]);
                    const size_t my_hi = chunk_bucket_hi_all[(w * num_threads) + tid];
                    size_t bucket_cursor = my_lo;

                    for (size_t pos = cs_lo; pos < cs_hi;) {
                        const size_t end = std::min(pos + SUBCHUNK_ENTRIES_CAP, cs_hi);
                        reduce_chunk<Curve>(s,
                                            sched_w,
                                            bucket_start,
                                            pos,
                                            end,
                                            bucket_cursor,
                                            my_hi,
                                            points,
                                            std::span<const AffineElement>(dedup_state.extra_points));
                        const size_t len = s.result_len;
                        for (size_t k = 0; k < len; ++k) {
                            const uint32_t d = s.curr_buckets[k];
                            const size_t slot = d - my_lo;
                            if (dst_present[slot]) {
                                s.overflow_slots[s.overflow_len] = static_cast<uint32_t>(slot);
                                s.overflow_pts[s.overflow_len] = s.curr_pts[k];
                                ++s.overflow_len;
                            } else {
                                dst_dense[slot] = s.curr_pts[k];
                                dst_present[slot] = 1;
                            }
                        }
                        pos = end;
                    }
                    merge_overflow<Curve>(s, dst_dense);
                }
            };

            // Stage 6b (cross-thread bucket reduction): each rebalanced task `tprime` owns a
            // uniform-width slice of the bucket-index space [d_lo'(tprime), d_hi'(tprime)].
            // For each window in the batch, walk the contributing original threads' Stage 6a
            // dense outputs (range [orig_thread_lo, orig_thread_hi]), filter to digits in
            // this task's slice, scatter into the task's local dense_buckets (with
            // projective-add accumulation on the at-most-2 boundary digits per pair of
            // contributing originals), then run recursive_affine_bucket_reduce_strided +
            // chunk_contribution on a guaranteed-equal buckets_padded across all tasks.
            auto bucket_reduce_cross_thread_lambda = [&](size_t tprime) {
                auto& s = thread_scratch[tprime];
                Element* my_partials = window_partial_sums.data() + (tprime * windows_per_batch);
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    my_partials[w] = Curve::Group::point_at_infinity;
                }

                const size_t stride = s.affine_bucket_stride;
                std::memset(s.is_present.data(), 0, windows_in_batch * stride);

                const size_t lo_d = rebalanced_bucket_lo_partition[tprime];
                const size_t hi_d =
                    (tprime + 1 == num_threads) ? (B_R - 1) : (rebalanced_bucket_lo_partition[tprime + 1] - 1);
                const uint32_t lo_d_u = static_cast<uint32_t>(lo_d);
                const uint32_t hi_d_u = static_cast<uint32_t>(hi_d);

                bool any_nonempty = false;
                for (size_t w = 0; w < windows_in_batch; ++w) {
                    auto& info = s.chunk_infos[w];
                    auto& out = chunk_outputs[(w * num_threads) + tprime];
                    if (lo_d > hi_d) {
                        info.empty = 1;
                        info.lo = 0;
                        info.hi = 0;
                        info.buckets_padded = 0;
                        out.empty = 1;
                        continue;
                    }
                    const size_t orig_lo = orig_thread_lo[(w * num_threads) + tprime];
                    const size_t orig_hi = orig_thread_hi[(w * num_threads) + tprime];
                    if (orig_lo == num_threads) {
                        info.empty = 1;
                        info.lo = 0;
                        info.hi = 0;
                        info.buckets_padded = 0;
                        out.empty = 1;
                        continue;
                    }
                    const size_t base = w * stride;
                    bool has_data = false;

                    // bucket_partials_dense holds per-(orig_t, w, slot) bucket points with
                    // bucket_partials_present as the populated-slot bitmap. For each
                    // contributing orig_t, intersect its [chunk_bucket_lo, chunk_bucket_hi]
                    // range with this task's [lo_d, hi_d] slice and walk the intersection
                    // only — no sorted scan, O(1) lookup per slot.
                    const size_t* chunk_bucket_lo_w = chunk_bucket_lo_all.data() + (w * (num_threads + 1));
                    const size_t* chunk_bucket_hi_w = chunk_bucket_hi_all.data() + (w * num_threads);
                    for (size_t t = orig_lo; t <= orig_hi; ++t) {
                        const size_t cl = chunk_bucket_lo_w[t];
                        const size_t ch = chunk_bucket_hi_w[t];
                        const size_t d_lo_clip = std::max<size_t>(lo_d, cl);
                        const size_t d_hi_clip = std::min<size_t>(hi_d, ch);
                        if (d_lo_clip > d_hi_clip) {
                            continue;
                        }
                        const AffineElement* src_dense =
                            bucket_partials_dense.data() + bucket_partials_offsets[(t * windows_in_batch) + w];
                        const uint8_t* src_present =
                            bucket_partials_present.data() + bucket_partials_offsets[(t * windows_in_batch) + w];
                        for (size_t d = d_lo_clip; d <= d_hi_clip; ++d) {
                            const size_t src_slot = d - cl;
                            if (src_present[src_slot] == 0) {
                                continue;
                            }
                            const size_t dst_slot = base + (d - lo_d);
                            if (s.is_present[dst_slot] == 0) {
                                s.dense_buckets[dst_slot] = src_dense[src_slot];
                                s.is_present[dst_slot] = 1;
                            } else {
                                // Boundary digit shared between two consecutive originals
                                // — projective add then re-normalise to affine. Under the
                                // contiguous-by-schedule-index partition there are at most
                                // W boundary points per task.
                                Element acc = Element(s.dense_buckets[dst_slot]);
                                acc += Element(src_dense[src_slot]);
                                s.dense_buckets[dst_slot] = AffineElement(acc);
                            }
                            has_data = true;
                        }
                    }
                    if (!has_data) {
                        info.empty = 1;
                        info.lo = 0;
                        info.hi = 0;
                        info.buckets_padded = 0;
                        out.empty = 1;
                        continue;
                    }
                    any_nonempty = true;
                    const size_t M = hi_d - lo_d + 1;
                    const uint32_t buckets_padded =
                        (M == 1) ? 1 : (uint32_t{ 1 } << (32 - __builtin_clz(static_cast<uint32_t>(M - 1))));
                    info.empty = 0;
                    info.lo = lo_d_u;
                    info.hi = hi_d_u;
                    info.buckets_padded = buckets_padded;
                    out.empty = 0;
                    out.lo = lo_d_u;
                    out.hi = hi_d_u;
                }

                if (!any_nonempty) {
                    return;
                }

                round_parallel_detail::recursive_affine_bucket_reduce_strided<Curve>(
                    s, s.chunk_infos.data(), windows_in_batch, chunk_outputs.data() + tprime, num_threads);

                for (size_t w = 0; w < windows_in_batch; ++w) {
                    auto& out = chunk_outputs[(w * num_threads) + tprime];
                    if (out.empty == 0) {
                        my_partials[w] = round_parallel_detail::chunk_contribution<Curve>(out);
                    }
                }
            };

            {
                BB_BENCH_NAME("MSM_fast::Stage6a_bucket_partials");
                round_parallel_detail::msm_parallel_for(num_threads, bucket_partials_per_thread_lambda);
            }
            {
                BB_BENCH_NAME("MSM_fast::Stage6b_reduce_cross_thread");
                round_parallel_detail::msm_parallel_for(num_threads, bucket_reduce_cross_thread_lambda);
            }
        }

        // Stage 7 (cross-window combine): per-window reduce of `num_threads` per-thread partials.
        // (Algebraic identity: `Σ_t (L_t + (lo_t − 1) · R_t) = window's bucket sum`,
        // with the per-chunk contributions already accumulated above.)
        {
            BB_BENCH_NAME("MSM_fast::Stage7_combine");
            const size_t reduce_threads = std::min(num_threads, windows_in_batch);
            round_parallel_detail::msm_parallel_for(reduce_threads, [&](size_t rid) {
                const size_t lo = rid * windows_in_batch / reduce_threads;
                const size_t hi = (rid + 1) * windows_in_batch / reduce_threads;
                for (size_t w = lo; w < hi; ++w) {
                    Element sum = Curve::Group::point_at_infinity;
                    for (size_t tid = 0; tid < num_threads; ++tid) {
                        sum += window_partial_sums[(tid * windows_per_batch) + w];
                    }
                    window_sums[batch_start + w] = sum;
                }
            });
        }
    };

    // Uniform-schedule dispatch over all windows.
    {
        const size_t B_R = (size_t{ 1 } << (window_bits - 1)) + 1;
        for (size_t batch_start = 0; batch_start < sched.num_windows; batch_start += windows_per_batch) {
            const size_t windows_in_batch = std::min(windows_per_batch, sched.num_windows - batch_start);
            run_batch(batch_start, windows_in_batch, B_R);
        }
    }

    // Stage 7 horner: walk high-to-low, doubling by `window_bits_per_window[w]` between adjacent windows.
    // Init from the top window to skip a wasted doubling on identity.
    Element result = (sched.num_windows == 0) ? Curve::Group::point_at_infinity : window_sums[sched.num_windows - 1];
    for (size_t w_rev = sched.num_windows - 1; w_rev > 0; --w_rev) {
        const size_t window_bits_w = sched.window_bits_per_window[w_rev - 1];
        for (size_t d = 0; d < window_bits_w; ++d) {
            result.self_dbl();
        }
        result += window_sums[w_rev - 1];
    }

    // GLV path leaves input_scalars untouched (it reads via from_montgomery_form_reduced into
    // a temporary). Non-GLV path mutated in place above and must restore.
    if (!use_glv) {
        round_parallel_detail::msm_parallel_for(hw_threads, [&](const ThreadChunk& chunk) {
            for (size_t i : chunk.range(n_input)) {
                input_scalars[i].self_to_montgomery_form();
            }
        });
    }

    return result;
}

template <typename Curve>
typename Curve::Element pippenger_unsafe_fast(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                              std::span<const typename Curve::AffineElement> points,
                                              size_t dedup_info) noexcept
{
    return pippenger_round_parallel<Curve>(scalars, points, dedup_info);
}

template <typename Curve>
typename Curve::Element pippenger_fast(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                       std::span<const typename Curve::AffineElement> points,
                                       bool handle_edge_cases,
                                       size_t dedup_info) noexcept
{
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    if (!handle_edge_cases) {
        return pippenger_round_parallel<Curve>(scalars, points, dedup_info);
    }
    // Edge-case-handling path: route through the Jacobian fast-path. It uses
    // Jacobian additions throughout, so point-at-infinity and equal-x bucket
    // collisions don't trigger the affine-add edge-case bug. We need to convert
    // PolynomialSpan to a plain ScalarField span: the jacobian fast-path takes
    // a contiguous std::span and ignores `start_index`.
    const size_t n = scalars.span.size();
    if (n == 0) {
        return Curve::Group::point_at_infinity;
    }
    // Trivially small N: skip Pippenger / Jacobian-fast-path scaffolding entirely.
    // Affine operator* + Jacobian sum already handles all edge cases.
    if (n < 4) {
        return trivial_msm<Curve>(scalars, points);
    }
    const auto& start = scalars.start_index;
    if (start >= points.size()) {
        return Curve::Group::point_at_infinity;
    }
    const size_t n_used = std::min<size_t>(n, points.size() - start);
    std::span<const typename Curve::AffineElement> point_slice(points.data() + start, n_used);
    std::span<const ScalarField> scalar_slice(scalars.span.data(), n_used);
    // Convert scalars to non-Montgomery form for the jacobian path's bit-extraction loop,
    // then restore. Mirrors the round-parallel fast-path's scalar lifecycle.
    // Use the `_reduced` variant: the bit-extraction loop reads only bits 0..253
    // (NUM_BITS = 254). Plain `self_from_montgomery_form` leaves the value in [0, 2p),
    // so values in [2^254, 2p) would have bit 254 set and silently drop the contribution
    // of that bit. `_reduced` brings the value into [0, p) ⊂ [0, 2^254).
    auto* mutable_scalars =
        const_cast<ScalarField*>(scalar_slice.data()); // NOLINT(cppcoreguidelines-pro-type-const-cast)
    bb::parallel_for(bb::get_num_cpus(), [&](const ThreadChunk& chunk) {
        for (size_t i : chunk.range(n_used)) {
            mutable_scalars[i].self_from_montgomery_form_reduced();
        }
    });
    const Element result =
        round_parallel_detail::pippenger_round_parallel_jacobian_fast<Curve>(scalar_slice, point_slice, 0, 0);
    bb::parallel_for(bb::get_num_cpus(), [&](const ThreadChunk& chunk) {
        for (size_t i : chunk.range(n_used)) {
            mutable_scalars[i].self_to_montgomery_form();
        }
    });
    return result;
}

template <typename Curve>
typename Curve::AffineElement MSM_fast<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                                   PolynomialSpan<const typename Curve::ScalarField> scalars,
                                                   bool handle_edge_cases,
                                                   size_t dedup_info) noexcept
{
    return AffineElement(pippenger_fast<Curve>(scalars, points, handle_edge_cases, dedup_info));
}

#include "./pippenger_batched.hpp"

// Explicit instantiations.
template curve::BN254::Element pippenger_unsafe_fast<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    size_t dedup_info) noexcept;
template curve::Grumpkin::Element pippenger_unsafe_fast<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    size_t dedup_info) noexcept;
template curve::BN254::Element pippenger_fast<curve::BN254>(PolynomialSpan<const curve::BN254::ScalarField> scalars,
                                                            std::span<const curve::BN254::AffineElement> points,
                                                            bool handle_edge_cases,
                                                            size_t dedup_info) noexcept;
template curve::Grumpkin::Element pippenger_fast<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    bool handle_edge_cases,
    size_t dedup_info) noexcept;
template class MSM_fast<curve::BN254>;
template class MSM_fast<curve::Grumpkin>;

template curve::BN254::Element pippenger_round_parallel<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    size_t dedup_info,
    std::span<const curve::BN254::AffineElement> external_glv_doubled,
    std::span<std::byte> external_arena,
    size_t max_threads) noexcept;

template curve::Grumpkin::Element pippenger_round_parallel<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    size_t dedup_info,
    std::span<const curve::Grumpkin::AffineElement> external_glv_doubled,
    std::span<std::byte> external_arena,
    size_t max_threads) noexcept;

template curve::BN254::Element trivial_msm<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars_span,
    std::span<const curve::BN254::AffineElement> all_points) noexcept;

template curve::Grumpkin::Element trivial_msm<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars_span,
    std::span<const curve::Grumpkin::AffineElement> all_points) noexcept;

template curve::BN254::Element trivial_msm_threaded<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars_span,
    std::span<const curve::BN254::AffineElement> all_points,
    size_t max_threads) noexcept;

template curve::Grumpkin::Element trivial_msm_threaded<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars_span,
    std::span<const curve::Grumpkin::AffineElement> all_points,
    size_t max_threads) noexcept;

namespace round_parallel_detail {
template curve::BN254::Element pippenger_round_parallel_jacobian_fast<curve::BN254>(
    std::span<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    size_t min_pts_per_thread_override,
    size_t max_threads) noexcept;

template curve::Grumpkin::Element pippenger_round_parallel_jacobian_fast<curve::Grumpkin>(
    std::span<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    size_t min_pts_per_thread_override,
    size_t max_threads) noexcept;
} // namespace round_parallel_detail

template size_t compute_arena_bytes_for_msm<curve::BN254>(size_t, bool, bool, size_t) noexcept;

} // namespace bb::scalar_multiplication
