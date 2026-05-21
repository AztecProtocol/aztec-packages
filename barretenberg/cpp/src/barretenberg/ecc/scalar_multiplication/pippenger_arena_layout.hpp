// Per-worker arena layout for the round-parallel Pippenger MSM (Zone W slab).
//
// Canonical source of truth for the per-worker byte walk that was previously
// duplicated across `compute_arena_bytes_for_msm`, the live allocator inside
// `pippenger_round_parallel`, and `pippenger_bn254_arena_layout_fits_for_test`.
// The historical arena drift bugs (cluster_offsets miscount, wasm
// aligned_local overflow, NO_GLV abort, t1 abort) all traced to disagreements
// between those copies; this struct removes that class by computing the layout
// once.
//
// The constructor's layout walk mirrors the live allocator's `layout_add`
// sequence exactly, including alignment slop. The sizer's previous
// arithmetic-only formula did not honour per-allocation alignment, so it
// systematically under-counted by a few bytes per slab; the struct fixes that
// by construction.
//
// Phase A and Stage 6 fields overlay the same per-worker bytes because the
// parallel_for invocations are disjoint (Phase A runs on the first window
// batch, Stage 6 runs per batch thereafter, and never on the same worker
// concurrently). `per_worker_union_bytes = max(ts_fixed, pa_layout)`.

#pragma once

#include "barretenberg/numeric/bitop/get_msb.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <utility>

