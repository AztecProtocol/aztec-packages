// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"

#include "./process_buckets.hpp"
#include "./scalar_multiplication.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/general/general.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include "barretenberg/common/mem.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb::scalar_multiplication {

/**
 * @brief Fallback method for very small numbers of input points (< PIPPENGER_THRESHOLD)
 *
 * @tparam Curve
 * @param msm_data MSM input data (scalars in non-Montgomery form)
 * @return Curve::Element
 */
template <typename Curve> typename Curve::Element small_mul(const typename MSM<Curve>::MSMData& msm_data) noexcept
{
    const auto& scalars = msm_data.scalars;
    const auto& points = msm_data.points;
    const auto& scalar_indices = msm_data.scalar_indices;
    const size_t range = scalar_indices.size();

    typename Curve::Element r = Curve::Group::point_at_infinity;
    for (size_t i = 0; i < range; ++i) {
        typename Curve::Element f = points[scalar_indices[i]];
        r += f * scalars[scalar_indices[i]].to_montgomery_form();
    }
    return r;
}

/**
 * @brief Populate `nonzero_scalar_indices` with indices of nonzero scalars
 * @details Scalars must already be in non-Montgomery (standard) form for correct zero-detection
 *
 * @tparam Curve
 * @param scalars (must be in non-Montgomery form)
 * @param nonzero_scalar_indices
 */
template <typename Curve>
void MSM<Curve>::get_nonzero_scalar_indices(std::span<const typename Curve::ScalarField> scalars,
                                            std::vector<uint32_t>& nonzero_scalar_indices) noexcept
{
    std::vector<std::vector<uint32_t>> thread_indices(get_num_cpus());

    // Pass 1: Each thread collects nonzero indices into its own vector
    parallel_for([&](const ThreadChunk& chunk) {
        BB_ASSERT_EQ(chunk.total_threads, thread_indices.size());
        auto range = chunk.range(scalars.size());
        if (range.empty()) {
            return;
        }
        std::vector<uint32_t>& thread_scalar_indices = thread_indices[chunk.thread_index];
        thread_scalar_indices.reserve(range.size());
        for (size_t i : range) {
            BB_ASSERT_DEBUG(i < scalars.size());
            if (!scalars[i].is_zero()) {
                thread_scalar_indices.push_back(static_cast<uint32_t>(i));
            }
        }
    });

    size_t num_entries = 0;
    for (const auto& indices : thread_indices) {
        num_entries += indices.size();
    }
    nonzero_scalar_indices.resize(num_entries);

    // Pass 2: Copy each thread's indices to the output array (no branching)
    parallel_for([&](const ThreadChunk& chunk) {
        BB_ASSERT_EQ(chunk.total_threads, thread_indices.size());
        size_t offset = 0;
        for (size_t i = 0; i < chunk.thread_index; ++i) {
            offset += thread_indices[i].size();
        }
        for (size_t i = offset; i < offset + thread_indices[chunk.thread_index].size(); ++i) {
            nonzero_scalar_indices[i] = thread_indices[chunk.thread_index][i - offset];
        }
    });
}

/**
 * @brief Split a multiple multi-scalar-multiplication into equal units of work that can be processed by threads
 * @details The goal is to compute the total number of multiplications needed, and assign each thread a set of MSMs
 *          such that each thread performs equivalent work.
 *          We will split up an MSM into multiple MSMs if this is required.
 *
 * @tparam Curve
 * @param scalars (must be in non-Montgomery form)
 * @param msm_scalar_indices
 * @return std::vector<typename MSM<Curve>::ThreadWorkUnits>
 */
template <typename Curve>
std::vector<typename MSM<Curve>::ThreadWorkUnits> MSM<Curve>::get_work_units(
    std::span<std::span<ScalarField>> scalars, std::vector<std::vector<uint32_t>>& msm_scalar_indices) noexcept
{

    const size_t num_msms = scalars.size();
    msm_scalar_indices.resize(num_msms);
    for (size_t i = 0; i < num_msms; ++i) {
        get_nonzero_scalar_indices(scalars[i], msm_scalar_indices[i]);
    }

    size_t total_work = 0;
    for (const auto& indices : msm_scalar_indices) {
        total_work += indices.size();
    }

    const size_t num_threads = get_num_cpus();
    std::vector<ThreadWorkUnits> work_units(num_threads);

    const size_t work_per_thread = numeric::ceil_div(total_work, num_threads);
    const size_t work_of_last_thread = total_work - (work_per_thread * (num_threads - 1));

    // Only use a single work unit if we don't have enough work for every thread
    if (num_threads > total_work) {
        for (size_t i = 0; i < num_msms; ++i) {
            work_units[0].push_back(MSMWorkUnit{
                .batch_msm_index = i,
                .start_index = 0,
                .size = msm_scalar_indices[i].size(),
            });
        }
        return work_units;
    }

    size_t thread_accumulated_work = 0;
    size_t current_thread_idx = 0;
    for (size_t i = 0; i < num_msms; ++i) {
        size_t msm_work_remaining = msm_scalar_indices[i].size();
        const size_t initial_msm_work = msm_work_remaining;

        while (msm_work_remaining > 0) {
            BB_ASSERT_LT(current_thread_idx, work_units.size());

            const size_t total_thread_work =
                (current_thread_idx == num_threads - 1) ? work_of_last_thread : work_per_thread;
            const size_t available_thread_work = total_thread_work - thread_accumulated_work;
            const size_t work_to_assign = std::min(available_thread_work, msm_work_remaining);

            work_units[current_thread_idx].push_back(MSMWorkUnit{
                .batch_msm_index = i,
                .start_index = initial_msm_work - msm_work_remaining,
                .size = work_to_assign,
            });

            thread_accumulated_work += work_to_assign;
            msm_work_remaining -= work_to_assign;

            // Move to next thread if current thread is full
            if (thread_accumulated_work >= total_thread_work) {
                current_thread_idx++;
                thread_accumulated_work = 0;
            }
        }
    }
    return work_units;
}

