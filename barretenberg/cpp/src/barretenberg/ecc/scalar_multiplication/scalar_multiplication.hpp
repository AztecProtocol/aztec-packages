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

template <typename FF>
void transform_scalar_and_get_nonzero_scalar_indices(std::span<FF> scalars, std::vector<uint32_t>& consolidated_indices)
{
    const size_t num_cpus = get_num_cpus();

    const size_t scalars_per_thread = (scalars.size() + num_cpus - 1) / num_cpus;
    std::vector<std::vector<uint32_t>> thread_indices(num_cpus);
    parallel_for(num_cpus, [&](size_t thread_idx) {
        //  for (size_t thread_idx = 0; thread_idx < num_cpus; ++thread_idx) {
        bool empty_thread = (thread_idx * scalars_per_thread >= scalars.size());
        bool last_thread = ((thread_idx + 1) * scalars_per_thread) >= scalars.size();
        const size_t start = thread_idx * scalars_per_thread;
        const size_t end = last_thread ? scalars.size() : (thread_idx + 1) * scalars_per_thread;
        if (!empty_thread) {
            ASSERT(end > start);
            std::vector<uint32_t>& thread_scalar_indices = thread_indices[thread_idx];
            thread_scalar_indices.reserve(end - start);
            for (size_t i = start; i < end; ++i) {
                BB_ASSERT_LT(i, scalars.size());
                auto& scalar = scalars[i];
                bool is_zero = scalar.is_zero();
                scalar.self_from_montgomery_form();

                // bool is_zero =
                //     (scalar.data[0] == 0) && (scalar.data[1] == 0) && (scalar.data[2] == 0) && (scalar.data[3] == 0);
                if (!is_zero) {
                    thread_scalar_indices.push_back(static_cast<uint32_t>(i));
                }
            }
        }
    });
    //  }

    size_t num_entries = 0;
    for (size_t i = 0; i < num_cpus; ++i) {
        BB_ASSERT_LT(i, thread_indices.size());
        num_entries += thread_indices[i].size();
    }
    consolidated_indices.resize(num_entries);

    parallel_for(num_cpus, [&](size_t thread_idx) {
        //   for (size_t thread_idx = 0; thread_idx < num_cpus; ++thread_idx) {
        size_t offset = 0;
        for (size_t i = 0; i < thread_idx; ++i) {
            BB_ASSERT_LT(i, thread_indices.size());
            offset += thread_indices[i].size();
        }
        for (size_t i = offset; i < offset + thread_indices[thread_idx].size(); ++i) {
            BB_ASSERT_LT(i, scalars.size());
            consolidated_indices[i] = thread_indices[thread_idx][i - offset];
        }
        //   std::copy(thread_indices[thread_idx].begin(), thread_indices[thread_idx].end(),
        //   &consolidated_indices[offset]);
    });
}

/**
 * @brief MSMWorkUnit describes an MSM that may be part of a larger MSM
 * @details For a multi-MSM where each MSM has a variable size, we want to split the MSMs up
 *          such that every available thread has an equal amount of MSM work to perform.
 *          The actual MSM algorithm used is single-threaded. This is beneficial because we get better scaling.
 *
 */
struct MSMWorkUnitB {
    size_t batch_msm_index = 0;
    size_t start_index = 0;
    size_t size = 0;
};
using ThreadWorkUnits = std::vector<MSMWorkUnitB>;

template <typename Curve> class MSM {
  public:
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;
    using AffineElement = typename Curve::AffineElement;

    using G1 = AffineElement;
    static constexpr size_t NUM_BITS_IN_FIELD = ScalarField::modulus.get_msb() + 1;

    static std::vector<ThreadWorkUnits> get_work_units(std::vector<std::span<ScalarField>>& scalars,
                                                       std::vector<std::vector<uint32_t>>& msm_scalar_indices);
    static uint32_t get_scalar_slice(const ScalarField& scalar, size_t round, size_t normal_slice_size);
    static constexpr size_t get_log_num_buckets(const size_t num_points);

    struct MSMData {
        std::span<const ScalarField> scalars;
        std::span<const AffineElement> points;
        std::span<const uint32_t> scalar_indices;
        std::span<uint64_t> point_schedule;
    };

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

    static bool use_affine_trick(const size_t num_points, const size_t num_buckets);

    static AffineElement small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data);
    static AffineElement pippenger_low_memory_with_transformed_scalars(MSMData& msm_data);
    static Element evaluate_small_pippenger_round(MSMData& msm_data,
                                                  const size_t round_index,
                                                  JacobianBucketAccumulators& bucket_data,
                                                  Element previous_round_output,
                                                  const size_t bits_per_slice);

    static Element evaluate_pippenger_round(MSMData& msm_data,
                                            const size_t round_index,
                                            AffineAdditionData& affine_data,
                                            BucketAccumulators& bucket_data,
                                            Element previous_round_output,
                                            const size_t bits_per_slice);

    static void consume_point_batch(std::span<const uint64_t> point_schedule,
                                    std::span<const AffineElement> points,
                                    AffineAdditionData& affine_data,
                                    BucketAccumulators& bucket_data,
                                    size_t num_input_points_processed,
                                    size_t num_queued_affine_points);
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
        BB_ASSERT_GT(starting_index, 0);
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
            BB_ASSERT_LT(idx, bucket_accumulators.bucket_exists.size());
            if (bucket_accumulators.bucket_exists.get(idx)) {

                prefix_sum += buckets[idx];
            }
            sum += prefix_sum;
        }
        return sum - offset_generator;
    }

    static std::vector<AffineElement> batch_multi_scalar_mul(std::vector<std::span<const AffineElement>>& points,
                                                             std::vector<std::span<ScalarField>>& scalars);
    static AffineElement msm(std::span<const AffineElement> points, PolynomialSpan<const ScalarField> _scalars);
};

template <typename Curve>
typename Curve::Element pippenger(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                  std::span<const typename Curve::AffineElement> points,
                                  bool handle_edge_cases = true);
template <typename Curve>
typename Curve::Element pippenger_unsafe(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                         std::span<const typename Curve::AffineElement> points);

extern template class MSM<curve::Grumpkin>;
extern template class MSM<curve::BN254>;

// NEXT STEP ACCUMULATE BUVKETS
} // namespace bb::scalar_multiplication
