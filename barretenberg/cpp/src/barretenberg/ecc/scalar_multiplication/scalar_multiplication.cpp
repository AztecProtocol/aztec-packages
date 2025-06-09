#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"

#include "./runtime_states.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <ostream>

#include "./process_buckets.hpp"
#include "./scalar_multiplication.hpp"

#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb::scalar_multiplication {

template <typename Curve>
std::vector<ThreadWorkUnits> MSM<Curve>::get_work_units(std::vector<std::span<ScalarField>>& scalars,
                                                        std::vector<std::vector<uint32_t>>& msm_scalar_indices)
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

    const size_t work_per_thread = (total_work + num_threads - 1) / num_threads;
    size_t work_of_last_thread = total_work - (work_per_thread * (num_threads - 1));

    // only use a single work unit if we don't have enough work for every thread
    if ((work_per_thread * (num_threads - 1)) > total_work) {
        for (size_t i = 0; i < num_msms; ++i) {
            work_units[0].push_back(MSMWorkUnitB{
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
                work_units[current_thread_idx].push_back(MSMWorkUnitB{
                    .batch_msm_index = i,
                    .start_index = msm_size - msm_work,
                    .size = msm_work,
                });
                thread_accumulated_work += msm_work;
                msm_work = 0;
            } else {
                BB_ASSERT_LT(current_thread_idx, work_units.size());
                work_units[current_thread_idx].push_back(MSMWorkUnitB{
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

template <typename Curve>
uint32_t MSM<Curve>::get_scalar_slice(const typename Curve::ScalarField& scalar, size_t round, size_t normal_slice_size)
{
    size_t hi_bit = NUM_BITS_IN_FIELD - (round * normal_slice_size);
    size_t lo_bit = hi_bit - normal_slice_size;
    // todo remove
    size_t slice_size = normal_slice_size;
    if (hi_bit < slice_size) {
        lo_bit = 0;
        slice_size = hi_bit;
    }
    size_t start_limb = lo_bit / 64;
    size_t end_limb = hi_bit / 64;
    size_t lo_slice_offset = lo_bit & 63;
    size_t lo_slice_bits = std::min(slice_size, 64 - lo_slice_offset);
    size_t hi_slice_bits = slice_size - lo_slice_bits;
    BB_ASSERT_LT(start_limb, static_cast<size_t>(4));
    BB_ASSERT_LT(end_limb, static_cast<size_t>(4));
    size_t lo_slice = (scalar.data[start_limb] >> lo_slice_offset) & ((1 << lo_slice_bits) - 1);
    size_t hi_slice = (scalar.data[end_limb] & ((1 << hi_slice_bits) - 1));

    uint32_t lo = static_cast<uint32_t>(lo_slice);
    uint32_t hi = static_cast<uint32_t>(hi_slice);

    uint32_t result = lo + (hi << lo_slice_bits);
    return result;
}

template <typename Curve> constexpr size_t MSM<Curve>::get_log_num_buckets(const size_t num_points)
{
    // a bit of a guess here
    constexpr size_t COST_OF_BUCKET_OP_RELATIVE_TO_POINT = 4;
    size_t cached_cost = static_cast<size_t>(-1);
    size_t target_bit_slice = 0;
    for (size_t bit_slice = 1; bit_slice < 20; ++bit_slice) {
        const size_t num_rounds = (NUM_BITS_IN_FIELD + (bit_slice - 1)) / bit_slice;
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

template <typename Curve> bool MSM<Curve>::use_affine_trick(const size_t num_points, const size_t num_buckets)
{
    if (num_points < 128) {
        return false;
    }
    // Our optimized pippenger algorithm makes use of the "affine trick" which uses batch inverse techniques to
    // ensure the majority of group operations are in affine form.
    // However, this requires log(N) modular inversions per Pippenger round.
    // The number of rounds is ~ lambda / log(N) which means this technique incurs lambda modular inversions.
    // The (rough) number of group ops in Pippenger is (N * lambda) / log(N)
    // The affine trick converts (N * lambda) / log(N) Jacobian additions into Affine additions, saving roughly 3
    // ScalarField muls i.e. (3 * N * lambda) / log(N) = saved ScalarField ops The inversions cost ~ 384 * lambda
    // ScalarField ops So! if (3 * N) / log(N) < 384, we should not use the affine trick
    //
    // TLDR: if N / log(N) >= 128 , we should use the affine trick
    // N.B. this works out to N = 11

    // modular inverse = compute x^{p-1}.
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

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data)
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    const size_t size = nonzero_scalar_indices.size();
    const size_t bits_per_slice = get_log_num_buckets(size);
    const size_t num_buckets = 1 << bits_per_slice;
    JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;

    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_small_pippenger_round(msm_data, i, bucket_data, round_output, bits_per_slice);
    }
    return AffineElement(round_output);
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::pippenger_low_memory_with_transformed_scalars(MSMData& msm_data)
{
    const size_t msm_size = msm_data.scalar_indices.size();
    const size_t bits_per_slice = get_log_num_buckets(msm_size);
    const size_t num_buckets = 1 << bits_per_slice;

    if (!use_affine_trick(msm_size, num_buckets)) {
        return small_pippenger_low_memory_with_transformed_scalars(msm_data);
    }
    AffineAdditionData affine_data = AffineAdditionData();
    BucketAccumulators bucket_data = BucketAccumulators(num_buckets);

    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_pippenger_round(msm_data, i, affine_data, bucket_data, round_output, bits_per_slice);
    }

    return AffineElement(round_output);
}

template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_small_pippenger_round(MSMData& msm_data,
                                                                   const size_t round_index,
                                                                   MSM<Curve>::JacobianBucketAccumulators& bucket_data,
                                                                   typename Curve::Element previous_round_output,
                                                                   const size_t bits_per_slice)
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
    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
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
 * adds a bunch of points together using affine addition formulae.
 * Paradoxically, the affine formula is crazy efficient if you have a lot of independent point additions to perform.
 * Affine formula:
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
 *sequence.
 *
 * We can re-arrange the Pippenger algorithm to get this property, but it's...complicated
 **/
template <typename Curve>
void add_affine_points(typename Curve::AffineElement* points,
                       const size_t num_points,
                       typename Curve::BaseField* scratch_space)
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

    for (size_t i = (num_points)-2; i < num_points; i -= 2) {
        // Memory bandwidth is a bit of a bottleneck here.
        // There's probably a more elegant way of structuring our data so we don't need to do all of this
        // prefetching

        points[i + 1].y *= batch_inversion_accumulator; // update accumulator
        batch_inversion_accumulator *= points[i + 1].x;
        points[i + 1].x = points[i + 1].y.sqr();
        points[(i + num_points) >> 1].x = points[i + 1].x - (scratch_space[i >> 1]); // x3 = lambda_squared - x2
                                                                                     // - x1

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

template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_pippenger_round(MSMData& msm_data,
                                                             const size_t round_index,
                                                             MSM<Curve>::AffineAdditionData& affine_data,
                                                             MSM<Curve>::BucketAccumulators& bucket_data,
                                                             typename Curve::Element previous_round_output,
                                                             const size_t bits_per_slice)
{
    std::span<const uint32_t>& scalar_indices = msm_data.scalar_indices;
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;
    std::span<uint64_t>& round_schedule = msm_data.point_schedule;
    const size_t size = scalar_indices.size();

    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_LT(scalar_indices[i], scalars.size());
        round_schedule[i] = get_scalar_slice(scalars[scalar_indices[i]], round_index, bits_per_slice);

        round_schedule[i] += (static_cast<uint64_t>(scalar_indices[i]) << 32);
    }
    const size_t num_zero_entries = scalar_multiplication::process_buckets_count_zero_entries(
        &round_schedule[0], size, static_cast<uint32_t>(bits_per_slice));
    BB_ASSERT_LTE(num_zero_entries, size);
    const size_t round_size = size - num_zero_entries;

    Element round_output;
    round_output.self_set_infinity();

    if (round_size > 0) {
        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        consume_point_batch(point_schedule, points, affine_data, bucket_data, 0, 0);
        round_output = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();
    }

    Element result = previous_round_output;
    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
    size_t num_doublings = ((round_index == num_rounds - 1) && (NUM_BITS_IN_FIELD % bits_per_slice != 0))
                               ? NUM_BITS_IN_FIELD % bits_per_slice
                               : bits_per_slice;
    for (size_t i = 0; i < num_doublings; ++i) {
        result.self_dbl();
    }

    result += round_output;
    return result;
}

template <typename Curve>
void MSM<Curve>::consume_point_batch(std::span<const uint64_t> point_schedule,
                                     std::span<const typename Curve::AffineElement> points,
                                     MSM<Curve>::AffineAdditionData& affine_data,
                                     MSM<Curve>::BucketAccumulators& bucket_data,
                                     size_t num_input_points_processed,
                                     size_t num_queued_affine_points)
{

    size_t point_it = num_input_points_processed;
    size_t affine_input_it = num_queued_affine_points;
    // N.B. points and point_schedule MAY HAVE DIFFERENT SIZES
    size_t num_points = point_schedule.size();
    auto& overflow_exists = bucket_data.bucket_exists;
    auto& affine_addition_scratch_space = affine_data.points_to_add;
    auto& bucket_accumulators = bucket_data.buckets;
    auto& affine_addition_output_bucket_destinations = affine_data.addition_result_bucket_destinations;
    auto& scalar_scratch_space = affine_data.scalar_scratch_space;
    auto& output_point_schedule = affine_data.addition_result_bucket_destinations;
    std::vector<AffineElement> null_location = std::vector<AffineElement>(2);
    // std::cout << "CA" << std::endl;
    size_t prefetch_max = (num_points - 32);
    if (num_points < 32) {
        prefetch_max = 0;
    }
    size_t end = num_points - 1;
    BB_ASSERT_GT(num_points, 0u);
    if (num_points == 0) {
        end = 0;
    }
    while (((affine_input_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < end)) {
        // if (point_schedule.size() == 3) {
        //     std::cout << "point it " << point_it << ", affine input it = " << affine_input_it << std::endl;
        //     std::cout << "num_points " << num_points << std::endl;
        // }
        if ((point_it < prefetch_max) && ((point_it & 0x0f) == 0)) {
            // if (point_schedule.size() == 3) {
            //     std::cout << "prefetching" << std::endl;
            // }
            __builtin_prefetch(&points[(point_schedule[point_it + 16] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 17] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 18] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 19] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 20] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 21] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 22] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 23] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 24] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 25] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 26] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 27] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 28] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 29] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 30] >> 32ULL)]);
            __builtin_prefetch(&points[(point_schedule[point_it + 31] >> 32ULL)]);
        }
        // if buckets do not match then write schedule[point_it] into overflow
        uint64_t lhs_schedule = point_schedule[point_it];
        uint64_t rhs_schedule = point_schedule[point_it + 1];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t rhs_bucket = static_cast<size_t>(rhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        size_t rhs_point = static_cast<size_t>(rhs_schedule >> 32);
        bool has_overflow = overflow_exists.get(lhs_bucket);
        bool buckets_match = lhs_bucket == rhs_bucket;
        bool do_affine_add = buckets_match || has_overflow;

        const AffineElement* lhs_source = &points[lhs_point];
        const AffineElement* rhs_source = buckets_match ? &points[rhs_point] : &bucket_accumulators[lhs_bucket];

        overflow_exists.set(lhs_bucket, (has_overflow && buckets_match) || !do_affine_add);
        AffineElement* lhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it] : &bucket_accumulators[lhs_bucket];
        AffineElement* rhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it + 1] : &null_location[0];

        uint64_t source_bucket_destinations = affine_addition_output_bucket_destinations[affine_input_it >> 1];
        affine_addition_output_bucket_destinations[affine_input_it >> 1] =
            do_affine_add ? lhs_bucket : source_bucket_destinations;
        *lhs_destination = *lhs_source;
        *rhs_destination = *rhs_source;

        affine_input_it += static_cast<size_t>(do_affine_add) * 2;
        point_it += (1 + static_cast<size_t>(do_affine_add && buckets_match));
    }
    if (point_it == num_points - 1) {
        uint64_t lhs_schedule = point_schedule[point_it];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        bool has_overflow = overflow_exists.get(lhs_bucket);

        // if (!has_overflow) {
        //     std::cout << "end bucket location = " << lhs_bucket << std::endl;
        //     std::cout << "point index = " << lhs_point << std::endl;
        // }
        if (has_overflow) {
            affine_addition_scratch_space[affine_input_it] = points[lhs_point];
            affine_addition_scratch_space[affine_input_it + 1] = bucket_accumulators[lhs_bucket];
            overflow_exists.set(lhs_bucket, false);
            affine_addition_output_bucket_destinations[affine_input_it >> 1] = lhs_bucket;
            affine_input_it += 2;
            point_it += 1;
        } else {
            BB_ASSERT_LT(lhs_point, points.size());
            bucket_accumulators[lhs_bucket] = points[lhs_point];
            overflow_exists.set(lhs_bucket, true);
            point_it += 1;
        }
    }
    size_t num_affine_points_to_add = affine_input_it;
    if (num_affine_points_to_add >= 2) {
        add_affine_points<Curve>(&affine_addition_scratch_space[0], num_affine_points_to_add, &scalar_scratch_space[0]);
    }
    // std::cout << "CA4" << std::endl;
    // Populate new point scratch space with output
    G1* affine_output = &affine_addition_scratch_space[0] + (num_affine_points_to_add / 2);

    // Data structures that we need:

    // 1. We start with a point schedule that describes the points we need to add
    // 2. When we compute our affine additions we need a new output schedule that describes the new points we need
    // to add 3.
    size_t new_scratch_space_it = 0;
    size_t affine_output_it = 0;
    size_t num_affine_output_points = num_affine_points_to_add / 2;
    while ((affine_output_it < (num_affine_output_points - 1)) && (num_affine_output_points > 0)) {
        size_t lhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it]);
        size_t rhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it + 1]);
        BB_ASSERT_LT(lhs_bucket, overflow_exists.size());
        bool has_overflow = overflow_exists.get(lhs_bucket);

        bool buckets_match = (lhs_bucket == rhs_bucket);
        bool do_affine_add = buckets_match || has_overflow;
        BB_ASSERT_LT(new_scratch_space_it + 1, affine_addition_scratch_space.size());
        BB_ASSERT_LT(lhs_bucket, bucket_accumulators.size());
        BB_ASSERT_LT(new_scratch_space_it >> 1, output_point_schedule.size());
        AffineElement* lhs_source = &affine_output[affine_output_it];
        AffineElement* rhs_source =
            buckets_match ? &affine_output[affine_output_it + 1] : &bucket_accumulators[lhs_bucket];

        AffineElement* lhs_destination =
            do_affine_add ? &affine_addition_scratch_space[new_scratch_space_it] : &bucket_accumulators[lhs_bucket];
        AffineElement* rhs_destination =
            do_affine_add ? &affine_addition_scratch_space[new_scratch_space_it + 1] : &null_location[0];

        if (do_affine_add) {
            output_point_schedule[new_scratch_space_it >> 1] = lhs_bucket;
        }
        *lhs_destination = *lhs_source;
        *rhs_destination = *rhs_source;

        overflow_exists.set(lhs_bucket, (has_overflow && buckets_match) || !do_affine_add);
        new_scratch_space_it += static_cast<size_t>(do_affine_add) * 2;
        affine_output_it += (1 + static_cast<size_t>(do_affine_add && buckets_match));
    }
    if (affine_output_it == (num_affine_output_points - 1)) {

        size_t lhs_bucket = static_cast<size_t>(affine_addition_output_bucket_destinations[affine_output_it]);

        // bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
        // overflow_exists[lhs_bucket] = true;
        // affine_output_it += 1;
        BB_ASSERT_LT(lhs_bucket, overflow_exists.size());
        bool has_overflow = overflow_exists.get(lhs_bucket);
        if (has_overflow) {
            BB_ASSERT_LT(new_scratch_space_it + 1, affine_addition_scratch_space.size());
            BB_ASSERT_LT(lhs_bucket, bucket_accumulators.size());
            BB_ASSERT_LT(new_scratch_space_it >> 1, output_point_schedule.size());
            affine_addition_scratch_space[new_scratch_space_it] = affine_output[affine_output_it];
            affine_addition_scratch_space[new_scratch_space_it + 1] = bucket_accumulators[lhs_bucket];
            overflow_exists.set(lhs_bucket, false);
            output_point_schedule[new_scratch_space_it >> 1] = lhs_bucket;
            new_scratch_space_it += 2;
            affine_output_it += 1;
        } else {
            bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
            overflow_exists.set(lhs_bucket, true);
            affine_output_it += 1;
        }
    }
    if (point_it < num_points || new_scratch_space_it != 0) {
        consume_point_batch(point_schedule, points, affine_data, bucket_data, point_it, new_scratch_space_it);
    }
}

