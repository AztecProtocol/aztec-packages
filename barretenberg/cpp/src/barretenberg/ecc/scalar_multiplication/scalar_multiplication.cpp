// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
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
 * @brief Fallback method for very small numbers of input points
 *
 * @tparam Curve
 * @param scalars
 * @param points
 * @param range
 * @return Curve::Element
 */
template <typename Curve>
typename Curve::Element small_mul(std::span<const typename Curve::ScalarField>& scalars,
                                  std::span<const typename Curve::AffineElement>& points,
                                  std::span<const uint32_t> scalar_indices,
                                  size_t range) noexcept
{
    typename Curve::Element r = Curve::Group::point_at_infinity;
    for (size_t i = 0; i < range; ++i) {
        typename Curve::Element f = points[scalar_indices[i]];
        r += f * scalars[scalar_indices[i]].to_montgomery_form();
    }
    return r;
}

/**
 * @brief Convert scalar out of Montgomery form. Populate `consolidated_indices` with nonzero scalar indices
 *
 * @tparam Curve
 * @param scalars
 * @param consolidated_indices
 */
template <typename Curve>
void MSM<Curve>::transform_scalar_and_get_nonzero_scalar_indices(std::span<typename Curve::ScalarField> scalars,
                                                                 std::vector<uint32_t>& consolidated_indices) noexcept
{
    const size_t num_cpus = get_num_cpus();

    const size_t scalars_per_thread = numeric::ceil_div(scalars.size(), num_cpus);
    std::vector<std::vector<uint32_t>> thread_indices(num_cpus);
    parallel_for(num_cpus, [&](size_t thread_idx) {
        bool empty_thread = (thread_idx * scalars_per_thread >= scalars.size());
        bool last_thread = ((thread_idx + 1) * scalars_per_thread) >= scalars.size();
        const size_t start = thread_idx * scalars_per_thread;
        const size_t end = last_thread ? scalars.size() : (thread_idx + 1) * scalars_per_thread;
        if (!empty_thread) {
            BB_ASSERT_GT(end, start);
            std::vector<uint32_t>& thread_scalar_indices = thread_indices[thread_idx];
            thread_scalar_indices.reserve(end - start);
            for (size_t i = start; i < end; ++i) {
                BB_ASSERT_LT(i, scalars.size());
                auto& scalar = scalars[i];
                scalar.self_from_montgomery_form();

                bool is_zero =
                    (scalar.data[0] == 0) && (scalar.data[1] == 0) && (scalar.data[2] == 0) && (scalar.data[3] == 0);
                if (!is_zero) {
                    thread_scalar_indices.push_back(static_cast<uint32_t>(i));
                }
            }
        }
    });

    size_t num_entries = 0;
    for (size_t i = 0; i < num_cpus; ++i) {
        BB_ASSERT_LT(i, thread_indices.size());
        num_entries += thread_indices[i].size();
    }
    consolidated_indices.resize(num_entries);

    parallel_for(num_cpus, [&](size_t thread_idx) {
        size_t offset = 0;
        for (size_t i = 0; i < thread_idx; ++i) {
            BB_ASSERT_LT(i, thread_indices.size());
            offset += thread_indices[i].size();
        }
        for (size_t i = offset; i < offset + thread_indices[thread_idx].size(); ++i) {
            BB_ASSERT_LT(i, scalars.size());
            consolidated_indices[i] = thread_indices[thread_idx][i - offset];
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
 * @param scalars
 * @param msm_scalar_indices
 * @return std::vector<typename MSM<Curve>::ThreadWorkUnits>
 */
template <typename Curve>
std::vector<typename MSM<Curve>::ThreadWorkUnits> MSM<Curve>::get_work_units(
    std::vector<std::span<ScalarField>>& scalars, std::vector<std::vector<uint32_t>>& msm_scalar_indices) noexcept
{

    const size_t num_msms = scalars.size();
    msm_scalar_indices.resize(num_msms);
    for (size_t i = 0; i < num_msms; ++i) {
        BB_ASSERT_LT(i, scalars.size());
        transform_scalar_and_get_nonzero_scalar_indices(scalars[i], msm_scalar_indices[i]);
    }

    size_t total_work = 0;
    for (const auto& indices : msm_scalar_indices) {
        total_work += indices.size();
    }

    const size_t num_threads = get_num_cpus();
    std::vector<ThreadWorkUnits> work_units(num_threads);

    const size_t work_per_thread = numeric::ceil_div(total_work, num_threads);
    size_t work_of_last_thread = total_work - (work_per_thread * (num_threads - 1));

    // [(MSMs + T - 1) / T] * [T - 1] > MSMs
    // T = 192
    // ([M + 191] / 192) * 193 > M
    // only use a single work unit if we don't have enough work for every thread
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
        BB_ASSERT_LT(i, msm_scalar_indices.size());
        size_t msm_work = msm_scalar_indices[i].size();
        size_t msm_size = msm_work;
        while (msm_work > 0) {
            const size_t total_thread_work =
                (current_thread_idx == num_threads - 1) ? work_of_last_thread : work_per_thread;
            const size_t available_thread_work = total_thread_work - thread_accumulated_work;

            if (available_thread_work >= msm_work) {
                BB_ASSERT_LT(current_thread_idx, work_units.size());
                work_units[current_thread_idx].push_back(MSMWorkUnit{
                    .batch_msm_index = i,
                    .start_index = msm_size - msm_work,
                    .size = msm_work,
                });
                thread_accumulated_work += msm_work;
                msm_work = 0;
            } else {
                BB_ASSERT_LT(current_thread_idx, work_units.size());
                work_units[current_thread_idx].push_back(MSMWorkUnit{
                    .batch_msm_index = i,
                    .start_index = msm_size - msm_work,
                    .size = available_thread_work,
                });
                msm_work -= available_thread_work;
                current_thread_idx++;
                thread_accumulated_work = 0;
            }
        }
    }
    return work_units;
}

/**
 * @brief Given a scalar that is *NOT* in Montgomery form, extract a `slice_size`-bit chunk
 * @brief At round i, we extract `slice_size * (i-1)` to `slice_sice * i` most significant bits.
 *
 * @tparam Curve
 * @param scalar
 * @param round
 * @param normal_slice_size
 * @return uint32_t
 */
template <typename Curve>
uint32_t MSM<Curve>::get_scalar_slice(const typename Curve::ScalarField& scalar,
                                      size_t round,
                                      size_t slice_size) noexcept
{
    size_t hi_bit = NUM_BITS_IN_FIELD - (round * slice_size);
    // todo remove
    bool last_slice = hi_bit < slice_size;
    size_t target_slice_size = last_slice ? hi_bit : slice_size;
    size_t lo_bit = last_slice ? 0 : hi_bit - slice_size;
    size_t start_limb = lo_bit / 64;
    size_t end_limb = hi_bit / 64;
    size_t lo_slice_offset = lo_bit & 63;
    size_t lo_slice_bits = std::min(target_slice_size, 64 - lo_slice_offset);
    size_t hi_slice_bits = target_slice_size - lo_slice_bits;
    size_t lo_slice = (scalar.data[start_limb] >> lo_slice_offset) & ((static_cast<size_t>(1) << lo_slice_bits) - 1);
    size_t hi_slice = (scalar.data[end_limb] & ((static_cast<size_t>(1) << hi_slice_bits) - 1));

    uint32_t lo = static_cast<uint32_t>(lo_slice);
    uint32_t hi = static_cast<uint32_t>(hi_slice);

    uint32_t result = lo + (hi << lo_slice_bits);
    return result;
}

/**
 * @brief For a given number of points, compute the optimal Pippenger bucket size
 *
 * @tparam Curve
 * @param num_points
 * @return constexpr size_t
 */
template <typename Curve> size_t MSM<Curve>::get_optimal_log_num_buckets(const size_t num_points) noexcept
{
    // We do 2 group operations per bucket, and they are full 3D Jacobian adds which are ~2x more than an affine add
    constexpr size_t COST_OF_BUCKET_OP_RELATIVE_TO_POINT = 5;
    size_t cached_cost = static_cast<size_t>(-1);
    size_t target_bit_slice = 0;
    for (size_t bit_slice = 1; bit_slice < 20; ++bit_slice) {
        const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bit_slice);
        const size_t num_buckets = 1 << bit_slice;
        const size_t addition_cost = num_rounds * num_points;
        const size_t bucket_cost = num_rounds * num_buckets * COST_OF_BUCKET_OP_RELATIVE_TO_POINT;
        const size_t total_cost = addition_cost + bucket_cost;
        if (total_cost < cached_cost) {
            cached_cost = total_cost;
            target_bit_slice = bit_slice;
        }
    }
    return target_bit_slice;
}

/**
 * @brief Given a number of points and an optimal bucket size, should we use the affine trick?
 *
 * @tparam Curve
 * @param num_points
 * @param num_buckets
 * @return true
 * @return false
 */
template <typename Curve> bool MSM<Curve>::use_affine_trick(const size_t num_points, const size_t num_buckets) noexcept
{
    if (num_points < 128) {
        return false;
    }

    // Affine trick requires log(N) modular inversions per Pippenger round.
    // It saves NUM_POINTS * COST_SAVING_OF_AFFINE_TRICK_PER_GROUP_OPERATION field muls
    // It also saves NUM_BUCKETS * EXTRA_COST_OF_JACOBIAN_GROUP_OPERATION_IF_Z2_IS_NOT_1 field muls
    // due to all our buckets having Z=1 if we use the affine trick

    // COST_OF_INVERSION cost:
    // Requires NUM_BITS_IN_FIELD sqarings
    // We use 4-bit windows = ((NUM_BITS_IN_FIELD + 3) / 4) multiplications
    // Computing 4-bit window table requires 14 muls
    constexpr size_t COST_OF_INVERSION = NUM_BITS_IN_FIELD + ((NUM_BITS_IN_FIELD + 3) / 4) + 14;
    constexpr size_t COST_SAVING_OF_AFFINE_TRICK_PER_GROUP_OPERATION = 5;
    constexpr size_t EXTRA_COST_OF_JACOBIAN_GROUP_OPERATION_IF_Z2_IS_NOT_1 = 5;

    double num_points_f = static_cast<double>(num_points);
    double log2_num_points_f = log2(num_points_f);

    size_t group_op_cost_saving_per_round = (num_points * COST_SAVING_OF_AFFINE_TRICK_PER_GROUP_OPERATION) +
                                            (num_buckets * EXTRA_COST_OF_JACOBIAN_GROUP_OPERATION_IF_Z2_IS_NOT_1);
    double inversion_cost_per_round = log2_num_points_f * static_cast<double>(COST_OF_INVERSION);

    return static_cast<double>(group_op_cost_saving_per_round) > inversion_cost_per_round;
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
        abort_with_message("attempted to invert zero in add_affine_points");
    } else {
        batch_inversion_accumulator = batch_inversion_accumulator.invert();
    }

    // Iterate backwards through the points, comnputing pairwise affine additions; addition results are stored in the
    // latter half of the array
    for (size_t i = (num_points)-2; i < num_points; i -= 2) {
        points[i + 1].y *= batch_inversion_accumulator; // update accumulator
        batch_inversion_accumulator *= points[i + 1].x;
        points[i + 1].x = points[i + 1].y.sqr();
        points[(i + num_points) >> 1].x = points[i + 1].x - (scratch_space[i >> 1]); // x3 = lambda_squared - x2
                                                                                     // - x1
        // Memory bandwidth is a bit of a bottleneck here.
        // There's probably a more elegant way of structuring our data so we don't need to do all of this
        // prefetching
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
 * @brief Top-level Pippenger algorithm where number of points is small and we are not using the Affine trick
 *
 * @tparam Curve
 * @param msm_data
 * @return Curve::AffineElement
 */
template <typename Curve>
typename Curve::Element MSM<Curve>::small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    const size_t size = nonzero_scalar_indices.size();
    const size_t bits_per_slice = get_optimal_log_num_buckets(size);
    const size_t num_buckets = 1 << bits_per_slice;
    JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);

    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_small_pippenger_round(msm_data, i, bucket_data, round_output, bits_per_slice);
    }
    return round_output;
}