/**
 * @brief Given a scalar in non-Montgomery form, extract a `slice_size`-bit chunk for a given round
 * @details At round 0 (most significant), extracts bits [NUM_BITS - slice_size, NUM_BITS).
 *          At round i, extracts bits [NUM_BITS - (i+1)*slice_size, NUM_BITS - i*slice_size).
 *          The last round may extract fewer bits if NUM_BITS is not divisible by slice_size.
 *
 * @tparam Curve
 * @param scalar (must be in non-Montgomery form)
 * @param round round index (0 = most significant bits)
 * @param slice_size number of bits per slice
 * @return uint32_t the extracted slice value (bucket index)
 */
template <typename Curve>
uint32_t MSM<Curve>::get_scalar_slice(const typename Curve::ScalarField& scalar,
                                      size_t round,
                                      size_t slice_size) noexcept
{
    size_t hi_bit = NUM_BITS_IN_FIELD - (round * slice_size);
    size_t lo_bit = (hi_bit < slice_size) ? 0 : hi_bit - slice_size;
    return scalar.get_bit_slice_raw(lo_bit, hi_bit);
}

/**
 * @brief For a given number of points, compute the optimal Pippenger bucket size (bits per slice)
 * @details Minimizes total cost = (num_rounds * num_points) + (num_rounds * num_buckets * bucket_op_cost)
 *
 * @tparam Curve
 * @param num_points number of points in the MSM
 * @return size_t optimal number of bits per scalar slice (log2 of bucket count)
 */
template <typename Curve> size_t MSM<Curve>::get_optimal_log_num_buckets(const size_t num_points) noexcept
{
    // Cost model: total_cost = num_rounds * (num_points + num_buckets * BUCKET_ACCUMULATION_COST)
    auto compute_cost = [&](size_t bits) {
        size_t rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits);
        size_t buckets = size_t{ 1 } << bits;
        return rounds * (num_points + buckets * BUCKET_ACCUMULATION_COST);
    };

    size_t best_bits = 1;
    size_t best_cost = compute_cost(1);
    for (size_t bits = 2; bits < MAX_SLICE_BITS; ++bits) {
        size_t cost = compute_cost(bits);
        if (cost < best_cost) {
            best_cost = cost;
            best_bits = bits;
        }
    }
    return best_bits;
}

/**
 * @brief Determine if the affine batch inversion trick is beneficial for given MSM parameters
 * @details The affine trick requires log(N) inversions per round but saves field multiplications
 *          per point addition. Returns false if num_points < AFFINE_TRICK_THRESHOLD.
 *
 * @tparam Curve
 * @param num_points number of points in the MSM
 * @param num_buckets number of buckets (2^bits_per_slice)
 * @return true if affine trick saves computation, false otherwise
 */
template <typename Curve> bool MSM<Curve>::use_affine_trick(const size_t num_points, const size_t num_buckets) noexcept
{
    if (num_points < AFFINE_TRICK_THRESHOLD) {
        return false;
    }

    // Affine trick requires log(N) modular inversions per Pippenger round.
    // It saves num_points * AFFINE_TRICK_SAVINGS_PER_OP field muls, plus
    // num_buckets * JACOBIAN_Z_NOT_ONE_PENALTY field muls (buckets have Z=1 with affine trick)

    // Cost of modular inversion via exponentiation:
    // - NUM_BITS_IN_FIELD squarings
    // - (NUM_BITS_IN_FIELD + 3) / 4 multiplications (4-bit windows)
    // - INVERSION_TABLE_COST multiplications for lookup table
    constexpr size_t COST_OF_INVERSION = NUM_BITS_IN_FIELD + ((NUM_BITS_IN_FIELD + 3) / 4) + INVERSION_TABLE_COST;

    double log2_num_points = log2(static_cast<double>(num_points));
    size_t savings_per_round = (num_points * AFFINE_TRICK_SAVINGS_PER_OP) + (num_buckets * JACOBIAN_Z_NOT_ONE_PENALTY);
    double inversion_cost_per_round = log2_num_points * static_cast<double>(COST_OF_INVERSION);

    return static_cast<double>(savings_per_round) > inversion_cost_per_round;
}

