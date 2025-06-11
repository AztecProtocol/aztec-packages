#pragma once
#include "barretenberg/ecc/groups/precomputed_generators_bn254_impl.hpp"
#include "barretenberg/ecc/groups/precomputed_generators_grumpkin_impl.hpp"

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include "./process_buckets.hpp"
#include "./scalar_multiplication.hpp"

#include "./bitvector.hpp"
namespace bb::scalar_multiplication {

template <typename Curve> class MSM {
  public:
    using Element = typename Curve::Element;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;
    using AffineElement = typename Curve::AffineElement;

    using G1 = AffineElement;
    static constexpr size_t NUM_BITS_IN_FIELD = ScalarField::modulus.get_msb() + 1;

    /**
     * @brief MSMWorkUnit describes an MSM that may be part of a larger MSM
     * @details For a multi-MSM where each MSM has a variable size, we want to split the MSMs up
     *          such that every available thread has an equal amount of MSM work to perform.
     *          The actual MSM algorithm used is single-threaded. This is beneficial because we get better scaling.
     *
     */
    struct MSMWorkUnit {
        size_t batch_msm_index = 0;
        size_t start_index = 0;
        size_t size = 0;
    };
    using ThreadWorkUnits = std::vector<MSMWorkUnit>;

    struct MSMData {
        std::span<const ScalarField> scalars;
        std::span<const AffineElement> points;
        std::span<const uint32_t> scalar_indices;
        std::span<uint64_t> point_schedule;
    };

    /**
     * @brief Temp data structure, one created per thread!
     */
    struct BucketAccumulators {
        std::vector<AffineElement> buckets;
        BitVector bucket_exists;

        BucketAccumulators(size_t num_buckets) noexcept
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };

    struct JacobianBucketAccumulators {
        std::vector<Element> buckets;
        BitVector bucket_exists;

        JacobianBucketAccumulators(size_t num_buckets) noexcept
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };
    /**
     * @brief Temp data structure, one created per thread!
     */
    struct AffineAdditionData {
        static constexpr size_t BATCH_SIZE = 2048;
        // when adding affine points, we have an edge case where the number of points in the batch can overflow by 2
        static constexpr size_t BATCH_OVERFLOW_SIZE = 2;
        std::vector<AffineElement> points_to_add;
        std::vector<BaseField> scalar_scratch_space;
        std::vector<uint64_t> addition_result_bucket_destinations;

        AffineAdditionData() noexcept
            : points_to_add(BATCH_SIZE + BATCH_OVERFLOW_SIZE)
            , scalar_scratch_space(BATCH_SIZE + BATCH_OVERFLOW_SIZE)
            , addition_result_bucket_destinations(((BATCH_SIZE + BATCH_OVERFLOW_SIZE) / 2))
        {}
    };
    static size_t get_num_rounds(size_t num_points) noexcept
    {
        const size_t bits_per_slice = get_optimal_log_num_buckets(num_points);
        const size_t num_rounds = (NUM_BITS_IN_FIELD + (bits_per_slice - 1)) / bits_per_slice;
        return num_rounds;
    }
    static void add_affine_points(AffineElement* points,
                                  const size_t num_points,
                                  typename Curve::BaseField* scratch_space) noexcept;
    static void transform_scalar_and_get_nonzero_scalar_indices(std::span<typename Curve::ScalarField> scalars,
                                                                std::vector<uint32_t>& consolidated_indices) noexcept;

    static std::vector<ThreadWorkUnits> get_work_units(std::vector<std::span<ScalarField>>& scalars,
                                                       std::vector<std::vector<uint32_t>>& msm_scalar_indices) noexcept;
    static uint32_t get_scalar_slice(const ScalarField& scalar, size_t round, size_t normal_slice_size) noexcept;
    static size_t get_optimal_log_num_buckets(const size_t num_points) noexcept;
    static bool use_affine_trick(const size_t num_points, const size_t num_buckets) noexcept;

    static AffineElement small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept;
    static AffineElement pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept;
    static Element evaluate_small_pippenger_round(MSMData& msm_data,
                                                  const size_t round_index,
                                                  JacobianBucketAccumulators& bucket_data,
                                                  Element previous_round_output,
                                                  const size_t bits_per_slice) noexcept;

    static Element evaluate_pippenger_round(MSMData& msm_data,
                                            const size_t round_index,
                                            AffineAdditionData& affine_data,
                                            BucketAccumulators& bucket_data,
                                            Element previous_round_output,
                                            const size_t bits_per_slice) noexcept;

    static void consume_point_schedule(std::span<const uint64_t> point_schedule,
                                       std::span<const AffineElement> points,
                                       AffineAdditionData& affine_data,
                                       BucketAccumulators& bucket_data,
                                       size_t num_input_points_processed,
                                       size_t num_queued_affine_points) noexcept;

    static std::vector<AffineElement> batch_multi_scalar_mul(std::vector<std::span<const AffineElement>>& points,
                                                             std::vector<std::span<ScalarField>>& scalars,
                                                             bool handle_edge_cases = true) noexcept;
    static AffineElement msm(std::span<const AffineElement> points,
                             PolynomialSpan<const ScalarField> _scalars,
                             bool handle_edge_cases = false) noexcept;

    template <typename BucketType> static Element accumulate_buckets(BucketType& bucket_accumulators) noexcept
    {
        auto& buckets = bucket_accumulators.buckets;
        BB_ASSERT_GT(buckets.size(), static_cast<size_t>(0));
        int starting_index = static_cast<int>(buckets.size() - 1);
        Element prefix_sum;
        bool found_start = false;
        while (!found_start && starting_index > 0) {
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
};

template <typename Curve>
typename Curve::Element pippenger(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                  std::span<const typename Curve::AffineElement> points,
                                  bool handle_edge_cases = true) noexcept;
template <typename Curve>
typename Curve::Element pippenger_unsafe(PolynomialSpan<const typename Curve::ScalarField> scalars,
                                         std::span<const typename Curve::AffineElement> points) noexcept;

extern template class MSM<curve::Grumpkin>;
extern template class MSM<curve::BN254>;

// NEXT STEP ACCUMULATE BUVKETS
} // namespace bb::scalar_multiplication
