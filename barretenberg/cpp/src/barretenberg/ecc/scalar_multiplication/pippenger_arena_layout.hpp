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
#include <bit>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
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
    size_t num_windows = 0;
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
[[nodiscard]] inline uint32_t choose_window_bits(size_t num_points,
                                                 size_t num_bits,
                                                 size_t n_input,
                                                 size_t num_logical_threads) noexcept
{
    constexpr uint32_t MAX_C = 20;
    uint32_t best = 2;

    // TEMP (investigation): force window_bits via BB_MSM_FORCE_C to probe the 2^20 c-plateau dip.
    if (const char* fc = std::getenv("BB_MSM_FORCE_C")) {
        const auto c = static_cast<uint32_t>(std::atoi(fc));
        if (c >= 2 && c < MAX_C) {
            return c;
        }
    }

#ifdef __wasm__
    static_cast<void>(num_bits);
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
    uint64_t best_cost = static_cast<uint64_t>(-1);
    for (uint32_t window_bits = 2; window_bits < MAX_C; ++window_bits) {
        const uint64_t rounds = (num_bits + 2 + window_bits - 1) / window_bits;
        const uint64_t buckets = (uint64_t{ 1 } << (window_bits - 1)) + 1;
        const uint64_t n = num_points;
        // Per-bucket cost relative to a per-point op. Recalibrated 15 -> 3 against measured
        // native HC2/4/8 sweeps (2^17..2^21): the round-parallel accumulator's real per-bucket
        // cost is much lower than the old 15, which under-sized c by ~3 and left 13-20% on the
        // table at every size. c only changes the MSM's internal schedule, not the result.
        constexpr uint64_t BUCKET_ACC_COST = 3;
        const uint64_t cost = rounds * (n + (buckets * BUCKET_ACC_COST));
        if (cost < best_cost) {
            best_cost = cost;
            best = window_bits;
        }
    }
#endif

    return best;
}

// Build a uniform window schedule for the given bit budget and chosen `c`. Every window
// is `window_bits` wide except the final one, which takes the remaining bits. The +2 on
// the bit budget accommodates the carry-less top bit of the Constantine recoder.
inline VariableWindowSchedule build_var_window_schedule(size_t num_bits, size_t window_bits) noexcept
{
    VariableWindowSchedule sched{};

    size_t bits_remaining = num_bits + 2;
    size_t bit_offset = 0;
    size_t w = 0;
    while (bits_remaining > 0 && w < VAR_WINDOW_MAX_WINDOWS) {
        const size_t window_bits_w = std::min<size_t>(window_bits, bits_remaining);
        sched.bit_base[w] = static_cast<uint16_t>(bit_offset);
        sched.window_bits_per_window[w] = static_cast<uint8_t>(window_bits_w);
        sched.num_buckets[w] = static_cast<uint16_t>((size_t{ 1 } << (window_bits_w - 1)) + 1);
        bit_offset += window_bits_w;
        bits_remaining -= window_bits_w;
        ++w;
    }
    sched.num_windows = w;
    return sched;
}

// Maximum number of independent additions batched per modular inversion in the
// affine-arithmetic group ops (used by Stage 6a/6b). Sizes per-worker
// `points_to_add`, `inversion_scratch`, and `pair_dest` arrays.
inline constexpr size_t BATCH_CAPACITY = 256;

// Phase A's chunked tree-reduce limit. Capped so the per-worker scratch slab
// (chunk_pts + chunk_ids) stays under ~128 KB.
inline constexpr size_t DEDUP_MAX_CHUNK_MEMBERS = 2048;

inline constexpr size_t MIN_BATCH_CAPACITY = 32;
inline constexpr size_t MIN_AFFINE_THREAD_RATIO = 2;
inline constexpr size_t SUBCHUNK_ENTRIES_CAP = 2048;
inline constexpr size_t BATCH_MEM_BUDGET = 32ULL * 1024ULL * 1024ULL;

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

// Stride upper bound for `s.dense_buckets`: next_pow2(⌈(B-1)/T⌉), with a floor of 2.
[[nodiscard]] inline size_t compute_dense_stride(size_t B_eff, size_t num_threads) noexcept
{
    const size_t per_thread = (B_eff > 1) ? ((B_eff - 1 + num_threads - 1) / num_threads) : size_t{ 1 };
    return std::max<size_t>(2, std::bit_ceil(per_thread));
}

// Upper bound on Σ_t buckets_per_thread[t][w] per window: B + T - 1 (adjacent threads
// may share one boundary bucket). Returns 0 when B_eff == 0.
[[nodiscard]] inline size_t compute_bucket_partials_max(size_t B_eff, size_t num_threads) noexcept
{
    return (B_eff > 0) ? (B_eff - 1 + num_threads - 1) : size_t{ 0 };
}

