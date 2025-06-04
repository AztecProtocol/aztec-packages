#pragma once
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"

#include "./runtime_states.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
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

#include "./bitvector.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/groups/wnaf.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb::scalar_multiplication {
template <bool Multithread>
void conditional_parallel_for(size_t num_iterations, const std::function<void(size_t)>& func)
{
    if constexpr (Multithread) {
        parallel_for(num_iterations, func);
    } else {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
    }
}

template <bool Debug, size_t DebugNumThreads> size_t conditional_calculate_num_threads(size_t size, size_t min)
{
    if constexpr (!Debug) {
        return calculate_num_threads(size, min);
    }
    return DebugNumThreads;
}

template <bool Debug, size_t DebugNumThreads> size_t conditional_get_num_cpus()
{
    if constexpr (!Debug) {
        return get_num_cpus();
    }
    return DebugNumThreads;
}

template <typename FF> std::vector<uint32_t> get_nonzero_scalar_indices(std::span<FF> scalars)
{
    const size_t num_cpus = get_num_cpus();

    const size_t scalars_per_thread = (scalars.size() + num_cpus - 1) / num_cpus;

    std::vector<std::vector<uint32_t>> thread_indices(num_cpus);
    parallel_for(num_cpus, [&](size_t thread_idx) {
        const size_t start = thread_idx * scalars_per_thread;
        const size_t end =
            (thread_idx == scalars_per_thread - 1) ? scalars.size() : (thread_idx + 1) * scalars_per_thread;
        thread_indices[thread_idx].reserve(end - start);
        std::vector<uint32_t>& thread_scalar_indices = thread_indices[thread_idx];
        for (size_t i = start; i < end; ++i) {
            auto& scalar = scalars[start];
            scalar.self_from_montgomery_form();
            bool is_zero =
                (scalar.data[0] == 0) && (scalar.data[1] == 0) && (scalar.data[2] == 0) && (scalar.data[3] == 0);
            if (!is_zero) {
                thread_scalar_indices.push_back(i);
            }
        }
    });

    std::vector<uint32_t> consolidated_indices;
    consolidated_indices.resize(scalars.size());

    parallel_for(num_cpus, [&](size_t thread_idx) {
        size_t offset = 0;
        for (size_t i = 0; i < num_cpus; ++i) {
            offset += thread_indices[i].size();
        }
        std::copy(thread_indices[thread_idx].begin(), thread_indices[thread_idx].end(), &consolidated_indices[offset]);
    });

    return consolidated_indices;
}
// use conditional_parallel_for for testing???
// use debug_num_threads
template <typename Curve, bool Debug, size_t DebugNumThreads> struct MSM {
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;
    using AffineElement = typename Curve::AffineElement;

    using ScalarSpan = std::span<ScalarField>;
    using FF = ScalarField;
    using G1 = AffineElement;
    static constexpr size_t NUM_BITS_IN_FIELD = FF::modulus.get_msb() + 1;

    /**
     * @brief MSMWorkUnit describes an MSM that may be part of a larger MSM
     * @details For a multi-MSM where each MSM has a variable size, we want to split the MSMs up
     *          such that every available thread has an equal amount of MSM work to perform.
     *          The actual MSM algorithm used is single-threaded. This is beneficial because we get better scaling.
     *
     */
    struct MSMWorkUnit {
        size_t batch_msm_index;
        size_t num_nonzero_muls;
        ScalarSpan scalars;
        std::span<const AffineElement> points;
    };

    struct PolynomialMetaData {
        std::vector<bool> empty_row;
        size_t size_including_zeroes;
        size_t size;
        size_t block_size;
        std::vector<size_t> block_counts;

        size_t get_start_index(size_t non_zero_offset) const
        {
            // std::cout << "calling get index at " << non_zero_offset << std::endl;
            // trying to find "50" but it can't?
            // std::cout << "calling get start index on metadata block with size " << size << std::endl;
            size_t running_sum = 0;
            size_t start_index = static_cast<size_t>(-1);
            for (size_t i = 0; i < block_counts.size(); ++i) {
                if (running_sum + block_counts[i] > non_zero_offset) {
                    const size_t start = i * block_size;
                    const size_t end = (i == block_counts.size() - 1) ? size_including_zeroes : (i + 1) * block_size;
                    // std::cout << "searching for index in block w. start = " << start << " end = " << end <<
                    // std::endl;
                    // bool found = false;
                    for (size_t j = start; j < end; ++j) {
                        if (running_sum == non_zero_offset && !empty_row[j]) {
                            start_index = j;
                            // found = true;
                            break;
                            // jackpot
                        }
                        running_sum += static_cast<size_t>(!empty_row[j]);
                    }
                    // if ((running_sum == non_zero_offset) && !found && (i < block_counts.size())) {
                    //     const size_t start = (i + 1) * block_size;
                    //     const size_t end =
                    //         ((i + 1) == block_counts.size() - 1) ? size_including_zeroes : (i + 2) * block_size;
                    //     for (size_t j = start; j < end; ++j) {
                    //         if (!empty_row[j]) {
                    //             // std::cout << "found start index " << j << std::endl;
                    //             start_index = j;
                    //             break;
                    //         }
                    //     }
                    //     // search in next block for non zero row
                    // }
                    break;
                }
                running_sum += block_counts[i];
            }
            if (start_index == static_cast<size_t>(-1)) {
                // std::cout << "err start_index == -1" << std::endl;
                // std::cout << "original start = " << non_zero_offset << std::endl;
                start_index = 0;
            }
            // std::cout << "returning index " << start_index << std::endl;
            return start_index;
        }

        size_t get_end_index(size_t non_zero_offset) const
        {
            // std::cout << "calling get index at " << non_zero_offset << std::endl;
            size_t running_sum = 0;
            size_t end_index = static_cast<size_t>(-1);
            for (size_t i = 0; i < block_counts.size(); ++i) {
                if (running_sum + block_counts[i] >= non_zero_offset) {
                    const size_t start = i * block_size;
                    const size_t end = (i == block_counts.size() - 1) ? size_including_zeroes : (i + 1) * block_size;
                    bool found = false;
                    for (size_t j = start; j < end; ++j) {
                        if (running_sum == non_zero_offset) {
                            end_index = j;
                            found = true;
                            break;
                            // jackpot
                        }
                        running_sum += static_cast<size_t>(!empty_row[j]);
                    }
                    if (running_sum == non_zero_offset && !found) {
                        end_index = end;
                    }
                    break;
                }
                running_sum += block_counts[i];
            }
            if (end_index == static_cast<size_t>(-1)) {
                end_index = size_including_zeroes;
            }
            // std::cout << "returning index " << end_index << std::endl;
            return end_index;
        }
    };

    static PolynomialMetaData transform_polynomial_and_get_metadata(ScalarSpan scalars)
    {

        PolynomialMetaData result{ .empty_row = std::vector<bool>(scalars.size()),
                                   .size_including_zeroes = scalars.size(),
                                   .size = 0,
                                   .block_size = 0,
                                   .block_counts = std::vector<size_t>() };

        const size_t num_threads = conditional_calculate_num_threads<Debug, DebugNumThreads>(scalars.size(), 256);
        const size_t block_size = scalars.size() / num_threads;
        std::vector<size_t> block_counts(num_threads);
        conditional_parallel_for<!Debug>(num_threads, [&](size_t thread_idx) {
            size_t block_count = 0;
            size_t start = thread_idx * block_size;
            size_t end = (thread_idx == num_threads - 1) ? scalars.size() : (thread_idx + 1) * block_size;
            for (size_t i = start; i < end; ++i) {
                result.empty_row[i] = scalars[i].is_zero();
                // TODO: nasty fix
                const ScalarField* k = &scalars[i];
                ScalarField* q = (ScalarField*)k;
                ((*q).self_from_montgomery_form());
                block_count += static_cast<size_t>(!result.empty_row[i]);
            }
            block_counts[thread_idx] = block_count;
        });
        result.block_size = block_size;
        result.block_counts = block_counts;
        size_t total_size = 0;
        for (const auto size : block_counts) {
            total_size += size;
        }
        result.size = total_size;
        return result;
    }

    void normalize_polynomial(ScalarSpan scalars)
    {
        const size_t num_threads = conditional_calculate_num_threads<Debug, DebugNumThreads>(scalars.size(), 256);
        const size_t thread_size = scalars.size() / num_threads;
        std::vector<size_t> thread_counts(num_threads);
        conditional_parallel_for<!Debug>(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * thread_size;
            size_t end = (thread_idx == num_threads - 1) ? scalars.size() : (thread_idx + 1) * thread_size;
            for (size_t i = start; i < end; ++i) {
                (scalars[i].self_to_montgomery_form());
            }
        });
    }

    size_t get_work_unit(size_t msm_size)
    {
        const size_t log2_size = numeric::get_msb(msm_size);
        const size_t work_estimate = (msm_size + log2_size - 1) / msm_size;
        return work_estimate;
    }

    struct MSMWorkItem {
        size_t batch_msm_index;
        ScalarSpan scalars;
        std::span<const AffineElement> points;
        size_t non_zero_row_offset;
        size_t non_zero_row_size;
    };

    static std::vector<std::vector<MSMWorkUnit>> compute_batch_msm_work_units(
        std::vector<ScalarSpan> batch_scalars, std::vector<std::span<const AffineElement>> batch_points)
    {
        // std::cout << "INSIDE COMPPUTE BATCH MSM WORK UNITS " << std::endl;
        const size_t num_msms = batch_scalars.size();
        std::vector<PolynomialMetaData> polynomial_metadata(num_msms);
        for (size_t i = 0; i < num_msms; ++i) {
            polynomial_metadata[i] = transform_polynomial_and_get_metadata(batch_scalars[i]);
            // std::cout << "metadata size incl zeroes" << polynomial_metadata[i].size_including_zeroes << std::endl;
            // std::cout << "metadata size w/o zeroes" << polynomial_metadata[i].size << std::endl;
        }

        size_t total_work = 0;
        for (size_t i = 0; i < num_msms; ++i) {
            total_work += polynomial_metadata[i].size; // get_work_unit(polynomial_metadata[i].size);
        }

        const size_t num_cpus = conditional_get_num_cpus<Debug, DebugNumThreads>();

        const size_t work_per_cpu = (total_work + (num_cpus - 1)) / num_cpus;

        // std::cout << "work per cpu = " << work_per_cpu << std::endl;
        std::vector<std::vector<MSMWorkItem>> thread_work_units;

        size_t msm_iterator = 0;
        size_t work_remaining_in_msm = 0; // get_work_unit(polynomial_metadata[0].size);
        size_t msm_offset = 0;

        bool found = false;
        size_t msm_start_index = 0;
        while (!found && msm_start_index < polynomial_metadata.size()) {
            if (polynomial_metadata[msm_start_index].size > 0) {
                work_remaining_in_msm = polynomial_metadata[msm_start_index].size;
                found = true;
                break;
            }
            msm_start_index++;
        }
        if (!found) {
            // polynomial is all zeroes!
            // std::cout << "empty" << std::endl;
            return std::vector<std::vector<MSMWorkUnit>>();
        }
        // std::cout << "original work remaining = " << work_remaining_in_msm << std::endl;
        // static size_t counter = 0;
        // counter++;
        for (size_t i = 0; i < num_cpus; ++i) {
            thread_work_units.push_back(std::vector<MSMWorkItem>());
            size_t work_remaining_for_cpu = work_per_cpu;
            // std::cout << "a" << std::endl;
            // if (counter == 2) {
            //     std::cout << "work remaining for cpu = " << work_remaining_for_cpu << std::endl;
            //     std::cout << "msm iterator = " << msm_iterator << std::endl;
            //     std::cout << "work remaining in msm = " << work_remaining_in_msm << std::endl;
            // }
            while (work_remaining_for_cpu > 0 && (msm_iterator != batch_scalars.size())) {
                if (work_remaining_in_msm > work_remaining_for_cpu) {
                    const size_t msm_size = work_remaining_for_cpu;

                    MSMWorkItem work{ .batch_msm_index = msm_iterator,
                                      .scalars = batch_scalars[msm_iterator],
                                      .points = batch_points[msm_iterator],
                                      .non_zero_row_offset = msm_offset,
                                      .non_zero_row_size = msm_size };
                    thread_work_units[i].emplace_back(work);
                    work_remaining_in_msm -= work_remaining_for_cpu;
                    work_remaining_for_cpu = 0;
                    msm_offset += msm_size;
                    // std::cout << "msm larger than cpu" << std::endl;
                    // std::cout << "cpu idx = " << i << std::endl;
                    // std::cout << "msm size = " << msm_size << std::endl;
                    // std::cout << "new work in msm = " << work_remaining_in_msm << std::endl;
                } else {

                    MSMWorkItem work{ .batch_msm_index = msm_iterator,
                                      .scalars = batch_scalars[msm_iterator],
                                      .points = batch_points[msm_iterator],
                                      .non_zero_row_offset = msm_offset,
                                      .non_zero_row_size = work_remaining_in_msm };
                    thread_work_units[i].emplace_back(work);
                    work_remaining_for_cpu -= work_remaining_in_msm;
                    // std::cout << "old cpu work " << work_remaining_for_cpu << std::endl;
                    // std::cout << "work remaining in msm = " << work_remaining_in_msm << std::endl;
                    // std::cout << "new cpu work " << work_remaining_for_cpu << std::endl;
                    msm_iterator++;

                    work_remaining_in_msm = msm_iterator == (num_msms) ? 0 : polynomial_metadata[msm_iterator].size;
                    msm_offset = 0;
                }
            }
            // std::cout << "b" << std::endl;
        }
        bool check =
            (((msm_iterator == batch_scalars.size() - 1)) || (msm_iterator == batch_scalars.size() && msm_offset == 0));
        if (!check) {
            std::cout << "batch scalars size = " << batch_scalars.size() << std::endl;
            std::cout << "msm iterator = " << msm_iterator << std::endl;
            std::cout << "msm offset = " << msm_offset << std::endl;
        }
        ASSERT(((msm_iterator == batch_scalars.size() - 1)) ||
               (msm_iterator == batch_scalars.size() && msm_offset == 0));
        ASSERT(work_remaining_in_msm == 0);
        // todo check last work item ends at end of final msm

        std::vector<std::vector<MSMWorkUnit>> thread_msms;
        // size_t count = 0;
        // std::cout << "BATCH POINTS SIZE = " << batch_points.size() << std::endl;
        // for (const auto& x : batch_points) {
        //     std::cout << "INNER BATCH SIZE = " << x.size() << std::endl;
        // }
        // for (const auto& x : batch_points[0]) {
        //     std::cout << "BATCH POINT " << x << std::endl;
        // }
        // throw("aa");
        // size_t count = 0;
        for (const auto& thread_work_items : thread_work_units) {
            thread_msms.push_back(std::vector<MSMWorkUnit>());
            for (const MSMWorkItem work_item : thread_work_items) {
                const size_t msm_index = work_item.batch_msm_index;
                const PolynomialMetaData& metadata = polynomial_metadata[msm_index];

                // if (count == 0) {
                // std::cout << "metadata block counts" << std::endl;
                // for (auto m : metadata.block_counts) {
                //     // std::cout << m << std::endl;
                // }
                // std::cout << "end" << std::endl;
                // count++;
                // }
                size_t start_index = metadata.get_start_index(work_item.non_zero_row_offset);
                size_t end_index = metadata.get_end_index(work_item.non_zero_row_offset + work_item.non_zero_row_size);

                // if (end_index < start_index) {
                //     // std::cout << "work_item.non_zero_row_offset = " << work_item.non_zero_row_offset << std::endl;
                //     // std::cout << "work_item.non_zero_row_size = " << work_item.non_zero_row_size << std::endl;
                //     // std::cout << "scalars size = " << work_item.scalars.size() << std::endl;
                //     // std::cout << "points size = " << work_item.points.size() << std::endl;
                //     // std::cout << "count = " << count << std::endl;
                //     // std::cout << "start idx = " << start_index << std::endl;
                //     // std::cout << "end idx = " << end_index << std::endl;
                //     // std::cout << "err end idx > start idx?" << std::endl;
                // }
                // if (end_index == start_index) {
                //     // std::cout << "err work item size 0?" << std::endl;
                // }
                // count++;
                ASSERT(end_index < 10000000);
                ASSERT(end_index >= start_index);

                // non zero row size is 49
                // std::cout << "work item MSM SIZE " << work_item.non_zero_row_size << std::endl;
                // std::cout << "non zero row orrset =  " << work_item.non_zero_row_offset << std::endl;
                ScalarField* start = &batch_scalars[msm_index].data()[start_index];
                std::span<ScalarField> work_scalars(start, end_index - start_index);
                // std::cout << "SPAN SIZE? " << (end_index - start_index) << std::endl;
                std::span<const AffineElement> work_points(&batch_points[msm_index].data()[start_index],
                                                           end_index - start_index);
                thread_msms[thread_msms.size() - 1].emplace_back(
                    MSMWorkUnit{ .batch_msm_index = msm_index,
                                 .num_nonzero_muls = work_item.non_zero_row_size,
                                 .scalars = work_scalars,
                                 .points = work_points });
            }
        }
        return thread_msms;
    }

    // Element pippenger_unsafe(ScalarSpan scalars, std::span<const AffineElement>
    // points) {}

    static uint32_t get_scalar_slice(const FF& scalar, size_t round, size_t normal_slice_size)
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

        size_t lo_slice = (scalar.data[start_limb] >> lo_slice_offset) & ((1 << lo_slice_bits) - 1);
        size_t hi_slice = (scalar.data[end_limb] & ((1 << hi_slice_bits) - 1));

        uint32_t lo = static_cast<uint32_t>(lo_slice);
        uint32_t hi = static_cast<uint32_t>(hi_slice);

        uint32_t result = lo + (hi << lo_slice_bits);
        return result;
    }

    static constexpr size_t get_log_num_buckets(const size_t num_points)
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

    struct BucketAccumulators {
        std::vector<AffineElement> buckets;
        BitVector bucket_exists;

        BucketAccumulators(size_t num_buckets)
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };

    struct JacobianBucketAccumulators {
        std::vector<Element> buckets;
        BitVector bucket_exists;

        JacobianBucketAccumulators(size_t num_buckets)
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };
    struct AffineAdditionData {
        static constexpr size_t BATCH_SIZE = 10000;
        std::vector<AffineElement> points_to_add;
        std::vector<BaseField> scalar_scratch_space;
        std::vector<uint64_t> addition_result_bucket_destinations;

        AffineAdditionData()
            : points_to_add(BATCH_SIZE + 1)
            , scalar_scratch_space(BATCH_SIZE + 1)
            , addition_result_bucket_destinations((BATCH_SIZE / 2) + 1)
        {}
    };

    static bool use_affine_trick(size_t num_points)
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
        double num_points_f = static_cast<double>(num_points);
        double log2_num_points_f = log2(num_points_f);

        return ((num_points_f / log2_num_points_f) >= 128);
    }

    static AffineElement pippenger_low_memory(std::span<FF> scalars, std::span<const AffineElement> points)
    {
        // std::cout << "pippenger low memory a" << std::endl;
        for (FF& scalar : scalars) {
            scalar.self_from_montgomery_form();
        }
        // std::cout << "pippenger low memory b" << std::endl;

        return pippenger_low_memory_with_transformed_scalars(scalars, points, scalars.size());
    }

    static AffineElement small_pippenger_low_memory_with_transformed_scalars(std::span<FF> scalars,
                                                                             std::span<const AffineElement> points)
    {
        const size_t bits_per_slice = get_log_num_buckets(scalars.size());
        const size_t num_buckets = 1 << bits_per_slice;
        JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
        Element round_output = Curve::Group::point_at_infinity;

        const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;

        for (size_t i = 0; i < num_rounds; ++i) {
            // std::cout << "round " << i << std::endl;
            round_output = evaluate_small_pippenger_round(
                scalars, points, scalars.size(), i, bucket_data, round_output, bits_per_slice);
        }
        for (FF& scalar : scalars) {
            scalar.self_to_montgomery_form();
        }
        // std::cout << "returning affine result: " << round_output << std::endl;
        return AffineElement(round_output);
    }

    static AffineElement pippenger_low_memory_with_transformed_scalars(std::span<FF> scalars,
                                                                       std::span<const AffineElement> points,
                                                                       size_t num_nonzero_muls)
    {
        // std::cout << "init?" << std::endl;
        if (!use_affine_trick(num_nonzero_muls)) {
            return small_pippenger_low_memory_with_transformed_scalars(scalars, points);
        }
        // std::cout << "USING AFFINE TRICK, SIZE = " << scalars.size() << std::endl;
        const size_t bits_per_slice = get_log_num_buckets(scalars.size());
        const size_t num_buckets = 1 << bits_per_slice;
        AffineAdditionData affine_data = AffineAdditionData();
        BucketAccumulators bucket_data = BucketAccumulators(num_buckets);

        Element round_output = Curve::Group::point_at_infinity;

        const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
        // std::cout << "num points = " << points.size() << std::endl;
        // std::cout << "num scalars " << scalars.size() << std::endl;
        // if (points.size() == 1) {
        //     std::cout << "THE POINT BEING ADDED... " << points[0] << std::endl;
        // }
        // std::cout << "round satrt" << std::endl;
        for (size_t i = 0; i < num_rounds; ++i) {
            // std::cout << "round " << i << std::endl;
            round_output = evaluate_pippenger_round(
                scalars, points, scalars.size(), i, affine_data, bucket_data, round_output, bits_per_slice);
        }
        // std::cout << "round end" << std::endl;
        // std::cout << "done with round" << std::endl;
        // std::cout << "converting to mont form" << std::endl;

        for (FF& scalar : scalars) {
            scalar.self_to_montgomery_form();
        }
        // std::cout << "pippenger returning affine result: " << round_output << std::endl;
        return AffineElement(round_output);
    }

    static Element evaluate_small_pippenger_round(std::span<FF> scalars,
                                                  std::span<const AffineElement> points,
                                                  const size_t size,
                                                  const size_t round_index,
                                                  JacobianBucketAccumulators& bucket_data,
                                                  Element previous_round_output,
                                                  const size_t bits_per_slice)
    {
        std::vector<uint64_t> round_schedule(size);
        for (size_t i = 0; i < size; ++i) {
            uint32_t bucket_index = get_scalar_slice(scalars[i], round_index, bits_per_slice);
            ASSERT(bucket_index < (1 << bits_per_slice));
            if (bucket_index > 0) {
                // do this check because we do not reset bucket_data.buckets after each round
                // (i.e. not neccessarily at infinity)
                if (bucket_data.bucket_exists.get(bucket_index)) {
                    bucket_data.buckets[bucket_index] += points[i];
                } else {
                    bucket_data.buckets[bucket_index] = points[i];
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
        // std::cout << "round output(is infinity = " << round_output.is_point_at_infinity() << ") = " << round_output
        //   << std::endl;

        result += round_output;
        // std::cout << "result after round " << round_index << " = " << result << std::endl;
        return result;
    }

    static Element evaluate_pippenger_round(std::span<FF> scalars,
                                            std::span<const AffineElement> points,
                                            const size_t size,
                                            const size_t round_index,
                                            AffineAdditionData& affine_data,
                                            BucketAccumulators& bucket_data,
                                            Element previous_round_output,
                                            const size_t bits_per_slice)
    {
        std::vector<uint64_t> round_schedule(size);

        for (size_t i = 0; i < size; ++i) {
            round_schedule[i] = get_scalar_slice(scalars[i], round_index, bits_per_slice);
            round_schedule[i] += (static_cast<uint64_t>(i) << 32);
        }

        const size_t num_zero_entries = scalar_multiplication::process_buckets_count_zero_entries(
            &round_schedule[0], size, static_cast<uint32_t>(bits_per_slice));

        const size_t round_size = size - num_zero_entries;

        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        // std::span<AffineElement> round_points(&points[num_zero_entries], round_size);

        Element round_output;
        round_output.self_set_infinity();
        // std::cout << "round size = " << round_size << std::endl;
        if (round_size > 0) {

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
        // std::cout << "round output(is infinity = " << round_output.is_point_at_infinity() << ") = " << round_output
        //   << std::endl;

        result += round_output;
        // std::cout << "result after round " << round_index << " = " << result << std::endl;
        return result;
    }
    // 0x1c8810d5b442d7cd4c56dd7698e232275693cd65bf80a4cc576589b0f6b2b949
    // void pippenger_low_memory(FF* scalars, G1* points, size_t size)
    // {

    //     size_t round_index = 0;
    //     std::vector<uint64_t> round_schedule(size);
    //     constexpr size_t bits_per_slice = get_slice_size();

    //     size_t it = 0;
    //     for (size_t i = 0; i < size; ++i) {
    //         round_schedule[it] = get_scalar_slice(scalars[i], round_index, bits_per_slice);
    //         it += static_cast<size_t>(round_schedule[it] > 0);
    //         round_schedule[it] += (i << 32);
    //     }

    //     size_t num_nonzero_entries = it;

    //     // todo give better name this is just radix sort
    //     scalar_multiplication::process_buckets(&round_schedule[0], num_nonzero_entries, bits_per_slice);

    //     constexpr size_t num_buckets = 1 << bits_per_slice;
    //     std::cout << num_buckets << std::endl;
    // }

    // struct BucketData {
    //     Element* buckets;
    //     bool* is_jacobian;
    //     bool* is_not_infinity;
    // };

    /*

    let's say we have a big vector of points to add:

    []
    ||
    ||
    ||
    ||
    ||
    []

    we iterate over K points and several things are happening...

    1. we are populating an outlier data structure with points that we can't affine add
    2. we are populating an affine add data structure with points we can add pairwise

    We should probably perform this step until the affine add data structure is full. THEN we add.

    After we add, we reduce - we iterate over the output and the input overflow space and populate a new input +
    overflow space.

    After this, instead of reducing again, we go BACK to the point schedule to fill up the rest of the affine add data
    structure.

    What data structures do we need to make this work?

    The input overflow space will need to be equal to the number of buckets
    The output overflow space will need to be equal to the number of buckets
    It would be useful if we had a result space as well


    Say we have input[i].bucket  . we check if overflow[input[i].bucket] exists
    if overflow[input[i].bucket] does NOT exist then we check input[i+1].bucket
    if input[i+1].bucket does NOT exist then we check point_schedule[point_it].bucket
    Now we have two points to compare and we can either...
    1. if they match, write both into the affine set
    2. if they do not match, write the input[i] point into the overflow set and advance the iterator (either into
    input[i+1] or point_schedule)
    3. over time the overflow set will become populated with lone bucket points, which is exactly what we want

    the PROBLEM with this approach is that, if a match exists, we are writing TWO points
    if a match does NOT exist, we are writing ONE point
    but dud matches are RARE, so we can do a dummy move
    */

    static void consume_point_batch(std::span<uint64_t> point_schedule,
                                    std::span<const AffineElement> points,
                                    AffineAdditionData& affine_data,
                                    BucketAccumulators& bucket_data,
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
        while (((affine_input_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < (num_points - 1))) {

            if (point_it < (num_points - 32) && ((point_it & 0x0f) == 0)) {
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
            const AffineElement* lhs_source = &points[lhs_point];
            const AffineElement* rhs_source = buckets_match ? &points[rhs_point] : &bucket_accumulators[lhs_bucket];

            bool do_affine_add = buckets_match || has_overflow;
            overflow_exists.set(lhs_bucket, (has_overflow && buckets_match) || !do_affine_add);
            AffineElement* lhs_destination =
                do_affine_add ? &affine_addition_scratch_space[affine_input_it] : &bucket_accumulators[lhs_bucket];
            AffineElement* rhs_destination =
                do_affine_add ? &affine_addition_scratch_space[affine_input_it + 1] : &null_location[0];

            // if (!do_affine_add) {
            //     std::cout << "bucket location = " << lhs_bucket << std::endl;
            //     std::cout << "point index = " << lhs_point << std::endl;
            // }
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
                bucket_accumulators[lhs_bucket] = points[lhs_point];
                overflow_exists.set(lhs_bucket, true);
                point_it += 1;
            }
        }

        size_t num_affine_points_to_add = affine_input_it;
        if (num_affine_points_to_add >= 2) {
            add_affine_points<Curve>(
                &affine_addition_scratch_space[0], num_affine_points_to_add, &scalar_scratch_space[0]);
        }
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
            size_t lhs_bucket = affine_addition_output_bucket_destinations[affine_output_it];
            size_t rhs_bucket = affine_addition_output_bucket_destinations[affine_output_it + 1];
            bool has_overflow = overflow_exists.get(lhs_bucket);

            bool buckets_match = (lhs_bucket == rhs_bucket);
            bool do_affine_add = buckets_match || has_overflow;

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
            // if (has_overflow) {

            //     affine_addition_scratch_space[new_scratch_space_it] = affine_output[affine_output_it];
            //     affine_addition_scratch_space[new_scratch_space_it + 1] = bucket_accumulators[lhs_bucket];
            //     output_point_schedule[new_scratch_space_it >> 1] = lhs_bucket;
            //     overflow_exists[lhs_bucket] = false;
            //     new_scratch_space_it += 2;
            //     affine_output_it += 1;
            // } else if (affine_output_it == (num_affine_output_points)-1) {

            //     bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
            //     overflow_exists[lhs_bucket] = true;
            //     affine_output_it += 1;
            // } else {
            //     size_t rhs_bucket = output_point_schedule[affine_output_it + 1];
            //     if (lhs_bucket == rhs_bucket) {
            //         affine_addition_scratch_space[new_scratch_space_it] = affine_output[affine_output_it];
            //         affine_addition_scratch_space[new_scratch_space_it + 1] = affine_output[affine_output_it + 1];
            //         output_point_schedule[new_scratch_space_it >> 1] = lhs_bucket;
            //         new_scratch_space_it += 2;
            //         affine_output_it += 2;
            //     } else {
            //         bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
            //         overflow_exists[lhs_bucket] = true;
            //         affine_output_it += 1;
            //     }
            // }
        }
        if (affine_output_it == (num_affine_output_points - 1)) {

            size_t lhs_bucket = affine_addition_output_bucket_destinations[affine_output_it];

            // bucket_accumulators[lhs_bucket] = affine_output[affine_output_it];
            // overflow_exists[lhs_bucket] = true;
            // affine_output_it += 1;

            bool has_overflow = overflow_exists.get(lhs_bucket);
            if (has_overflow) {
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

    static void compute_bucket_sum(std::span<AffineElement> buckets, std::span<BaseField> scalar_scratch_space)
    {

        // use parallel prefix sum
        add_affine_points_interleaved<Curve>(&buckets[0], buckets.size(), &scalar_scratch_space[0], 2);

        AffineElement* bucket_ptr = &buckets[buckets.size() / 2];
    }

    // step size of 2 (A B[update B] C D[update D])
    static void add_affine_points_interleaved(typename Curve::AffineElement* points,
                                              const size_t num_points,
                                              typename Curve::BaseField* scratch_space,
                                              size_t step_size)
    {
        using Fq = typename Curve::BaseField;
        Fq batch_inversion_accumulator = Fq::one();
        size_t offset = step_size - 1;
        for (size_t i = 0; i < num_points; i += step_size) {
            scratch_space[i >> 1] = points[i].x + points[i + offset].x; // x2 + x1
            points[i + offset].x -= points[i].x;                        // x2 - x1
            points[i + offset].y -= points[i].y;                        // y2 - y1
            points[i + offset].y *= batch_inversion_accumulator;        // (y2 - y1)*accumulator_old
            batch_inversion_accumulator *= (points[i + offset].x);
        }
        if (batch_inversion_accumulator == 0) {
            // prefer abort to throw for code that might emit from multiple threads
            abort_with_message("attempted to invert zero in add_affine_points");
        } else {
            batch_inversion_accumulator = batch_inversion_accumulator.invert();
        }

        for (size_t i = (num_points)-step_size; i < num_points; i -= step_size) {
            // Memory bandwidth is a bit of a bottleneck here.
            // There's probably a more elegant way of structuring our data so we don't need to do all of this
            // prefetching
            // __builtin_prefetch(points + i - 1 - );
            // __builtin_prefetch(points + i - offset);
            // __builtin_prefetch(points + ((i + num_points - 2) >> 1));
            // __builtin_prefetch(scratch_space + ((i - 2) >> 1));

            points[i + offset].y *= batch_inversion_accumulator; // update accumulator
            batch_inversion_accumulator *= points[i + offset].x;
            points[i + offset].x = points[i + offset].y.sqr();

            points[i + offset].x = points[i + offset].x - (scratch_space[i >> 1]);
            //  points[(i + num_points) >> 1].x = points[i + offset].x - (scratch_space[i >> 1]); // x3 = lambda_squared
            //  - x2
            // - x1
            points[i].x -= points[i + offset].x;
            points[i].x *= points[i + offset].y;
            points[i + offset].y = points[i].x - points[i].y;
        }
        // need to test this one
    }

    template <typename BucketType> static Element accumulate_buckets(BucketType& bucket_accumulators)
    {
        auto& buckets = bucket_accumulators.buckets;

        int starting_index = static_cast<int>(buckets.size() - 1);
        Element prefix_sum;
        bool found_start = false;
        while (!found_start && starting_index >= 0) {
            const size_t idx = static_cast<size_t>(starting_index);
            if (bucket_accumulators.bucket_exists.get(idx)) {

                prefix_sum = buckets[idx];
                found_start = true;
            } else {
                starting_index -= 1;
            }
        }
        if (!found_start) {
            return Curve::Group::point_at_infinity;
        }
        AffineElement offset_generator = Curve::Group::affine_point_at_infinity;
        if constexpr (std::same_as<typename Curve::Group, bb::g1>) {
            constexpr auto gen = get_precomputed_generators<typename Curve::Group, "ECCVM_OFFSET_GENERATOR", 1>()[0];
            offset_generator = gen;
        } else {
            constexpr auto gen = get_precomputed_generators<typename Curve::Group, "DEFAULT_DOMAIN_SEPARATOR", 8>()[0];
            offset_generator = gen;
        }
        Element sum = prefix_sum + offset_generator;
        for (int i = static_cast<int>(starting_index - 1); i > 0; --i) {
            size_t idx = static_cast<size_t>(i);
            ASSERT(idx < 10000000);
            if (bucket_accumulators.bucket_exists.get(idx)) {
                prefix_sum += buckets[idx];
            }
            sum += prefix_sum;
        }
        return sum - offset_generator;
    }

    static std::vector<AffineElement> batch_multi_scalar_mul(std::vector<std::span<const AffineElement>>& points,
                                                             std::vector<ScalarSpan>& scalars)
    {

        // WHICH WAY AROUND?
        std::vector<std::vector<MSMWorkUnit>> thread_work_units = compute_batch_msm_work_units(scalars, points);
        const size_t num_cpus = conditional_get_num_cpus<Debug, DebugNumThreads>();

        // for (size_t thread_idx = 0; thread_idx < num_cpus; ++thread_idx) {
        //     if (thread_idx < thread_work_units.size()) {
        //         const std::vector<MSMWorkUnit>& msms = thread_work_units[thread_idx];
        //         for (const MSMWorkUnit& msm : msms) {
        //             // std::cout << "WORK UNIT. SIZE = " << msm.scalars.size() << std::endl;
        //             // for (size_t i = 0; i < msm.scalars.size(); ++i) {
        //             //     std::cout << "POINT[" << i << "] = " << msm.points[i] << std::endl;
        //             // }
        //         }
        //     }
        // }
        std::vector<std::vector<std::pair<AffineElement, size_t>>> thread_msm_results(num_cpus);

        parallel_for(num_cpus, [&](size_t thread_idx) {
            // for (size_t thread_idx = 0; thread_idx < num_cpus; ++thread_idx) {
            // std::cout << "start pipp " << thread_idx << std::endl;

            if (thread_idx < thread_work_units.size()) {
                if (!thread_work_units[thread_idx].empty()) {
                    const std::vector<MSMWorkUnit>& msms = thread_work_units[thread_idx];
                    std::vector<std::pair<AffineElement, size_t>>& msm_results = thread_msm_results[thread_idx];
                    for (const MSMWorkUnit& msm : msms) {
                        AffineElement msm_result = pippenger_low_memory_with_transformed_scalars(
                            msm.scalars, msm.points, msm.num_nonzero_muls);
                        // std::cout << "recieved msm result" << std::endl;
                        msm_results.push_back(std::make_pair(msm_result, msm.batch_msm_index));
                    }
                }
            }
            // std::cout << "done pipp low memory " << thread_idx << std::endl;
            //}
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
        return affine_results;
    }

    static AffineElement msm(std::span<const AffineElement> points, PolynomialSpan<const FF> _scalars)
    {
        if (_scalars.size() == 0) {
            return Curve::Group::affine_point_at_infinity;
        }
        // we'll leave it the way we found it, promise
        FF* scalars = (FF*)(&_scalars[_scalars.start_index]);

        std::vector<std::span<const AffineElement>> pp{ points.subspan(_scalars.start_index) };
        std::vector<std::span<FF>> ss{ std::span<FF>(scalars, _scalars.size()) };
        return batch_multi_scalar_mul(pp, ss)[0];
    }
};

template <typename Curve> using NewMSM = MSM<Curve, false, 1>;

// NEXT STEP ACCUMULATE BUVKETS
} // namespace bb::scalar_multiplication