template <typename Curve>
std::vector<typename Curve::AffineElement> MSM<Curve>::batch_multi_scalar_mul(
    std::vector<std::span<const typename Curve::AffineElement>>& points, std::vector<std::span<ScalarField>>& scalars)
{
    ASSERT(points.size() == scalars.size());
    const size_t num_msms = points.size();

    std::vector<std::vector<uint32_t>> msm_scalar_indices;
    std::vector<ThreadWorkUnits> thread_work_units = get_work_units(scalars, msm_scalar_indices);
    const size_t num_cpus = get_num_cpus();

    std::vector<std::vector<std::pair<AffineElement, size_t>>> thread_msm_results(num_cpus);

    BB_ASSERT_EQ(thread_work_units.size(), num_cpus);

    parallel_for(num_cpus, [&](size_t thread_idx) {
        if (!thread_work_units[thread_idx].empty()) {
            const std::vector<MSMWorkUnitB>& msms = thread_work_units[thread_idx];
            std::vector<std::pair<AffineElement, size_t>>& msm_results = thread_msm_results[thread_idx];
            for (const MSMWorkUnitB& msm : msms) {
                std::span<const ScalarField> work_scalars = scalars[msm.batch_msm_index];
                std::span<const AffineElement> work_points = points[msm.batch_msm_index];
                std::span<const uint32_t> work_indices =
                    std::span<const uint32_t>{ &msm_scalar_indices[msm.batch_msm_index][msm.start_index], msm.size };

                std::vector<uint64_t> point_schedule(msm.size);
                MSMData msm_data(work_scalars, work_points, work_indices, std::span<uint64_t>(point_schedule));
                AffineElement msm_result = pippenger_low_memory_with_transformed_scalars(msm_data);

                msm_results.push_back(std::make_pair(msm_result, msm.batch_msm_index));
            }
        }
    });

    std::vector<Element> results(num_msms);
    for (Element& ele : results) {
        ele.self_set_infinity();
    }
    for (const auto& single_thread_msm_results : thread_msm_results) {
        for (const std::pair<AffineElement, size_t>& result : single_thread_msm_results) {
            results[result.second] += result.first;
        }
    }

    Element::batch_normalize(&results[0], num_msms);

    std::vector<AffineElement> affine_results;
    for (const auto& ele : results) {
        affine_results.emplace_back(AffineElement(ele.x, ele.y));
    }

    // put the scalars back the way we found them
    for (auto& msm_scalars : scalars) {
        parallel_for_range(msm_scalars.size(), [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                msm_scalars[i].self_to_montgomery_form();
            }
        });
    }
    return affine_results;
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const ScalarField> _scalars)
{
    if (_scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    BB_ASSERT_GTE(points.size(), _scalars.start_index + _scalars.size());

    // unfortnately we need to remove const on this data type to prevent duplicating _scalars (which is typically large)
    // We need to convert `_scalars` out of montgomery form for the MSM.
    // We then convert the scalars back into Montgomery form at the end of the algorithm.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    ScalarField* scalars = const_cast<ScalarField*>(&_scalars[_scalars.start_index]);

    std::vector<std::span<const AffineElement>> pp{ points.subspan(_scalars.start_index) };
    std::vector<std::span<ScalarField>> ss{ std::span<ScalarField>(scalars, _scalars.size()) };
    AffineElement result = batch_multi_scalar_mul(pp, ss)[0];
    return result;
}

template <typename Curve>
typename Curve::Element pippenger(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                  std::span<const typename Curve::AffineElement> points,
                                  [[maybe_unused]] bool handle_edge_cases)
{
    return MSM<Curve>::msm(points, scalars);
}

template <typename Curve>
typename Curve::Element pippenger_unsafe(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                         std::span<const typename Curve::AffineElement> points)
{
    return MSM<Curve>::msm(points, scalars);
}

template curve::Grumpkin::Element pippenger<curve::Grumpkin>(PolynomialSpan<const curve::Grumpkin::ScalarField> scalars,
                                                             std::span<const curve::Grumpkin::AffineElement> points,
                                                             bool handle_edge_cases = true);

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