/**
 * @brief Top-level Pippenger algorithm
 *
 * @tparam Curve
 * @param msm_data
 * @return Curve::AffineElement
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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1452): Consider allowing this memory to persist rather
    // than allocating/deallocating on every execution.
    AffineAdditionData affine_data = AffineAdditionData();
    BucketAccumulators bucket_data = BucketAccumulators(num_buckets);

    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);
    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_pippenger_round(msm_data, i, affine_data, bucket_data, round_output, bits_per_slice);
    }

    return (round_output);
}

/**
 * @brief Evaluate a single Pippenger round when we do not use the Affine trick
 *
 * @tparam Curve
 * @param msm_data
 * @param round_index
 * @param bucket_data
 * @param previous_round_output
 * @param bits_per_slice
 * @return Curve::Element
 */
template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_small_pippenger_round(MSMData& msm_data,
                                                                   const size_t round_index,
                                                                   MSM<Curve>::JacobianBucketAccumulators& bucket_data,
                                                                   typename Curve::Element previous_round_output,
                                                                   const size_t bits_per_slice) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;

    const size_t size = nonzero_scalar_indices.size();
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_LT(nonzero_scalar_indices[i], scalars.size());
        uint32_t bucket_index = get_scalar_slice(scalars[nonzero_scalar_indices[i]], round_index, bits_per_slice);
        BB_ASSERT_LT(bucket_index, static_cast<uint32_t>(1 << bits_per_slice));
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
    Element round_output;
    round_output.self_set_infinity();
    round_output = accumulate_buckets(bucket_data);
    bucket_data.bucket_exists.clear();
    Element result = previous_round_output;
    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);
    size_t num_doublings = ((round_index == num_rounds - 1) && (NUM_BITS_IN_FIELD % bits_per_slice != 0))
                               ? NUM_BITS_IN_FIELD % bits_per_slice
                               : bits_per_slice;
    for (size_t i = 0; i < num_doublings; ++i) {
        result.self_dbl();
    }

    result += round_output;
    return result;
}