// Per-OS-thread Stage 6a seam overflow capacity (per-window upper bound).
[[nodiscard]] inline size_t compute_global_max_overflow_per_window(size_t n,
                                                                   size_t num_threads,
                                                                   size_t subchunk_entries_cap) noexcept
{
    const size_t global_max_chunk_len = (n + num_threads - 1) / num_threads;
    return (global_max_chunk_len + subchunk_entries_cap - 1) / subchunk_entries_cap;
}

// Per-window byte cost for one window in a windows-per-batch slab. Identical formula
// at three sites (sizer outer, sizer per-schedule lambda, live allocator); centralised
// here so they cannot drift.
//
//   schedule      = 4·n
//   HIST slot     = max(4·t·B, sizeof(ChunkOutput)·t + 96·t)            [H ∪ O overlay]
//   DENSE slot    = 65 · bucket_partials_max(B, t)                      [bucket_partials_dense + present]
//   bucket_start  = 8·(B+1)
//   chunk arrays  = 8·(t+1) + 8·(t+1) + 8·t + 8·t + 8·t + 16·worker + 8·t
//   dense_buckets = 87·worker·stride                                    [s.dense_buckets + aux]
template <typename Curve>
[[nodiscard]] inline size_t compute_per_window_bytes(
    size_t num_threads, size_t B_eff, size_t n, size_t dense_stride, size_t worker_total) noexcept
{
    const size_t bucket_partials_max = compute_bucket_partials_max(B_eff, num_threads);
    const size_t hist_h_bytes_pw = size_t{ 4 } * num_threads * B_eff;
    const size_t hist_o_bytes_pw = (sizeof(ChunkOutput<Curve>) * num_threads) + (size_t{ 96 } * num_threads);
    const size_t hist_slot_bytes_pw = std::max(hist_h_bytes_pw, hist_o_bytes_pw);
    const size_t dense_slot_bytes_pw = size_t{ 65 } * bucket_partials_max;
    return (size_t{ 4 } * n) + hist_slot_bytes_pw + dense_slot_bytes_pw + (size_t{ 8 } * (B_eff + 1)) +
           (size_t{ 8 } * (num_threads + 1)) + (size_t{ 8 } * (num_threads + 1)) + (size_t{ 8 } * num_threads) +
           (size_t{ 8 } * num_threads) + (size_t{ 8 } * num_threads) + (size_t{ 16 } * worker_total) +
           (size_t{ 8 } * num_threads) + (size_t{ 87 } * worker_total * dense_stride);
}

// Phase-1 prologue bytes living in the per-MSM arena (msb_per_scalar, glv_scalars,
// glv_points, per_thread_msb_hist). Two-copy duplicate eliminated.
[[nodiscard]] inline size_t compute_phase_one_prologue_bytes(size_t n,
                                                             bool use_glv,
                                                             bool inline_glv_double,
                                                             size_t profile_threads) noexcept
{
    return n                                                      // msb_per_scalar
           + (use_glv ? size_t{ 32 } * n : size_t{ 0 })           // glv_scalars_storage
           + (inline_glv_double ? size_t{ 64 } * n : size_t{ 0 }) // glv_points_storage
           + (profile_threads * size_t{ 1024 });                  // per_thread_msb_hist
}

struct PhaseACaps {
    size_t members_cap;
    size_t offsets_cap;
};

// Phase A per-worker caps. `members_cap = min(DEDUP_MAX_MEMBERS, n)` is tight (each
// scalar contributes ≤ 1 cluster_member entry). `offsets_cap = cids_per_thread + 2`
// covers the leading-zero sentinel + post-last terminator.
[[nodiscard]] inline PhaseACaps compute_phase_a_caps(size_t n, size_t num_threads) noexcept
{
    return { std::min(DEDUP_MAX_MEMBERS, n), (DEDUP_MAX_CLUSTERS / num_threads) + 2 };
}

// Solve `wpb · per_window_bytes ≤ available_budget`, clamped to W_R and ≥ 1.
// Mirrors the three identical wpb-pickers in the sizer and live allocator.
[[nodiscard]] inline size_t solve_wpb(size_t per_window_bytes, size_t available_budget, size_t W_R) noexcept
{
    if (W_R == 0) {
        return 1;
    }
    if (per_window_bytes == 0 || available_budget == 0) {
        return std::max<size_t>(1, W_R);
    }
    return std::min(std::max<size_t>(1, available_budget / per_window_bytes), W_R);
}

} // namespace bb::scalar_multiplication::round_parallel_detail