/**
 * @brief adds a bunch of points together using affine addition formulae.
 * @details Paradoxically, the affine formula is crazy efficient if you have a lot of independent point additions to
 * perform. Affine formula:
 *
 * \lambda = (y_2 - y_1) / (x_2 - x_1)
 * x_3 = \lambda^2 - (x_2 + x_1)
 * y_3 = \lambda*(x_1 - x_3) - y_1
 *
 * Traditionally, we avoid affine formulae like the plague, because computing lambda requires a modular inverse,
 * which is outrageously expensive.
 *
 * However! We can use Montgomery's batch inversion technique to amortise the cost of the inversion to ~0.
 *
 * The way batch inversion works is as follows. Let's say you want to compute \{ 1/x_1, 1/x_2, ..., 1/x_n \}
 * The trick is to compute the product x_1x_2...x_n , whilst storing all of the temporary products.
 * i.e. we have an array A = [x_1, x_1x_2, ..., x_1x_2...x_n]
 * We then compute a single inverse: I = 1 / x_1x_2...x_n
 * Finally, we can use our accumulated products, to quotient out individual inverses.
 * We can get an individual inverse at index i, by computing I.A_{i-1}.(x_nx_n-1...x_i+1)
 * The last product term we can compute on-the-fly, as it grows by one element for each additional inverse that we
 * require.
 *
 * TLDR: amortized cost of a modular inverse is 3 field multiplications per inverse.
 * Which means we can compute a point addition with SIX field multiplications in total.
 * The traditional Jacobian-coordinate formula requires 11.
 *
 * There is a catch though - we need large sequences of independent point additions!
 * i.e. the output from one point addition in the sequence is NOT an input to any other point addition in the
 * sequence.
 *
 * We can re-arrange the Pippenger algorithm to get this property, but it's...complicated
 * @tparam Curve
 * @param points points to be added pairwise; result is stored in the latter half of the array
 * @param num_points
 * @param scratch_space coordinate field scratch space needed for batched inversion
 **/
template <typename Curve>
void MSM<Curve>::add_affine_points(typename Curve::AffineElement* points,
                                   const size_t num_points,
                                   typename Curve::BaseField* scratch_space) noexcept
{
    using Fq = typename Curve::BaseField;
    Fq batch_inversion_accumulator = Fq::one();

    for (size_t i = 0; i < num_points; i += 2) {
        scratch_space[i >> 1] = points[i].x + points[i + 1].x; // x2 + x1
        points[i + 1].x -= points[i].x;                        // x2 - x1
        points[i + 1].y -= points[i].y;                        // y2 - y1
        points[i + 1].y *= batch_inversion_accumulator;        // (y2 - y1)*accumulator_old
        batch_inversion_accumulator *= (points[i + 1].x);
    }
    if (batch_inversion_accumulator == 0) {
        // prefer abort to throw for code that might emit from multiple threads
        throw_or_abort("attempted to invert zero in add_affine_points");
    } else {
        batch_inversion_accumulator = batch_inversion_accumulator.invert();
    }

    // Iterate backwards through the points, computing pairwise affine additions; addition results are stored in the
    // latter half of the array
    for (size_t i = (num_points)-2; i < num_points; i -= 2) {
        points[i + 1].y *= batch_inversion_accumulator; // update accumulator
        batch_inversion_accumulator *= points[i + 1].x;
        points[i + 1].x = points[i + 1].y.sqr();
        points[(i + num_points) >> 1].x = points[i + 1].x - (scratch_space[i >> 1]); // x3 = lambda_squared - x2
                                                                                     // - x1
        // Prefetch next iteration's data to hide memory latency (~100-300 cycles).
        // Output addresses jump non-sequentially: points[(i+n)>>1] defeats hardware prefetcher.
        // Fetching 2 iterations ahead ensures data arrives before needed.
        if (i >= 2) {
            __builtin_prefetch(points + i - 2);
            __builtin_prefetch(points + i - 1);
            __builtin_prefetch(points + ((i + num_points - 2) >> 1));
            __builtin_prefetch(scratch_space + ((i - 2) >> 1));
        }
        points[i].x -= points[(i + num_points) >> 1].x;
        points[i].x *= points[i + 1].y;
        points[(i + num_points) >> 1].y = points[i].x - points[i].y;
    }
}

/**
 * @brief Pippenger algorithm using Jacobian bucket accumulators (handles edge cases)
 * @details Used when handle_edge_cases=true or when num_points < AFFINE_TRICK_THRESHOLD.
 *          Uses Jacobian coordinates which correctly handle point doubling and point at infinity.
 *
 * @tparam Curve
 * @param msm_data contains scalars (non-Montgomery), points, and nonzero scalar indices
 * @return Curve::Element MSM result in Jacobian coordinates
 */
template <typename Curve>
typename Curve::Element MSM<Curve>::small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    const size_t size = nonzero_scalar_indices.size();
    const size_t bits_per_slice = get_optimal_log_num_buckets(size);
    const size_t num_buckets = 1 << bits_per_slice;
    JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
    Element msm_result = Curve::Group::point_at_infinity;

    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);

    for (size_t i = 0; i < num_rounds; ++i) {
        evaluate_small_pippenger_round(msm_data, i, bucket_data, msm_result, bits_per_slice);
    }
    return msm_result;
}