/**
 * @brief Evaluate a single Pippenger round where we use the affine trick
 *
 * @tparam Curve
 * @param msm_data
 * @param round_index
 * @param affine_data
 * @param bucket_data
 * @param previous_round_output
 * @param bits_per_slice
 * @return Curve::Element
 */
template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_pippenger_round(MSMData& msm_data,
                                                             const size_t round_index,
                                                             MSM<Curve>::AffineAdditionData& affine_data,
                                                             MSM<Curve>::BucketAccumulators& bucket_data,
                                                             typename Curve::Element previous_round_output,
                                                             const size_t bits_per_slice) noexcept
{
    std::span<const uint32_t>& scalar_indices = msm_data.scalar_indices; // indices of nonzero scalars
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;
    std::span<uint64_t>& round_schedule = msm_data.point_schedule;
    const size_t size = scalar_indices.size();

    // Construct a "round schedule". Each entry describes:
    // 1. low 32 bits: which bucket index do we add the point into? (bucket index = slice value)
    // 2. high 32 bits: which point index do we source the point from?
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_LT(scalar_indices[i], scalars.size());
        round_schedule[i] = get_scalar_slice(scalars[scalar_indices[i]], round_index, bits_per_slice);
        round_schedule[i] += (static_cast<uint64_t>(scalar_indices[i]) << 32ULL);
    }
    // Sort our point schedules based on their bucket values. Reduces memory throughput in next step of algo
    const size_t num_zero_entries = scalar_multiplication::process_buckets_count_zero_entries(
        &round_schedule[0], size, static_cast<uint32_t>(bits_per_slice));
    BB_ASSERT_LTE(num_zero_entries, size);
    const size_t round_size = size - num_zero_entries;

    Element round_output;
    round_output.self_set_infinity();

    if (round_size > 0) {
        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        // Iterate through our point schedule and add points into corresponding buckets
        consume_point_schedule(point_schedule, points, affine_data, bucket_data, 0, 0);
        round_output = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();
    }

    Element result = previous_round_output;
    const size_t num_rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, bits_per_slice);
    size_t num_doublings = ((round_index == num_rounds - 1) && (NUM_BITS_IN_FIELD % bits_per_slice != 0))
                               ? NUM_BITS_IN_FIELD % bits_per_slice
                               : bits_per_slice;
    for (size_t i = 0; i < num_doublings; ++i) {
        result.self_dbl();
    }

    result += round_output;
    return result;
}

