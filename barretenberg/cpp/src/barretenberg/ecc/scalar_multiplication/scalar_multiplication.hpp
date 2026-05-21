#pragma once

#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <string>

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

namespace bb::scalar_multiplication {

/**
 * @brief N-dependent oversubscription factor used ONLY for `choose_window_bits`'
 *        target_load formula (not for actual thread dispatch).
 */
size_t window_bits_tuning_oversub_factor(size_t n_input);

/**
 * @brief State of the art pippenger multiscalar multiplication algorithm.
 *
 * @details A traditional pippenger N/logN algorithm (split scalars into windows, use window value to map scalar's base
 * point into a bucket. Accumulate buckets. Repeat for all windows (1 window = 1 round))
 * We add the following optimizations on top of the algorithm:
 * 1) Efficient multithreading via round-parallelism. If memory budget allows each thread evaluates multiple rounds.
 *    Thread efficiency ~90% when measured.
 * 2) Booth in-place recoding of scalars. Each slice represents [-(num_buckets/2- 1), ..., (num_buckets/2 - 1)].
 *    halves number of buckets.
 * 3) GLV decompositon of input scalars into two half-size scalars. Halves number of bucket accumulation steps.
 *    Only used for n<2^{16} due to memory throughput tradeoffs.
 * 4) Adaptive bucket range. When mixing large and small scalars (e.g. witness values), low bit-ranges use a larger
 *    bucket-range. Larger bit-ranges use a bucket-range tuned to the reduced number of large scalars.
 * 5) Duplicate stripping. Witness commitments and permutation polynomials contain large numbers of duplicates. When
 *    dedup flag is active these are detected and base points consolidated prior to main MSM. 6) Batch-affine
 *    arithmetic. When accumulating points into buckets, independent point additions are gathered and batched, allowing
 *    for affine point arithmetic w. batch invert. Cost = 6M for addition, 7M for doubling (M=field mult).
 * 7) Batch-affine bucket accumulation. Uses novel technique from (TODO REF) to accumulate buckets in runs of
 *    independent additions.
 * 8) If n is small (num points per thread < ~24), fallback to optimised multithreaded Straus MSM
 *    (windowed double-and-add with GLV endomorphism)
 *
 * In order to efficiently utilize memory and prevent WASM memory fragmentation, we use a single `arena` memory buffer
 * to allocate all temporary data structures. Currently sized at 36MB which defines the upper cap on the memory consumed
 * by this algorihtm.
 * @param scalars  Input scalars
 * @param points   Input points
 * @param dedup_hint Activates duplicate stripping if true. Off by default as dup stripping adds ~5% overhead on random
 * inputs
 * @pre Inputs are linearly independent: no point-at-infinity, no equal-x within a bucket
 *      (matches `pippenger_unsafe`).
 * @note Scalars are converted out of Montgomery form internally and restored before return.
 */
// `external_glv_doubled`: optional caller-supplied [P, φP, ...] interleaved buffer
//   (length 2*n). When non-empty, every n_input is treated as GLV-eligible and the
//   doubled points are aliased instead of recomputed — the batched driver uses this
//   to share the doubled SRS prefix across MSMs in a batch.
// `external_arena`: optional caller-supplied scratch buffer ≥ this MSM's required
//   bytes. When empty, allocated per-MSM and freed at return. The batched driver
//   supplies a single arena sized to the largest member.
template <typename Curve>
typename Curve::Element pippenger_round_parallel(
    PolynomialSpan<const typename Curve::ScalarField> scalars,
    std::span<const typename Curve::AffineElement> points,
    bool dedup_hint = false,
    std::span<const typename Curve::AffineElement> external_glv_doubled = {},
    std::span<std::byte> external_arena = {}) noexcept;

extern template curve::BN254::Element pippenger_round_parallel<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    bool dedup_hint,
    std::span<const curve::BN254::AffineElement> external_glv_doubled,
    std::span<std::byte> external_arena) noexcept;