/**
 * @brief Pippenger algorithm using affine bucket accumulators with batch inversion (faster, no edge case handling)
 * @details Used when handle_edge_cases=false and num_points >= AFFINE_TRICK_THRESHOLD. Falls back to
 *          small_pippenger if affine trick is not beneficial. Uses Montgomery's batch inversion trick
 *          for efficient affine point additions.
 *
 * @tparam Curve
 * @param msm_data contains scalars (non-Montgomery), points, and nonzero scalar indices
 * @return Curve::Element MSM result in Jacobian coordinates
 */
template <typename Curve>
typename Curve::Element MSM<Curve>::pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept
{
    const size_t msm_size = msm_data.scalar_indices.size();
    const size_t bits_per_slice = get_optimal_log_num_buckets(msm_size);
    const size_t num_buckets = 1 << bits_per_slice;

    if (!use_affine_trick(msm_size, num_buckets)) {
        return small_pippenger_low_memory_with_transformed_scalars(msm_data);
    }

    // Use thread-local storage to avoid per-call allocations (resolves issue #1452)
    static thread_local AffineAdditionData affine_data;
    static thread_local BucketAccumulators bucket_data(0);
    if (bucket_data.buckets.size() < num_buckets) {
        bucket_data.buckets.resize(num_buckets);
        bucket_data.bucket_exists.resize(num_buckets);
    }

    Element msm_result = Curve::Group::point_at_infinity;

    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);
    for (size_t i = 0; i < num_rounds; ++i) {
        evaluate_pippenger_round(msm_data, i, affine_data, bucket_data, msm_result, bits_per_slice);
    }

    return msm_result;
}

/**
 * @brief Evaluate a single Pippenger round when we do not use the Affine trick
 *
 * @tparam Curve
 * @param msm_data
 * @param round_index
 * @param bucket_data
 * @param msm_accumulator Running MSM accumulator (mutated in place)
 * @param bits_per_slice
 */
template <typename Curve>
void MSM<Curve>::evaluate_small_pippenger_round(MSMData& msm_data,
                                                const size_t round_index,
                                                MSM<Curve>::JacobianBucketAccumulators& bucket_data,
                                                typename Curve::Element& msm_accumulator,
                                                const size_t bits_per_slice) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;

    // Populate buckets using simple Jacobian accumulation
    const size_t size = nonzero_scalar_indices.size();
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_DEBUG(nonzero_scalar_indices[i] < scalars.size());
        uint32_t bucket_index = get_scalar_slice(scalars[nonzero_scalar_indices[i]], round_index, bits_per_slice);
        BB_ASSERT_DEBUG(bucket_index < static_cast<uint32_t>(1 << bits_per_slice));
        if (bucket_index > 0) {
            // do this check because we do not reset bucket_data.buckets after each round
            // (i.e. not neccessarily at infinity)
            if (bucket_data.bucket_exists.get(bucket_index)) {
                bucket_data.buckets[bucket_index] += points[nonzero_scalar_indices[i]];
            } else {
                bucket_data.buckets[bucket_index] = points[nonzero_scalar_indices[i]];
                bucket_data.bucket_exists.set(bucket_index, true);
            }
        }
    }

    // Reduce buckets to single point for this round
    Element bucket_result = accumulate_buckets(bucket_data);
    bucket_data.bucket_exists.clear();

    // Accumulate into running total
    accumulate_round_result(msm_accumulator, bucket_result, round_index, bits_per_slice);
}

/**
 * @brief Evaluate a single Pippenger round where we use the affine trick
 *
 * @tparam Curve
 * @param msm_data
 * @param round_index
 * @param affine_data
 * @param bucket_data
 * @param msm_accumulator Running MSM accumulator (mutated in place)
 * @param bits_per_slice
 */
template <typename Curve>
void MSM<Curve>::evaluate_pippenger_round(MSMData& msm_data,
                                          const size_t round_index,
                                          MSM<Curve>::AffineAdditionData& affine_data,
                                          MSM<Curve>::BucketAccumulators& bucket_data,
                                          typename Curve::Element& msm_accumulator,
                                          const size_t bits_per_slice) noexcept
{
    std::span<const uint32_t>& scalar_indices = msm_data.scalar_indices; // indices of nonzero scalars
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;
    std::span<uint64_t>& round_schedule = msm_data.point_schedule;
    const size_t size = scalar_indices.size();

    // Construct a "round schedule" - each entry packs (point_index, bucket_index) for sorting
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_DEBUG(scalar_indices[i] < scalars.size());
        uint32_t bucket_index = get_scalar_slice(scalars[scalar_indices[i]], round_index, bits_per_slice);
        round_schedule[i] = PointScheduleEntry::create(scalar_indices[i], bucket_index).data;
    }

    // Sort our point schedules based on their bucket values. Reduces memory throughput in next step of algo
    const size_t num_zero_entries = scalar_multiplication::process_buckets_count_zero_entries(
        &round_schedule[0], size, static_cast<uint32_t>(bits_per_slice));
    BB_ASSERT_DEBUG(num_zero_entries <= size);
    const size_t round_size = size - num_zero_entries;

    // Populate buckets using affine addition with batch inversion
    Element bucket_result = Curve::Group::point_at_infinity;
    if (round_size > 0) {
        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        // Iterate through our point schedule and add points into corresponding buckets
        consume_point_schedule(point_schedule, points, affine_data, bucket_data);
        bucket_result = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();
    }

    // Accumulate into running total
    accumulate_round_result(msm_accumulator, bucket_result, round_index, bits_per_slice);
}