/**
 * @brief Given a list of points and target buckets to add into, perform required group operations
 * @details This algorithm uses exclusively affine group operations, using batch inversions to amortise costs
 *
 * @tparam Curve
 * @param point_schedule
 * @param points
 * @param affine_data
 * @param bucket_data
 * @param num_input_points_processed
 * @param num_queued_affine_points
 */
template <typename Curve>
void MSM<Curve>::consume_point_schedule(std::span<const uint64_t> point_schedule,
                                        std::span<const typename Curve::AffineElement> points,
                                        MSM<Curve>::AffineAdditionData& affine_data,
                                        MSM<Curve>::BucketAccumulators& bucket_data,
                                        size_t num_input_points_processed,
                                        size_t num_queued_affine_points) noexcept
{

    size_t point_it = num_input_points_processed;
    size_t affine_input_it = num_queued_affine_points;
    // N.B. points and point_schedule MAY HAVE DIFFERENT SIZES
    // We source the number of actual points we work on from the point schedule
    size_t num_points = point_schedule.size();
    auto& bucket_accumulator_exists = bucket_data.bucket_exists;
    auto& affine_addition_scratch_space = affine_data.points_to_add;
    auto& bucket_accumulators = bucket_data.buckets;
    auto& affine_addition_output_bucket_destinations = affine_data.addition_result_bucket_destinations;
    auto& scalar_scratch_space = affine_data.scalar_scratch_space;
    auto& output_point_schedule = affine_data.addition_result_bucket_destinations;
    AffineElement null_location{};
    // We do memory prefetching, `prefetch_max` ensures we do not overflow our containers
    size_t prefetch_max = (num_points - 32);
    if (num_points < 32) {
        prefetch_max = 0;
    }
    size_t end = num_points - 1;
    if (num_points == 0) {
        end = 0;
    }

    // Step 1: Fill up `affine_addition_scratch_space` with up to AffineAdditionData::BATCH_SIZE/2 independent additions
    while (((affine_input_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < end)) {

        // we prefetchin'
        if ((point_it < prefetch_max) && ((point_it & 0x0f) == 0)) {
            for (size_t i = 16; i < 32; ++i) {
                __builtin_prefetch(&points[(point_schedule[point_it + i] >> 32ULL)]);
            }
        }

        // We do some branchless programming here to minimize instruction pipeline flushes
        // TODO(@zac-williamson, cc @ludamad) check these ternary operators are not branching!
        // We are iterating through our points and can come across the following scenarios:
        // 1: The next 2 points in `point_schedule` belong to the *same* bucket
        //    (happy path - can put both points into affine_addition_scratch_space)
        // 2: The next 2 points have different bucket destinations AND point_schedule[point_it].bucket contains a point
        //    (happyish path - we can put points[lhs_schedule] and buckets[lhs_bucket] into
        //    affine_addition_scratch_space)
        // 3: The next 2 points have different bucket destionations AND point_schedule[point_it].bucket is empty
        //    We cache points[lhs_schedule] into buckets[lhs_bucket]
        // We iterate `point_it` by 2 (case 1), or by 1 (case 2 or 3). The number of points we add into
        // `affine_addition_scratch_space` is 2 (case 1 or 2) or 0 (case 3).
        uint64_t lhs_schedule = point_schedule[point_it];
        uint64_t rhs_schedule = point_schedule[point_it + 1];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t rhs_bucket = static_cast<size_t>(rhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        size_t rhs_point = static_cast<size_t>(rhs_schedule >> 32);

        bool has_bucket_accumulator = bucket_accumulator_exists.get(lhs_bucket);
        bool buckets_match = lhs_bucket == rhs_bucket;
        bool do_affine_add = buckets_match || has_bucket_accumulator;

        const AffineElement* lhs_source = &points[lhs_point];
        const AffineElement* rhs_source = buckets_match ? &points[rhs_point] : &bucket_accumulators[lhs_bucket];

        // either two points are set to be added (point to point or point into bucket accumulator), or lhs is stored in
        // the bucket and rhs is temporarily ignored
        AffineElement* lhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it] : &bucket_accumulators[lhs_bucket];
        AffineElement* rhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it + 1] : &null_location;

        // if performing an affine add, set the destination bucket corresponding to the addition result
        uint64_t& source_bucket_destination = affine_addition_output_bucket_destinations[affine_input_it >> 1];
        source_bucket_destination = do_affine_add ? lhs_bucket : source_bucket_destination;

        // unconditional swap. No if statements here.
        *lhs_destination = *lhs_source;
        *rhs_destination = *rhs_source;

        // indicate whether bucket_accumulators[lhs_bucket] will contain a point after this iteration
        bucket_accumulator_exists.set(
            lhs_bucket,
            (has_bucket_accumulator && buckets_match) || /* bucket has an accum and its not being used in current add */
                !do_affine_add);                         /* lhs point is cached into the bucket */

        affine_input_it += do_affine_add ? 2 : 0;
        point_it += (do_affine_add && buckets_match) ? 2 : 1;
    }
    // We have to handle the last point as an edge case so that we dont overflow the bounds of `point_schedule`. If the
    // bucket accumulator exists, we add the point to it, otherwise the point simply becomes the bucket accumulator.
    if (point_it == num_points - 1) {
        uint64_t lhs_schedule = point_schedule[point_it];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        bool has_bucket_accumulator = bucket_accumulator_exists.get(lhs_bucket);

        if (has_bucket_accumulator) { // point is added to its bucket accumulator
            affine_addition_scratch_space[affine_input_it] = points[lhs_point];
            affine_addition_scratch_space[affine_input_it + 1] = bucket_accumulators[lhs_bucket];
            bucket_accumulator_exists.set(lhs_bucket, false);
            affine_addition_output_bucket_destinations[affine_input_it >> 1] = lhs_bucket;
            affine_input_it += 2;
            point_it += 1;
        } else { // otherwise, cache the point into the bucket
            BB_ASSERT_LT(lhs_point, points.size());
            bucket_accumulators[lhs_bucket] = points[lhs_point];
            bucket_accumulator_exists.set(lhs_bucket, true);
            point_it += 1;
        }
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
    // We either need to feed the addition outputs back into affine_addition_scratch_space for more addition operations.
    // Or, if there are no more additions for a bucket, we store the addition output in a bucket accumulator.
    size_t new_scratch_space_it = 0;
    size_t affine_output_it = 0;
    size_t num_affine_output_points = num_affine_points_to_add / 2;
    // This algorithm is equivalent to the one we used to populate `affine_addition_scratch_space` from the point
    // schedule, however here we source points from a different location (the addition results)
    while ((affine_output_it < (num_affine_output_points - 1)) && (num_affine_output_points > 0)) {
        size_t lhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it]);
        size_t rhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it + 1]);
        BB_ASSERT_LT(lhs_bucket, bucket_accumulator_exists.size());

        bool has_bucket_accumulator = bucket_accumulator_exists.get(lhs_bucket);
        bool buckets_match = (lhs_bucket == rhs_bucket);
        bool do_affine_add = buckets_match || has_bucket_accumulator;

        const AffineElement* lhs_source = &affine_output[affine_output_it];
        const AffineElement* rhs_source =
            buckets_match ? &affine_output[affine_output_it + 1] : &bucket_accumulators[lhs_bucket];

        AffineElement* lhs_destination =
            do_affine_add ? &affine_addition_scratch_space[new_scratch_space_it] : &bucket_accumulators[lhs_bucket];
        AffineElement* rhs_destination =
            do_affine_add ? &affine_addition_scratch_space[new_scratch_space_it + 1] : &null_location;

        uint64_t& source_bucket_destination = output_point_schedule[new_scratch_space_it >> 1];
        source_bucket_destination = do_affine_add ? lhs_bucket : source_bucket_destination;

        *lhs_destination = *lhs_source;
        *rhs_destination = *rhs_source;

        bucket_accumulator_exists.set(lhs_bucket, (has_bucket_accumulator && buckets_match) || !do_affine_add);
        new_scratch_space_it += do_affine_add ? 2 : 0;
        affine_output_it += (do_affine_add && buckets_match) ? 2 : 1;
    }
    // perform final iteration as edge case so we don't overflow `affine_addition_output_bucket_destinations`
    if (affine_output_it == (num_affine_output_points - 1)) {

        size_t lhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it]);

        bool has_bucket_accumulator = bucket_accumulator_exists.get(lhs_bucket);
        if (has_bucket_accumulator) {
            BB_ASSERT_LT(new_scratch_space_it + 1, affine_addition_scratch_space.size());
            BB_ASSERT_LT(lhs_bucket, bucket_accumulators.size());
            BB_ASSERT_LT(new_scratch_space_it >> 1, output_point_schedule.size());
            affine_addition_scratch_space[new_scratch_space_it] = affine_output[affine_output_it];
            affine_addition_scratch_space[new_scratch_space_it + 1] = bucket_accumulators[lhs_bucket];
            bucket_accumulator_exists.set(lhs_bucket, false);
            output_point_schedule[new_scratch_space_it >> 1] = lhs_bucket;
            new_scratch_space_it += 2;
            affine_output_it += 1;
        } else {
            bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
            bucket_accumulator_exists.set(lhs_bucket, true);
            affine_output_it += 1;
        }
    }

    // If we have not finished iterating over the point schedule,
    // OR we have affine additions to perform in the scratch space, continue
    if (point_it < num_points || new_scratch_space_it != 0) {
        consume_point_schedule(point_schedule, points, affine_data, bucket_data, point_it, new_scratch_space_it);
    }
}