extern template curve::Grumpkin::Element pippenger_round_parallel<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    bool dedup_hint,
    std::span<const curve::Grumpkin::AffineElement> external_glv_doubled,
    std::span<std::byte> external_arena) noexcept;

// ===================================================================================
// Public API (interface-compatible with the legacy `scalar_multiplication::MSM` class).
// ===================================================================================
//
// `pippenger`        — handle_edge_cases routed: false → fast affine round-parallel,
//                      true → Jacobian fast path (handles point-at-infinity / equal-x
//                      bucket collisions).
// `pippenger_unsafe` — always the fast path; caller asserts linear-independence of points.
// `MSM<Curve>::msm`            — single-MSM convenience wrapper (returns AffineElement).
// `MSM<Curve>::batch_multi_scalar_mul` — multi-MSM driver: runs each MSM via `pippenger`
//                                       and returns a vector of AffineElement results.

template <typename Curve>
typename Curve::Element pippenger(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                  std::span<const typename Curve::AffineElement> points,
                                  bool handle_edge_cases = true,
                                  bool dedup_hint = false) noexcept;

template <typename Curve>
typename Curve::Element pippenger_unsafe(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                         std::span<const typename Curve::AffineElement> points,
                                         bool dedup_hint = false) noexcept;

extern template curve::BN254::Element pippenger<curve::BN254>(PolynomialSpan<const curve::BN254::ScalarField> scalars,
                                                              std::span<const curve::BN254::AffineElement> points,
                                                              bool handle_edge_cases,
                                                              bool dedup_hint) noexcept;

extern template curve::Grumpkin::Element pippenger<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    bool handle_edge_cases,
    bool dedup_hint) noexcept;

extern template curve::BN254::Element pippenger_unsafe<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    bool dedup_hint) noexcept;

extern template curve::Grumpkin::Element pippenger_unsafe<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    bool dedup_hint) noexcept;

template <typename Curve> class MSM {
  public:
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    using AffineElement = typename Curve::AffineElement;

    /**
     * @brief Single MSM convenience wrapper — returns the result as an AffineElement.
     * @param handle_edge_cases  false (default): fast affine round-parallel path.
     *                           true: Jacobian fast path (handles edge cases).
     * @param dedup_hint         When true, opts this MSM into the input-scalar dedup pre-pass.
     */
    static AffineElement msm(std::span<const AffineElement> points,
                             PolynomialSpan<const ScalarField> scalars,
                             bool handle_edge_cases = false,
                             bool dedup_hint = false) noexcept;

    /**
     * @brief Batch driver for multiple MSMs. Returns one AffineElement per input MSM.
     *
     * Every MSM in the batch shares a single contiguous point set (the SRS / GLV table);
     * each MSM picks its own range via `scalars[m].start_index` and `scalars[m].size()`.
     * MSM `m` computes Σ_i scalars[m][i] * points[scalars[m].start_index + i].
     *
     * Independent MSMs run sequentially (each MSM is itself round-parallel internally).
     * This matches the legacy interface but the parallelisation strategy is different:
     * the legacy implementation work-balanced points across threads spanning multiple
     * MSMs; round-parallel parallelises within each MSM, so one MSM at a time uses the
     * full thread pool. For the typical chonk workload (commit batches of polys of size
     * 2^20), this is faster because per-MSM threading dominates over inter-MSM stealing.
     *
     * @param points      Shared point set (SRS prefix). Every MSM indexes into this span.
     * @param scalars     Per-MSM scalars carrying the start offset into `points`.
     * @param dedup_hints Optional per-MSM dedup opt-ins (parallel to `scalars`): a
     *                    non-zero entry opts that MSM's input scalars into the
     *                    duplicate-cluster pre-pass. Empty span means no dedup anywhere.
     */
    static std::vector<AffineElement> batch_multi_scalar_mul(std::span<const AffineElement> points,
                                                             std::span<PolynomialSpan<ScalarField>> scalars,
                                                             bool handle_edge_cases = true,
                                                             std::span<const uint8_t> dedup_hints = {}) noexcept;
};