/**
 * @brief Common logic for accumulating a round's bucket result into the running MSM output
 * @details Combines previous round output (shifted left by doubling) with current round's bucket accumulation.
 *          Handles the edge case where the last round may process fewer bits.
 *
 * @tparam Curve
 * @param msm_accumulator Running MSM accumulator (mutated in place)
 * @param bucket_result Result from accumulate_buckets() for this round
 * @param round_index Current round index (0 = most significant bits)
 * @param bits_per_slice Number of bits processed per round
 */
template <typename Curve>
void MSM<Curve>::accumulate_round_result(Element& msm_accumulator,
                                         const Element& bucket_result,
                                         size_t round_index,
                                         size_t bits_per_slice) noexcept
{
    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);
    const bool is_last_round = (round_index == num_rounds - 1);
    const size_t remainder = NUM_BITS_IN_FIELD % bits_per_slice;

    // Last round may process fewer bits if NUM_BITS_IN_FIELD is not divisible by bits_per_slice
    size_t num_doublings = (is_last_round && remainder != 0) ? remainder : bits_per_slice;

    for (size_t i = 0; i < num_doublings; ++i) {
        msm_accumulator.self_dbl();
    }
    msm_accumulator += bucket_result;
}

/**
 * @brief Process a single point/bucket (edge case when no pair available)
 * @details Handles the final odd element in point schedule or affine output processing.
 *          If bucket has an accumulator, pair them for addition. Otherwise, cache point in bucket.
 *
 * @param bucket Bucket index for this point
 * @param point_source Pointer to source point
 * @param scratch_space Scratch space for queuing affine additions
 * @param bucket_accumulators Bucket accumulator storage
 * @param bucket_accumulator_exists Bitmap tracking which buckets have accumulators
 * @param affine_addition_output_bucket_destinations Tracks destination buckets for additions
 * @param scratch_it Current scratch space iterator (modified in place)
 */
template <typename Curve>
__attribute__((always_inline)) static inline void process_single_point(
    uint32_t bucket,
    const typename Curve::AffineElement* point_source,
    std::vector<typename Curve::AffineElement>& scratch_space,
    std::vector<typename Curve::AffineElement>& bucket_accumulators,
    BitVector& bucket_accumulator_exists,
    std::vector<uint32_t>& affine_addition_output_bucket_destinations,
    size_t& scratch_it) noexcept
{
    bool has_accumulator = bucket_accumulator_exists.get(bucket);
    if (has_accumulator) {
        // Pair point with existing bucket accumulator
        scratch_space[scratch_it] = *point_source;
        scratch_space[scratch_it + 1] = bucket_accumulators[bucket];
        bucket_accumulator_exists.set(bucket, false);
        affine_addition_output_bucket_destinations[scratch_it >> 1] = bucket;
        scratch_it += 2;
    } else {
        // Cache point into bucket for future pairing
        bucket_accumulators[bucket] = *point_source;
        bucket_accumulator_exists.set(bucket, true);
    }
}

/**
 * @brief Process a pair of points/buckets using branchless conditional moves
 * @details Core logic shared between filling from point schedule and processing affine outputs.
 *          Uses branchless programming to minimize pipeline flushes.
 *
 * @param lhs_bucket Left-hand side bucket index
 * @param rhs_bucket Right-hand side bucket index
 * @param lhs_source Pointer to left-hand source point
 * @param rhs_source_if_match Pointer to right-hand source if buckets match
 * @param scratch_space Scratch space for queuing affine additions
 * @param bucket_accumulators Bucket accumulator storage
 * @param bucket_accumulator_exists Bitmap tracking which buckets have accumulators
 * @param affine_addition_output_bucket_destinations Tracks destination buckets for additions
 * @param scratch_it Current scratch space iterator (modified in place)
 * @param null_location Dummy location for discarded writes
 * @return size_t Number of source entries consumed: 2 if both paired, 1 if lhs cached
 */