/**
 * @brief Compute multiple multi-scalar multiplications.
 * @details If we need to perform multiple MSMs, this method will be more efficient than calling `msm` repeatedly
 *          This is because this method will be able to dispatch equal work to all threads without splitting the input
 *          msms up so much.
 *          The Pippenger algorithm runtime is O(N/log(N)) so there will be slight gains as each inner-thread MSM will
 *          have a larger N
 *
 * @tparam Curve
 * @param points
 * @param scalars
 * @return std::vector<typename Curve::AffineElement>
 */
template <typename Curve>
std::vector<typename Curve::AffineElement> MSM<Curve>::batch_multi_scalar_mul(
    std::vector<std::span<const typename Curve::AffineElement>>& points,
    std::vector<std::span<ScalarField>>& scalars,
    bool handle_edge_cases) noexcept
{
    ASSERT(points.size() == scalars.size());
    const size_t num_msms = points.size();

    std::vector<std::vector<uint32_t>> msm_scalar_indices;
    std::vector<ThreadWorkUnits> thread_work_units = get_work_units(scalars, msm_scalar_indices);
    const size_t num_cpus = get_num_cpus();
    std::vector<std::vector<std::pair<Element, size_t>>> thread_msm_results(num_cpus);
    BB_ASSERT_EQ(thread_work_units.size(), num_cpus);

    // Once we have our work units, each thread can independently evaluate its assigned msms
    parallel_for(num_cpus, [&](size_t thread_idx) {
        if (!thread_work_units[thread_idx].empty()) {
            const std::vector<MSMWorkUnit>& msms = thread_work_units[thread_idx];
            std::vector<std::pair<Element, size_t>>& msm_results = thread_msm_results[thread_idx];
            for (const MSMWorkUnit& msm : msms) {
                std::span<const ScalarField> work_scalars = scalars[msm.batch_msm_index];
                std::span<const AffineElement> work_points = points[msm.batch_msm_index];
                std::span<const uint32_t> work_indices =
                    std::span<const uint32_t>{ &msm_scalar_indices[msm.batch_msm_index][msm.start_index], msm.size };
                std::vector<uint64_t> point_schedule(msm.size);
                MSMData msm_data(work_scalars, work_points, work_indices, std::span<uint64_t>(point_schedule));
                Element msm_result = Curve::Group::point_at_infinity;
                constexpr size_t SINGLE_MUL_THRESHOLD = 16;
                if (msm.size < SINGLE_MUL_THRESHOLD) {
                    msm_result = small_mul<Curve>(work_scalars, work_points, msm_data.scalar_indices, msm.size);
                } else {
                    // Our non-affine method implicitly handles cases where Weierstrass edge cases may occur
                    // Note: not as fast! use unsafe version if you know all input base points are linearly independent
                    if (handle_edge_cases) {
                        msm_result = small_pippenger_low_memory_with_transformed_scalars(msm_data);
                    } else {
                        msm_result = pippenger_low_memory_with_transformed_scalars(msm_data);
                    }
                }
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
    for (const auto& ele : results) {
        affine_results.emplace_back(AffineElement(ele.x, ele.y));
    }

    // Convert our scalars back into Montgomery form so they remain unchanged
    for (auto& msm_scalars : scalars) {
        parallel_for_range(msm_scalars.size(), [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                msm_scalars[i].self_to_montgomery_form();
            }
        });
    }
    return affine_results;
}

/**
 * @brief Helper method to evaluate a single MSM. Internally calls `batch_multi_scalar_mul`
 *
 * @tparam Curve
 * @param points
 * @param _scalars
 * @return Curve::AffineElement
 */
template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const ScalarField> _scalars,
                                              bool handle_edge_cases) noexcept
{
    if (_scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    BB_ASSERT_GTE(points.size(), _scalars.start_index + _scalars.size());

    // unfortnately we need to remove const on this data type to prevent duplicating _scalars (which is typically
    // large) We need to convert `_scalars` out of montgomery form for the MSM. We then convert the scalars back
    // into Montgomery form at the end of the algorithm. NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1449): handle const correctness.
    ScalarField* scalars = const_cast<ScalarField*>(&_scalars[_scalars.start_index]);

    std::vector<std::span<const AffineElement>> pp{ points.subspan(_scalars.start_index) };
    std::vector<std::span<ScalarField>> ss{ std::span<ScalarField>(scalars, _scalars.size()) };
    AffineElement result = batch_multi_scalar_mul(pp, ss, handle_edge_cases)[0];
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
