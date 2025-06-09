#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"

#include "./runtime_states.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication_new.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <ostream>

#include "./process_buckets.hpp"
#include "./runtime_states.hpp"
#include "./scalar_multiplication.hpp"

#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/groups/wnaf.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb::scalar_multiplication {

template <typename Curve>
std::vector<ThreadWorkUnits> MSM<Curve>::get_work_units(std::vector<std::span<FF>>& scalars,
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
    // size_t num_rounds = (254 + slice_size - 1) / slice_size;
    // size_t last_slice_size = 254 - ((num_rounds - 1) * slice_size);
    // eh later
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
    // The affine trick converts (N * lambda) / log(N) Jacobian additions into Affine additions, saving roughly 3 FF
    // muls i.e. (3 * N * lambda) / log(N) = saved FF ops The inversions cost ~ 384 * lambda FF ops
    // So! if (3 * N) / log(N) < 384, we should not use the affine trick
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
    // 2^16 / 16 * 256
    // 2^16 / (2^12) = 2^4
    // return ((num_points_f / log2_num_points_f) >= 128);
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::small_pippenger_low_memory_with_transformed_scalars(
    std::span<const typename Curve::ScalarField> scalars,
    std::span<const typename Curve::AffineElement> points,
    std::span<const uint32_t> nonzero_scalar_indices)
{
    const size_t size = nonzero_scalar_indices.size();
    const size_t bits_per_slice = get_log_num_buckets(size);
    const size_t num_buckets = 1 << bits_per_slice;
    JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;

    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_small_pippenger_round(
            scalars, points, nonzero_scalar_indices, i, bucket_data, round_output, bits_per_slice);
    }
    // for (size_t i = 0; i < nonzero_scalar_indices.size(); ++i) {
    //     BB_ASSERT_LT(nonzero_scalar_indices[i], scalars.size());
    //     scalars[nonzero_scalar_indices[i]].self_to_montgomery_form();
    // }
    return AffineElement(round_output);
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::pippenger_low_memory_with_transformed_scalars(
    std::span<const FF> scalars, std::span<const AffineElement> points, std::span<const uint32_t> scalar_indices)
{
    const size_t msm_size = scalar_indices.size();
    // if (!use_affine_trick(msm_size)) {
    // return small_pippenger_low_memory_with_transformed_scalars(scalars, points, scalar_indices);
    // }
    const size_t bits_per_slice = get_log_num_buckets(msm_size);
    const size_t num_buckets = 1 << bits_per_slice;
    AffineAdditionData affine_data = AffineAdditionData();
    BucketAccumulators bucket_data = BucketAccumulators(num_buckets);

    Element round_output = Curve::Group::point_at_infinity;

    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
    for (size_t i = 0; i < num_rounds; ++i) {
        round_output = evaluate_pippenger_round(
            scalars, points, scalar_indices, i, affine_data, bucket_data, round_output, bits_per_slice);
    }

    // for (size_t i = 0; i < scalar_indices.size(); ++i) {
    //     scalars[scalar_indices[i]].self_to_montgomery_form();
    // }
    return AffineElement(round_output);
}

template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_small_pippenger_round(
    std::span<const typename Curve::ScalarField> scalars,
    std::span<const typename Curve::AffineElement> points,
    std::span<const uint32_t> nonzero_scalar_indices,
    const size_t round_index,
    MSM<Curve>::JacobianBucketAccumulators& bucket_data,
    typename Curve::Element previous_round_output,
    const size_t bits_per_slice)
{
    // std::cout << "S_RS" << std::endl;
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
    // std::cout << "S_RE" << std::endl;

    result += round_output;
    return result;
}

template <typename Curve>
typename Curve::Element MSM<Curve>::evaluate_pippenger_round(std::span<const typename Curve::ScalarField> scalars,
                                                             std::span<const typename Curve::AffineElement> points,
                                                             std::span<const uint32_t> scalar_indices,
                                                             const size_t round_index,
                                                             MSM<Curve>::AffineAdditionData& affine_data,
                                                             MSM<Curve>::BucketAccumulators& bucket_data,
                                                             typename Curve::Element previous_round_output,
                                                             const size_t bits_per_slice)
{
    // std::cout << "SR" << std::endl;
    const size_t size = scalar_indices.size();
    std::vector<uint64_t> round_schedule(size);
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_LT(scalar_indices[i], scalars.size());
        round_schedule[i] = get_scalar_slice(scalars[scalar_indices[i]], round_index, bits_per_slice);

        round_schedule[i] += (static_cast<uint64_t>(scalar_indices[i]) << 32);
    }
    const size_t num_zero_entries = scalar_multiplication::process_buckets_count_zero_entries(
        &round_schedule[0], size, static_cast<uint32_t>(bits_per_slice));
    BB_ASSERT_LTE(num_zero_entries, size);
    const size_t round_size = size - num_zero_entries;

    // std::span<AffineElement> round_points(&points[num_zero_entries], round_size);

    Element round_output;
    round_output.self_set_infinity();
    // std::cout << "round size = " << round_size << std::endl;
    // if (num_zero_entries == round_size) {
    //     std::cout << "full zero" << std::endl;
    // }
    // ARGH. IF BUCKET INDEX = 256 WE THINK IT'S THE SAME AS BUCKET INDEX 0 WHAT WHAT WHAT
    // std::cout << "round size " << round_size << " numzero = " << num_zero_entries << std::endl;
    // for (size_t i = 0; i < num_zero_entries; ++i) {
    //     // if ((round_schedule[i] & 0xffffffff) != 0u) {
    //     //     std::cout << "idx i = " << i << std::endl;
    //     // }
    //     BB_ASSERT_EQ((round_schedule[i] & 0xffffffff), 0u);
    // }
    if (round_size > 0) {
        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        consume_point_batch(point_schedule, points, affine_data, bucket_data, 0, 0);

        // std::vector<Element> alt_buckets(bucket_data.buckets.size());
        // for (auto& x : alt_buckets) {
        //     x.self_set_infinity();
        // }
        // for (size_t i = 0; i < point_schedule.size(); ++i) {
        //     size_t bucket = point_schedule[i] & 0xffffffff;
        //     size_t point = (point_schedule[i] >> 32);
        //     alt_buckets[bucket] += points[point];
        // }
        // Element::batch_normalize(&alt_buckets[0], alt_buckets.size());

        // for (size_t i = 0; i < alt_buckets.size(); ++i) {
        //     BB_ASSERT_EQ(bucket_data.bucket_exists.get(i), !alt_buckets[i].is_point_at_infinity());

        //     if (bucket_data.bucket_exists.get(i)) {
        //         BB_ASSERT_EQ(bucket_data.buckets[i], AffineElement(alt_buckets[i].x, alt_buckets[i].y));
        //     }
        // }
        round_output = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();
    }
    // std::cout << "end consume " << std::endl;
    Element result = previous_round_output;
    const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
    size_t num_doublings = ((round_index == num_rounds - 1) && (NUM_BITS_IN_FIELD % bits_per_slice != 0))
                               ? NUM_BITS_IN_FIELD % bits_per_slice
                               : bits_per_slice;
    for (size_t i = 0; i < num_doublings; ++i) {
        result.self_dbl();
    }

    result += round_output;
    // std::cout << "SE" << std::endl;
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
        BB_ASSERT_LT(point_it + 1, point_schedule.size());
        uint64_t lhs_schedule = point_schedule[point_it];
        uint64_t rhs_schedule = point_schedule[point_it + 1];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t rhs_bucket = static_cast<size_t>(rhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        size_t rhs_point = static_cast<size_t>(rhs_schedule >> 32);
        BB_ASSERT_LT(lhs_bucket, overflow_exists.size());
        bool has_overflow = overflow_exists.get(lhs_bucket);
        bool buckets_match = lhs_bucket == rhs_bucket;
        bool do_affine_add = buckets_match || has_overflow;

        // if (num_points == 3) {
        //     std::cout << "point_it = " << point_it << std::endl;
        //     std::cout << "lhs bucket = " << lhs_bucket << std::endl;
        //     std::cout << "rhs bucket = " << rhs_bucket << std::endl;
        //     std::cout << "lhs point = " << lhs_point << std::endl;
        //     std::cout << "rhs point = " << rhs_point << std::endl;
        //     std::cout << "do_affine_add = " << do_affine_add << std::endl;
        // }

        BB_ASSERT_LT(lhs_point, points.size());
        // if (buckets_match) {
        BB_ASSERT_LT(rhs_point, points.size());
        //} else {
        BB_ASSERT_LT(lhs_bucket, bucket_accumulators.size());
        // }
        const AffineElement* lhs_source = &points[lhs_point];
        const AffineElement* rhs_source = buckets_match ? &points[rhs_point] : &bucket_accumulators[lhs_bucket];

        overflow_exists.set(lhs_bucket, (has_overflow && buckets_match) || !do_affine_add);
        AffineElement* lhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it] : &bucket_accumulators[lhs_bucket];
        AffineElement* rhs_destination =
            do_affine_add ? &affine_addition_scratch_space[affine_input_it + 1] : &null_location[0];

        // if (!do_affine_add) {
        //     std::cout << "bucket location = " << lhs_bucket << std::endl;
        //     std::cout << "point index = " << lhs_point << std::endl;
        // }
        BB_ASSERT_LT((affine_input_it >> 1), affine_addition_output_bucket_destinations.size());
        uint64_t source_bucket_destinations = affine_addition_output_bucket_destinations[affine_input_it >> 1];
        affine_addition_output_bucket_destinations[affine_input_it >> 1] =
            do_affine_add ? lhs_bucket : source_bucket_destinations;
        *lhs_destination = *lhs_source;
        *rhs_destination = *rhs_source;

        affine_input_it += static_cast<size_t>(do_affine_add) * 2;
        point_it += (1 + static_cast<size_t>(do_affine_add && buckets_match));
    }
    // std::cout << "CA2" << std::endl;
    if (point_it == num_points - 1) {
        uint64_t lhs_schedule = point_schedule[point_it];
        size_t lhs_bucket = static_cast<size_t>(lhs_schedule) & 0xFFFFFFFF;
        size_t lhs_point = static_cast<size_t>(lhs_schedule >> 32);
        BB_ASSERT_LT(lhs_bucket, overflow_exists.size());
        bool has_overflow = overflow_exists.get(lhs_bucket);

        // if (!has_overflow) {
        //     std::cout << "end bucket location = " << lhs_bucket << std::endl;
        //     std::cout << "point index = " << lhs_point << std::endl;
        // }
        if (has_overflow) {
            BB_ASSERT_LT(affine_input_it + 1, affine_addition_scratch_space.size());
            BB_ASSERT_LT(lhs_bucket, overflow_exists.size());
            BB_ASSERT_LT((affine_input_it >> 1), affine_addition_output_bucket_destinations.size());
            BB_ASSERT_LT(lhs_point, points.size());

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
    // std::cout << "CA3" << std::endl;
    size_t num_affine_points_to_add = affine_input_it;
    if (num_affine_points_to_add >= 2) {
        // std::cout << "add " << num_affine_points_to_add << std::endl;

        // std::vector<AffineElement> add_results;
        // for (size_t i = 0; i < num_affine_points_to_add / 2; ++i) {
        //     add_results.push_back(Element(affine_addition_scratch_space[i * 2]) +
        //                           Element(affine_addition_scratch_space[i * 2 + 1]));
        // }
        add_affine_points<Curve>(&affine_addition_scratch_space[0], num_affine_points_to_add, &scalar_scratch_space[0]);
        // for (size_t i = 0; i < num_affine_points_to_add / 2; ++i) {
        //     if (affine_addition_scratch_space[(num_affine_points_to_add / 2) + i] != add_results[i]) {
        //         std::cout << "failure at affine add i = " << i
        //                   << ", num_input_points_processed = " << num_input_points_processed
        //                   << " num queued affine = " << num_queued_affine_points << std::endl;
        //     }
        //     BB_ASSERT_EQ(add_results[i], affine_addition_scratch_space[(num_affine_points_to_add / 2) + i]);
        // }
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

        // Ok logical flow here:

        // If 2 affine outputs have the same bucket, write them into the scratch space
        // Else:
        // If an overflow exists, write it + affine into the scratch space
        // If an overflow does not exist, write into the overflow
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
        //         ASSERT(point_it != 10071);
        consume_point_batch(point_schedule, points, affine_data, bucket_data, point_it, new_scratch_space_it);
        // next go back to point input doodad
    }
}

template <typename Curve>
std::vector<typename Curve::AffineElement> MSM<Curve>::batch_multi_scalar_mul(
    std::vector<std::span<const typename Curve::AffineElement>>& points, std::vector<MSM<Curve>::ScalarSpan>& scalars)
{
    std::vector<std::vector<uint32_t>> msm_scalar_indices;
    std::vector<ThreadWorkUnits> thread_work_units = get_work_units(scalars, msm_scalar_indices);
    const size_t num_cpus = get_num_cpus();

    std::vector<std::vector<std::pair<AffineElement, size_t>>> thread_msm_results(num_cpus);

    parallel_for(num_cpus, [&](size_t thread_idx) {
        if (thread_idx < thread_work_units.size()) {
            if (!thread_work_units[thread_idx].empty()) {
                const std::vector<MSMWorkUnitB>& msms = thread_work_units[thread_idx];
                std::vector<std::pair<AffineElement, size_t>>& msm_results = thread_msm_results[thread_idx];
                for (const MSMWorkUnitB& msm : msms) {
                    std::span<const FF> work_scalars = scalars[msm.batch_msm_index];
                    std::span<const AffineElement> work_points = points[msm.batch_msm_index];
                    std::span<const uint32_t> work_indices =
                        std::span<const uint32_t>{ &msm_scalar_indices[msm.batch_msm_index][msm.start_index],
                                                   msm.size };

                    Element expected;
                    expected.self_set_infinity();
                    for (size_t j = 0; j < work_indices.size(); ++j) {
                        expected += (work_points[work_indices[j]] * work_scalars[work_indices[j]].to_montgomery_form());
                    }
                    AffineElement to_compare(expected);
                    AffineElement msm_result =
                        pippenger_low_memory_with_transformed_scalars(work_scalars, work_points, work_indices);

                    BB_ASSERT_EQ(to_compare, msm_result);
                    msm_results.push_back(std::make_pair(msm_result, msm.batch_msm_index));
                }
            }
        }
    });

    ASSERT(points.size() == scalars.size());
    std::vector<Element> results(points.size());
    for (Element& ele : results) {
        ele.self_set_infinity();
    }
    for (const auto& single_thread_msm_results : thread_msm_results) {
        for (const std::pair<AffineElement, size_t>& result : single_thread_msm_results) {
            results[result.second] += result.first;
        }
    }

    Element::batch_normalize(&results[0], results.size());

    std::vector<AffineElement> affine_results;
    for (const auto& ele : results) {
        affine_results.emplace_back(AffineElement(ele.x, ele.y));
    }

    // N.B. make multithreaded again
    for (auto& scalar_v : scalars) {
        for (auto& s : scalar_v) {
            s.self_to_montgomery_form();
        }
    }
    return affine_results;
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const FF> _scalars)
{
    if (_scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    BB_ASSERT_GTE(points.size(), _scalars.start_index + _scalars.size());
    // static scalar_multiplication::pippenger_runtime_state<Curve> pippenger_runtime_state(
    //     numeric::round_up_power_2(16000000u));

    // std::vector<AffineElement> points2(_scalars.size());
    // bb::scalar_multiplication::generate_pippenger_point_table<Curve>(
    //     points.data(), points2.data(), _scalars.start_index + _scalars.size());

    // // std::vector<AffineElement> endo_points(points.size() * 2);
    // // for (size_t i = 0; i < points.size(); ++i) {
    // //     endo_points[i] = points[i];
    // // }
    // // scalar_multiplication::generate_pippenger_point_table<Curve>(points.data(), endo_points.data(),
    // points.size()); std::cout << "making runtime state " << std::endl; std::cout << "calling pippenger?" <<
    // std::endl; std::cout << "sc size = " << _scalars.size() << std::endl; std::cout << "pt size = " <<
    // points.size()
    // << std::endl; AffineElement test = bb::scalar_multiplication::pippenger<Curve>(_scalars, points2,
    // pippenger_runtime_state); std::cout << "pipp?" << std::endl; we'll leave it the way we found it, promise
    FF* scalars = (FF*)(&_scalars[_scalars.start_index]);

    std::vector<std::span<const AffineElement>> pp{ points.subspan(_scalars.start_index) };
    std::vector<std::span<FF>> ss{ std::span<FF>(scalars, _scalars.size()) };
    AffineElement result = batch_multi_scalar_mul(pp, ss)[0];
    // BB_ASSERT_EQ(test, result);
    return result;
}

} // namespace bb::scalar_multiplication

template class bb::scalar_multiplication::MSM<bb::curve::Grumpkin>;
template class bb::scalar_multiplication::MSM<bb::curve::BN254>;