template <typename Curve>
[[nodiscard]] __attribute__((always_inline)) static inline size_t process_bucket_pair(
    uint32_t lhs_bucket,
    uint32_t rhs_bucket,
    const typename Curve::AffineElement* lhs_source,
    const typename Curve::AffineElement* rhs_source_if_match,
    std::vector<typename Curve::AffineElement>& scratch_space,
    std::vector<typename Curve::AffineElement>& bucket_accumulators,
    BitVector& bucket_accumulator_exists,
    std::vector<uint32_t>& affine_addition_output_bucket_destinations,
    size_t& scratch_it,
    typename Curve::AffineElement& null_location) noexcept
{
    bool has_bucket_accumulator = bucket_accumulator_exists.get(lhs_bucket);
    bool buckets_match = lhs_bucket == rhs_bucket;
    bool do_affine_add = buckets_match || has_bucket_accumulator;

    const typename Curve::AffineElement* rhs_source =
        buckets_match ? rhs_source_if_match : &bucket_accumulators[lhs_bucket];

    // Conditional pointer arithmetic (branchless): either queue for addition or store in bucket
    typename Curve::AffineElement* lhs_destination =
        do_affine_add ? &scratch_space[scratch_it] : &bucket_accumulators[lhs_bucket];
    typename Curve::AffineElement* rhs_destination = do_affine_add ? &scratch_space[scratch_it + 1] : &null_location;

    // Track which bucket this addition will update (only if we're actually adding)
    uint32_t& dest_bucket = affine_addition_output_bucket_destinations[scratch_it >> 1];
    dest_bucket = do_affine_add ? lhs_bucket : dest_bucket;

    // Unconditional writes (no branches)
    *lhs_destination = *lhs_source;
    *rhs_destination = *rhs_source;

    // Update bucket existence: bucket has a point if we cached into it, or if it had one and we didn't use it
    bucket_accumulator_exists.set(lhs_bucket, (has_bucket_accumulator && buckets_match) || !do_affine_add);

    // Advance scratch iterator: +2 if we queued an addition, +0 if we cached to bucket
    scratch_it += do_affine_add ? 2 : 0;

    // Return how many source entries consumed: +2 if both points paired, +1 if lhs cached to bucket
    return (do_affine_add && buckets_match) ? 2 : 1;
}

/**
 * @brief Given a list of points and target buckets to add into, perform required group operations
 * @details This algorithm uses exclusively affine group operations, using batch inversions to amortise costs.
 *          Processes points in batches, filling scratch space, performing batch additions, then recirculating
 *          outputs until all points are accumulated into buckets.
 *
 * @tparam Curve
 * @param point_schedule Packed entries: (point_index << 32) | bucket_index
 * @param points Source points (indexed by point_schedule)
 * @param affine_data Thread-local scratch space for batch additions
 * @param bucket_data Bucket accumulators and existence bitmap
 */