namespace bb::scalar_multiplication::round_parallel_detail {

// ============================================================================
// Round-parallel internals exposed to the test suite.
//
// `pippenger_bn254_arena_layout_fits_for_test` is a TU-local helper that walks
// the actual Zone P / Zone W / Zone S allocator for representative inputs and
// asserts the result fits in `compute_arena_bytes_for_msm`'s promise. Its body
// lives in `scalar_multiplication.test.cpp`, which means the helpers it needs
// (`choose_window_bits`, `build_var_window_schedule`, `ChunkOutput`,
// `DEDUP_MAX_*`, `VAR_WINDOW_MAX_WINDOWS`, `compute_arena_bytes_for_msm`) need
// header-visible declarations.
// ============================================================================

// Per-window count cap shared by `VariableWindowSchedule` arrays and the live
// allocator's `window_sums_storage` slot.
inline constexpr size_t VAR_WINDOW_MAX_WINDOWS = 128;

// Dedup pre-pass caps. DEDUP_MAX_CLUSTERS bounds `extra_points` at ≤ 1 MB;
// DEDUP_MAX_MEMBERS bounds the per-worker `cluster_members` slab.
inline constexpr size_t DEDUP_MAX_CLUSTERS = 16384;
inline constexpr size_t DEDUP_MAX_MEMBERS = 32768;

// Uniform window schedule produced by `build_var_window_schedule`. Holds the
// per-window `c` value and bucket count for downstream sizing/dispatch.
struct VariableWindowSchedule {
    size_t W_lo = 0;                                                      // # of windows
    size_t num_windows = 0;                                               // = W_lo
    std::array<uint8_t, VAR_WINDOW_MAX_WINDOWS> window_bits_per_window{}; // window_bits_w for each w
    std::array<uint16_t, VAR_WINDOW_MAX_WINDOWS> bit_base{};              // B_w = Σ_{k<w} c_k, B_0 = 0
    std::array<uint16_t, VAR_WINDOW_MAX_WINDOWS> num_buckets{};           // 2^(window_bits_w - 1) + 1
};

// Per-chunk recursive-affine bucket-reduce output (Stage 6b output cell).
template <typename Curve> struct ChunkOutput {
    typename Curve::Element R{};
    typename Curve::Element L{};
    uint32_t lo = 0;
    uint32_t hi = 0;
    uint8_t empty = 1;
};

// Pick the optimal window size `c`. Native uses a cost model
// `rounds * (n + 15 * buckets)`; WASM uses a closed-form `target_load` formula.
[[nodiscard]] inline uint32_t choose_window_bits(
    size_t num_points, size_t num_bits, size_t n_input, size_t num_logical_threads, bool use_rebalance) noexcept
{
    constexpr uint32_t MAX_C = 20;
    uint32_t best = 2;

#ifdef __wasm__
    static_cast<void>(num_bits);
    static_cast<void>(use_rebalance);
    const size_t target_load = (n_input > 4096) ? (num_logical_threads * 2 / 3) : (num_logical_threads / 3);
    if (target_load == 0 || num_points <= target_load) {
        best = 2;
    } else {
        const size_t ratio = num_points / target_load;
        const uint32_t lg = static_cast<uint32_t>(numeric::get_msb(ratio));
        best = lg + 1;
        if (best < 2) {
            best = 2;
        } else if (best >= MAX_C) {
            best = MAX_C - 1;
        }
    }
#else
    static_cast<void>(n_input);
    static_cast<void>(num_logical_threads);
    static_cast<void>(use_rebalance);
    uint64_t best_cost = static_cast<uint64_t>(-1);
    for (uint32_t window_bits = 2; window_bits < MAX_C; ++window_bits) {
        const uint64_t rounds = (num_bits + 2 + window_bits - 1) / window_bits;
        const uint64_t buckets = (uint64_t{ 1 } << (window_bits - 1)) + 1;
        const uint64_t n = num_points;
        constexpr uint64_t BUCKET_ACC_COST = 15;
        const uint64_t cost = rounds * (n + (buckets * BUCKET_ACC_COST));
        if (cost < best_cost) {
            best_cost = cost;
            best = window_bits;
        }
    }
#endif

    return best;
}

// Build a uniform window schedule for the given bit budget and chosen `c`.
inline VariableWindowSchedule build_var_window_schedule(size_t num_bits, size_t window_bits_unsplit) noexcept
{
    VariableWindowSchedule sched{};

    auto fill_region = [&](size_t bits_in_region, size_t window_bits_R, size_t out_offset) -> size_t {
        size_t bits_remaining = bits_in_region;
        size_t w = out_offset;
        size_t bit_offset = (w == 0) ? 0 : sched.bit_base[w - 1] + sched.window_bits_per_window[w - 1];
        while (bits_remaining > 0) {
            const size_t window_bits_w = std::min<size_t>(window_bits_R, bits_remaining);
            sched.bit_base[w] = static_cast<uint16_t>(bit_offset);
            sched.window_bits_per_window[w] = static_cast<uint8_t>(window_bits_w);
            sched.num_buckets[w] = static_cast<uint16_t>((size_t{ 1 } << (window_bits_w - 1)) + 1);
            bit_offset += window_bits_w;
            bits_remaining -= window_bits_w;
            ++w;
            if (w >= VAR_WINDOW_MAX_WINDOWS) {
                break;
            }
        }
        return w - out_offset;
    };

    const size_t total_bits = num_bits + 2;
    sched.W_lo = fill_region(total_bits, window_bits_unsplit, /*out_offset=*/0);
    sched.num_windows = sched.W_lo;
    return sched;
}

// Maximum number of independent additions batched per modular inversion in the
// affine-arithmetic group ops (used by Stage 6a/6b). Sizes per-worker
// `points_to_add`, `inversion_scratch`, and `pair_dest` arrays.
inline constexpr size_t BATCH_CAPACITY = 256;

// Phase A's chunked tree-reduce limit. Capped so the per-worker scratch slab
// (chunk_pts + chunk_ids) stays under ~128 KB.
inline constexpr size_t DEDUP_MAX_CHUNK_MEMBERS = 2048;

// Per-bucket-chunk metadata produced by Stage 6a, consumed by Stage 6b's
// cross-thread reduce.
//   lo, hi          — lowest / highest non-empty digit in the chunk (inclusive)
//   buckets_padded  — next power of two ≥ (hi - lo + 1)
//   empty           — 1 iff the chunk had no entries (Stage 6b skips it)
struct AffineBucketChunkInfo {
    uint32_t lo = 0;
    uint32_t hi = 0;
    uint32_t buckets_padded = 0;
    uint8_t empty = 1;
};

template <typename Curve> struct PerWorkerArenaLayout {
    using AffineElement = typename Curve::AffineElement;
    using BaseField = typename Curve::BaseField;

    // Caps shared between sizer and allocator. Centralised here so the two
    // sites can't diverge.
    static constexpr size_t PHASE_A_DIRTY_SLOTS_CAP = 4096; // HT_SIZE
    static constexpr size_t PHASE_A_BUCKET_REP_CAP = 256;   // loose cap
    static constexpr size_t PHASE_A_STAGED_CAP = 1024;      // loose cap
    static constexpr size_t PHASE_A_CHUNK_CAP = DEDUP_MAX_CHUNK_MEMBERS;
    static constexpr size_t WORKER_SLAB_ALIGN = alignof(AffineElement);

    // Computed byte sizes (filled by constructor's layout walk).
    size_t ts_fixed_layout = 0;           // ThreadScratch wpb-independent fields, with align slop
    size_t pa_layout = 0;                 // PhaseAScratch fields, with align slop
    size_t per_worker_union_bytes = 0;    // = align_up(max(ts_fixed_layout, pa_layout), WORKER_SLAB_ALIGN)
    size_t per_worker_per_wpb_layout = 0; // Stage 6 wpb-dependent tail
    size_t per_worker_bytes = 0;          // = align_up(union + tail, WORKER_SLAB_ALIGN)

    // Constructor performs the canonical layout walk. `windows_per_batch` and
    // `dense_stride_est` may be zero — only the wpb-independent parts then
    // have meaningful values, useful for the sizer's pre-wpb-solve step.
    PerWorkerArenaLayout(size_t chunk_capacity,
                         size_t global_max_overflow_per_window,
                         bool dedup_active,
                         size_t phase_a_cluster_members_cap,
                         size_t phase_a_cluster_offsets_cap,
                         size_t windows_per_batch,
                         size_t dense_stride_est) noexcept
    {
        auto align_up = [](size_t off, size_t align) -> size_t { return (off + align - 1) & ~(align - 1); };
        auto layout_add = [&](size_t& off, size_t bytes, size_t align) { off = align_up(off, align) + bytes; };

        // ThreadScratch fixed (curr_pts / curr_buckets / points_to_add /
        // inversion_scratch / pair_dest / overflow_slots / overflow_pts).
        layout_add(ts_fixed_layout, sizeof(AffineElement) * chunk_capacity, alignof(AffineElement));
        layout_add(ts_fixed_layout, sizeof(uint32_t) * chunk_capacity, alignof(uint32_t));
        layout_add(ts_fixed_layout, sizeof(AffineElement) * 2 * BATCH_CAPACITY, alignof(AffineElement));
        layout_add(ts_fixed_layout, sizeof(BaseField) * BATCH_CAPACITY, alignof(BaseField));
        layout_add(ts_fixed_layout, sizeof(uint32_t) * BATCH_CAPACITY, alignof(uint32_t));
        layout_add(ts_fixed_layout, sizeof(uint32_t) * global_max_overflow_per_window, alignof(uint32_t));
        layout_add(ts_fixed_layout, sizeof(AffineElement) * global_max_overflow_per_window, alignof(AffineElement));

        // PhaseA (cluster_members / cluster_offsets / dirty_slots / bucket_rep
        // / staged / chunk_pts / chunk_ids). Only allocated when dedup_active.
        if (dedup_active) {
            layout_add(pa_layout, sizeof(uint32_t) * phase_a_cluster_members_cap, alignof(uint32_t));
            layout_add(pa_layout, sizeof(uint32_t) * phase_a_cluster_offsets_cap, alignof(uint32_t));
            layout_add(pa_layout, sizeof(uint16_t) * PHASE_A_DIRTY_SLOTS_CAP, alignof(uint16_t));
            layout_add(pa_layout, sizeof(uint32_t) * PHASE_A_BUCKET_REP_CAP, alignof(uint32_t));
            layout_add(pa_layout,
                       sizeof(std::pair<uint32_t, uint32_t>) * PHASE_A_STAGED_CAP,
                       alignof(std::pair<uint32_t, uint32_t>));
            layout_add(pa_layout, sizeof(AffineElement) * PHASE_A_CHUNK_CAP, alignof(AffineElement));
            layout_add(pa_layout, sizeof(uint32_t) * PHASE_A_CHUNK_CAP, alignof(uint32_t));
        }

        per_worker_union_bytes = align_up(std::max(ts_fixed_layout, pa_layout), WORKER_SLAB_ALIGN);

        // Stage 6 wpb-dependent tail (dense_buckets / is_present / pair
        // scratch / chunk_infos). Skipped when windows_per_batch == 0 (sizer's
        // pre-wpb-solve call).
        if (windows_per_batch != 0) {
            const size_t dense_total = windows_per_batch * dense_stride_est;
            const size_t dense_pair_max = dense_total / 2;
            layout_add(per_worker_per_wpb_layout, sizeof(AffineElement) * dense_total, alignof(AffineElement));
            layout_add(per_worker_per_wpb_layout, sizeof(uint8_t) * dense_total, alignof(uint8_t));
            layout_add(per_worker_per_wpb_layout,
                       sizeof(std::pair<uint32_t, uint32_t>) * dense_pair_max,
                       alignof(std::pair<uint32_t, uint32_t>));
            layout_add(per_worker_per_wpb_layout, sizeof(uint32_t) * dense_pair_max, alignof(uint32_t));
            layout_add(per_worker_per_wpb_layout, sizeof(BaseField) * dense_pair_max, alignof(BaseField));
            layout_add(per_worker_per_wpb_layout,
                       sizeof(AffineBucketChunkInfo) * windows_per_batch,
                       alignof(AffineBucketChunkInfo));
        }

        per_worker_bytes = align_up(per_worker_union_bytes + per_worker_per_wpb_layout, WORKER_SLAB_ALIGN);
    }
};

} // namespace bb::scalar_multiplication::round_parallel_detail