extern template class MSM<curve::Grumpkin>;
extern template class MSM<curve::BN254>;

// `pippenger_round_parallel` falls back to `trivial_msm_threaded` when each worker
// would receive fewer than this many points (after the n_active filter). Exposed so tests
// and bench targets can pin behaviour at the boundary.
inline constexpr size_t MIN_PTS_PER_THREAD_FOR_PIPPENGER = 24;

// Test hook: validates that the computed arena size can hold the typed zone layout
// for a BN254 MSM shape without allocating the point/scalar inputs.
bool pippenger_bn254_arena_layout_fits_for_test(size_t n_input,
                                                bool external_glv_provided = false,
                                                bool dedup_active = false,
                                                size_t effective_num_bits_for_test = 0) noexcept;

namespace round_parallel_detail {

// Above this N, GLV's 2x point-count cost outweighs the windows-halved benefit.
#ifdef __wasm__
inline constexpr size_t GLV_SMALL_N_THRESHOLD = size_t{ 1 } << 16;
#else
inline constexpr size_t GLV_SMALL_N_THRESHOLD = size_t{ 1 } << 13;
#endif

/**
 * @brief Single-MSM, no-affine-trick Pippenger over window_bits-wide windows.
 *
 * `min_pts_per_thread_override` lets benchmarks pin behaviour:
 *   - 0 (default) → use the internal `MIN_PTS_PER_THREAD` heuristic (256 native, single-threaded on WASM).
 *   - SIZE_MAX    → force single-threaded.
 *   - 1           → maximally multi-threaded (one worker per logical CPU).
 */
template <typename Curve>
typename Curve::Element pippenger_round_parallel_jacobian_fast(std::span<const typename Curve::ScalarField> scalars,
                                                               std::span<const typename Curve::AffineElement> points,
                                                               size_t min_pts_per_thread_override = 0) noexcept;

extern template curve::BN254::Element pippenger_round_parallel_jacobian_fast<curve::BN254>(
    std::span<const curve::BN254::ScalarField> scalars,
    std::span<const curve::BN254::AffineElement> points,
    size_t min_pts_per_thread_override) noexcept;

extern template curve::Grumpkin::Element pippenger_round_parallel_jacobian_fast<curve::Grumpkin>(
    std::span<const curve::Grumpkin::ScalarField> scalars,
    std::span<const curve::Grumpkin::AffineElement> points,
    size_t min_pts_per_thread_override) noexcept;

} // namespace round_parallel_detail

/**
 * @brief Single-threaded small-MSM driver: `Element::straus_msm` over the input slice.
 */
template <typename Curve>
typename Curve::Element trivial_msm(PolynomialSpan<const typename Curve::ScalarField> scalars_span,
                                    std::span<const typename Curve::AffineElement> all_points) noexcept;

extern template curve::BN254::Element trivial_msm<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars_span,
    std::span<const curve::BN254::AffineElement> all_points) noexcept;

extern template curve::Grumpkin::Element trivial_msm<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars_span,
    std::span<const curve::Grumpkin::AffineElement> all_points) noexcept;

/**
 * @brief Multi-threaded small-MSM driver: parallel `Element::straus_msm` over zero-skipped
 *        input slices.
 */
template <typename Curve>
typename Curve::Element trivial_msm_threaded(PolynomialSpan<const typename Curve::ScalarField> scalars_span,
                                             std::span<const typename Curve::AffineElement> all_points) noexcept;

extern template curve::BN254::Element trivial_msm_threaded<curve::BN254>(
    PolynomialSpan<const curve::BN254::ScalarField> scalars_span,
    std::span<const curve::BN254::AffineElement> all_points) noexcept;

extern template curve::Grumpkin::Element trivial_msm_threaded<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars_span,
    std::span<const curve::Grumpkin::AffineElement> all_points) noexcept;

} // namespace bb::scalar_multiplication