template <typename Curve>
void MSM<Curve>::consume_point_schedule(std::span<const uint64_t> point_schedule,
                                        std::span<const typename Curve::AffineElement> points,
                                        MSM<Curve>::AffineAdditionData& affine_data,
                                        MSM<Curve>::BucketAccumulators& bucket_data) noexcept
{
    size_t point_it = 0;
    size_t affine_input_it = 0;

    // N.B. points and point_schedule MAY HAVE DIFFERENT SIZES
    // We source the number of actual points we work on from the point schedule
    const size_t num_points = point_schedule.size();
    auto& bucket_accumulator_exists = bucket_data.bucket_exists;
    auto& affine_addition_scratch_space = affine_data.points_to_add;
    auto& bucket_accumulators = bucket_data.buckets;
    auto& affine_addition_output_bucket_destinations = affine_data.addition_result_bucket_destinations;
    auto& scalar_scratch_space = affine_data.scalar_scratch_space;
    AffineElement null_location{};
    // We do memory prefetching, `prefetch_max` ensures we do not overflow our containers
    const size_t prefetch_max = (num_points >= PREFETCH_LOOKAHEAD) ? (num_points - PREFETCH_LOOKAHEAD) : 0;
    const size_t end = (num_points > 0) ? (num_points - 1) : 0;

    // Process points in batches until all work is complete
    while (point_it < num_points || affine_input_it != 0) {

        // Step 1: Fill up `affine_addition_scratch_space` with up to AffineAdditionData::BATCH_SIZE/2 independent
        // additions
        while (((affine_input_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < end)) {

            // Prefetch points we'll need soon (every 16 iterations, prefetch the next 16-32 points)
            if ((point_it < prefetch_max) && ((point_it & 0x0f) == 0)) {
                for (size_t i = PREFETCH_LOOKAHEAD / 2; i < PREFETCH_LOOKAHEAD; ++i) {
                    PointScheduleEntry entry{ point_schedule[point_it + i] };
                    __builtin_prefetch(&points[entry.point_index()]);
                }
            }

            // We use branchless programming here (conditional moves) to minimize instruction pipeline flushes.
            // We are iterating through our points and can come across the following scenarios:
            // Case 1: Next 2 points go to the *same* bucket (happy path - add both to scratch space)
            // Case 2: Different buckets AND lhs bucket has accumulator (add point + accumulator to scratch)
            // Case 3: Different buckets AND lhs bucket is empty (cache point into bucket)
            // We advance point_it by 2 (case 1), or by 1 (case 2 or 3).
            PointScheduleEntry lhs{ point_schedule[point_it] };
            PointScheduleEntry rhs{ point_schedule[point_it + 1] };
            uint32_t lhs_bucket = lhs.bucket_index();
            uint32_t rhs_bucket = rhs.bucket_index();
            uint32_t lhs_point = lhs.point_index();
            uint32_t rhs_point = rhs.point_index();

            point_it += process_bucket_pair<Curve>(lhs_bucket,
                                                   rhs_bucket,
                                                   &points[lhs_point],
                                                   &points[rhs_point],
                                                   affine_addition_scratch_space,
                                                   bucket_accumulators,
                                                   bucket_accumulator_exists,
                                                   affine_addition_output_bucket_destinations,
                                                   affine_input_it,
                                                   null_location);
        }
        // Handle the last point (odd count case) - separate to avoid bounds check on point_schedule[point_it + 1]
        if (point_it == num_points - 1) {
            PointScheduleEntry last{ point_schedule[point_it] };
            uint32_t bucket = last.bucket_index();
            uint32_t point_idx = last.point_index();
            BB_ASSERT_DEBUG(point_idx < points.size());

            process_single_point<Curve>(bucket,
                                        &points[point_idx],
                                        affine_addition_scratch_space,
                                        bucket_accumulators,
                                        bucket_accumulator_exists,
                                        affine_addition_output_bucket_destinations,
                                        affine_input_it);
            point_it += 1;
        }

        // Now that we have populated `affine_addition_scratch_space`,
        // compute `num_affine_points_to_add` independent additions using the Affine trick
        size_t num_affine_points_to_add = affine_input_it;
        if (num_affine_points_to_add >= 2) {
            add_affine_points(&affine_addition_scratch_space[0], num_affine_points_to_add, &scalar_scratch_space[0]);
        }
        // `add_affine_points` stores the result in the top-half of the used scratch space
        G1* affine_output = &affine_addition_scratch_space[0] + (num_affine_points_to_add / 2);

        // Process the addition outputs.
        // We either need to feed the addition outputs back into affine_addition_scratch_space for more addition
        // operations. Or, if there are no more additions for a bucket, we store the addition output in a bucket
        // accumulator.
        size_t new_scratch_space_it = 0;
        size_t affine_output_it = 0;
        size_t num_affine_output_points = num_affine_points_to_add / 2;
        // This algorithm is equivalent to the one we used to populate `affine_addition_scratch_space` from the point
        // schedule, however here we source points from a different location (the addition results)
        while (affine_output_it + 1 < num_affine_output_points) {
            uint32_t lhs_bucket = affine_addition_output_bucket_destinations[affine_output_it];
            uint32_t rhs_bucket = affine_addition_output_bucket_destinations[affine_output_it + 1];
            BB_ASSERT_DEBUG(lhs_bucket < bucket_accumulator_exists.size());

            affine_output_it += process_bucket_pair<Curve>(lhs_bucket,
                                                           rhs_bucket,
                                                           &affine_output[affine_output_it],
                                                           &affine_output[affine_output_it + 1],
                                                           affine_addition_scratch_space,
                                                           bucket_accumulators,
                                                           bucket_accumulator_exists,
                                                           affine_addition_output_bucket_destinations,
                                                           new_scratch_space_it,
                                                           null_location);
        }
        // perform final iteration as edge case so we don't overflow `affine_addition_output_bucket_destinations`
        if (affine_output_it == (num_affine_output_points - 1)) {
            uint32_t lhs_bucket = affine_addition_output_bucket_destinations[affine_output_it];
            BB_ASSERT_DEBUG(lhs_bucket < bucket_accumulators.size());
            BB_ASSERT_DEBUG(new_scratch_space_it + 1 < affine_addition_scratch_space.size());
            BB_ASSERT_DEBUG((new_scratch_space_it >> 1) < affine_addition_output_bucket_destinations.size());

            process_single_point<Curve>(lhs_bucket,
                                        &affine_output[affine_output_it],
                                        affine_addition_scratch_space,
                                        bucket_accumulators,
                                        bucket_accumulator_exists,
                                        affine_addition_output_bucket_destinations,
                                        new_scratch_space_it);
            affine_output_it += 1;
        }

        // Update state for next iteration: carry over queued affine points from this batch
        affine_input_it = new_scratch_space_it;
    }
}

/**
 * @brief Compute multiple multi-scalar multiplications.
 * @details If we need to perform multiple MSMs, this method will be more efficient than calling `msm` repeatedly
 *          This is because this method will be able to dispatch equal work to all threads without splitting the input
 *          msms up so much.
 *          The Pippenger algorithm runtime is O(N/log(N)) so there will be slight gains as each inner-thread MSM will
 *          have a larger N.
 *
 * @tparam Curve
 * @param points
 * @param scalars (must be in non-Montgomery form)
 * @return std::vector<typename Curve::AffineElement>
 */
template <typename Curve>
std::vector<typename Curve::AffineElement> MSM<Curve>::batch_multi_scalar_mul(
    std::span<std::span<const typename Curve::AffineElement>> points,
    std::span<std::span<ScalarField>> scalars,
    bool handle_edge_cases) noexcept
{
    BB_ASSERT_EQ(points.size(), scalars.size());
    const size_t num_msms = points.size();

    std::vector<std::vector<uint32_t>> msm_scalar_indices;
    std::vector<ThreadWorkUnits> thread_work_units = get_work_units(scalars, msm_scalar_indices);
    const size_t num_cpus = get_num_cpus();
    std::vector<std::vector<std::pair<Element, size_t>>> thread_msm_results(num_cpus);
    BB_ASSERT_EQ(thread_work_units.size(), num_cpus);

    // Select Pippenger implementation once (hoisting branch outside hot loop)
    // Jacobian: safe, handles edge cases | Affine: faster, assumes linearly independent points
    auto pippenger_impl = handle_edge_cases ? small_pippenger_low_memory_with_transformed_scalars
                                            : pippenger_low_memory_with_transformed_scalars;

    // Once we have our work units, each thread can independently evaluate its assigned msms
    parallel_for(num_cpus, [&](size_t thread_idx) {
        if (!thread_work_units[thread_idx].empty()) {
            const std::vector<MSMWorkUnit>& msms = thread_work_units[thread_idx];
            std::vector<std::pair<Element, size_t>>& msm_results = thread_msm_results[thread_idx];
            msm_results.reserve(msms.size());

            // Reusable scratch buffer for this thread - avoids per-work-unit heap allocation
            std::vector<uint64_t> point_schedule;

            for (const MSMWorkUnit& msm : msms) {
                point_schedule.resize(msm.size);
                MSMData msm_data = MSMData::from_work_unit(
                    scalars, points, msm_scalar_indices, std::span<uint64_t>(point_schedule), msm);
                Element msm_result =
                    (msm.size < PIPPENGER_THRESHOLD) ? small_mul<Curve>(msm_data) : pippenger_impl(msm_data);

                msm_results.push_back(std::make_pair(msm_result, msm.batch_msm_index));
            }
        }
    });

    // Accumulate results. This part needs to be single threaded, but amount of work done here should be small
    // TODO(@zac-williamson) check this? E.g. if we are doing a 2^16 MSM with 256 threads this single-threaded part
    // will be painful.
    std::vector<Element> results(num_msms);
    for (Element& ele : results) {
        ele.self_set_infinity();
    }
    for (const auto& single_thread_msm_results : thread_msm_results) {
        for (const std::pair<Element, size_t>& result : single_thread_msm_results) {
            results[result.second] += result.first;
        }
    }
    Element::batch_normalize(&results[0], num_msms);

    std::vector<AffineElement> affine_results;
    affine_results.reserve(num_msms);
    for (const auto& ele : results) {
        affine_results.emplace_back(AffineElement(ele.x, ele.y));
    }

    return affine_results;
}

/**
 * @brief Helper method to evaluate a single MSM. Internally calls `batch_multi_scalar_mul`
 * @details This is the main entry point for MSM computation. It handles the Montgomery form conversion:
 *          scalars are converted FROM Montgomery form at entry, and back TO Montgomery form at exit.
 *          This ensures the scalars remain unchanged from the caller's perspective while allowing
 *          the internal algorithm to work with non-Montgomery form scalars.
 *
 *          The const_cast is safe because we restore the original Montgomery form before returning.
 *
 * @tparam Curve
 * @param points
 * @param scalars
 * @return Curve::AffineElement
 */
template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const ScalarField> scalars,
                                              bool handle_edge_cases) noexcept
{
    if (scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    BB_ASSERT_GTE(points.size(), scalars.start_index + scalars.size());

    // const_cast is safe: we convert from Montgomery form, run MSM, then convert back.
    // Scalars are unchanged from the caller's perspective.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    ScalarField* scalar_ptr = const_cast<ScalarField*>(&scalars[scalars.start_index]);
    const size_t num_scalars = scalars.size();

    // Convert scalars FROM Montgomery form for the MSM algorithm
    parallel_for_range(num_scalars, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            scalar_ptr[i].self_from_montgomery_form();
        }
    });

    std::vector<std::span<const AffineElement>> pp{ points.subspan(scalars.start_index) };
    std::vector<std::span<ScalarField>> ss{ std::span<ScalarField>(scalar_ptr, num_scalars) };
    AffineElement result = batch_multi_scalar_mul(pp, ss, handle_edge_cases)[0];

    // Convert scalars back TO Montgomery form so they remain unchanged from caller's perspective
    parallel_for_range(num_scalars, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            scalar_ptr[i].self_to_montgomery_form();
        }
    });

    return result;
}

template <typename Curve>
typename Curve::Element pippenger(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                  std::span<const typename Curve::AffineElement> points,
                                  [[maybe_unused]] bool handle_edge_cases) noexcept
{
    return MSM<Curve>::msm(points, scalars, handle_edge_cases);
}

template <typename Curve>
typename Curve::Element pippenger_unsafe(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                         std::span<const typename Curve::AffineElement> points) noexcept
{
    return MSM<Curve>::msm(points, scalars, false);
}

template curve::Grumpkin::Element pippenger<curve::Grumpkin>(PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
                                                             std::span<const curve::Grumpkin::AffineElement> points,
                                                             bool handle_edge_cases = true) noexcept;

template curve::Grumpkin::Element pippenger_unsafe<curve::Grumpkin>(
    PolynomialSpan<const curve::Grumpkin::ScalarField> scalars, std::span<const curve::Grumpkin::AffineElement> points);

template curve::BN254::Element pippenger<curve::BN254>(PolynomialSpan<const curve::BN254::ScalarField> scalars,
                                                       std::span<const curve::BN254::AffineElement> points,
                                                       bool handle_edge_cases = true);

template curve::BN254::Element pippenger_unsafe<curve::BN254>(PolynomialSpan<const curve::BN254::ScalarField> scalars,
                                                              std::span<const curve::BN254::AffineElement> points);

} // namespace bb::scalar_multiplication

template class bb::scalar_multiplication::MSM<bb::curve::Grumpkin>;
template class bb::scalar_multiplication::MSM<bb::curve::BN254>;
