// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

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

    // ======================= Algorithm Tuning Constants =======================
    //
    // These constants control the behavior of the Pippenger MSM algorithm.
    // They are empirically tuned for performance on typical hardware.

    // Below this threshold, use naive scalar multiplication instead of Pippenger
    static constexpr size_t PIPPENGER_THRESHOLD = 16;

    // Below this threshold, the affine batch inversion trick is not beneficial
    // (cost of inversions exceeds savings from cheaper affine additions)
    static constexpr size_t AFFINE_TRICK_THRESHOLD = 128;

    // Maximum bits per scalar slice (2^20 = 1M buckets, far beyond practical use)
    static constexpr size_t MAX_SLICE_BITS = 20;

    // Number of points to look ahead for memory prefetching
    static constexpr size_t PREFETCH_LOOKAHEAD = 32;

    // ======================= Cost Model Constants =======================
    //
    // These constants define the relative costs of various operations,
    // used to decide between algorithm variants.

    // Cost of bucket accumulation relative to a single point addition
    // (2 Jacobian adds per bucket, each ~2.5x cost of affine add)
    static constexpr size_t BUCKET_ACCUMULATION_COST = 5;

    // Field multiplications saved per group operation when using affine trick
    static constexpr size_t AFFINE_TRICK_SAVINGS_PER_OP = 5;

    // Extra cost of Jacobian group operation when Z coordinate != 1
    static constexpr size_t JACOBIAN_Z_NOT_ONE_PENALTY = 5;

    // Cost of computing 4-bit lookup table for modular exponentiation (14 muls)
    static constexpr size_t INVERSION_TABLE_COST = 14;
    // ===========================================================================

    // Offset generator used in bucket accumulation to avoid incomplete addition edge cases
    static const AffineElement& get_offset_generator() noexcept
    {
        static const AffineElement offset_generator = []() {
            if constexpr (std::same_as<typename Curve::Group, bb::g1>) {
                return get_precomputed_generators<typename Curve::Group, "ECCVM_OFFSET_GENERATOR", 1>()[0];
            } else {
                return get_precomputed_generators<typename Curve::Group, "DEFAULT_DOMAIN_SEPARATOR", 8>()[0];
            }
        }();
        return offset_generator;
    }

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

    /**
     * @brief Container for MSM input data passed between algorithm stages
     * @note scalars must be in NON-Montgomery form for correct bucket index computation
     */
    struct MSMData {
        std::span<const ScalarField> scalars;     // Scalars (non-Montgomery form)
        std::span<const AffineElement> points;    // Input points
        std::span<const uint32_t> scalar_indices; // Indices of nonzero scalars
        std::span<uint64_t> point_schedule;       // Scratch space for point scheduling

        /**
         * @brief Factory method to construct MSMData from a work unit
         * @details Extracts the appropriate slices from the full arrays based on MSMWorkUnit parameters
         */
        static MSMData from_work_unit(std::span<std::span<ScalarField>> all_scalars,
                                      std::span<std::span<const AffineElement>> all_points,
                                      const std::vector<std::vector<uint32_t>>& all_indices,
                                      std::span<uint64_t> point_schedule_buffer,
                                      const MSMWorkUnit& work_unit) noexcept
        {
            return MSMData{
                .scalars = all_scalars[work_unit.batch_msm_index],
                .points = all_points[work_unit.batch_msm_index],
                .scalar_indices =
                    std::span<const uint32_t>{ &all_indices[work_unit.batch_msm_index][work_unit.start_index],
                                               work_unit.size },
                .point_schedule = point_schedule_buffer,
            };
        }
    };

    /**
     * @brief Affine bucket accumulators for the fast affine-trick Pippenger variant
     * @details Used when handle_edge_cases=false. Stores buckets in affine coordinates,
     *          enabling use of Montgomery's batch inversion trick. Does NOT handle
     *          edge cases like point doubling or point at infinity.
     * @note Thread-local: one instance created per thread
     */
    struct BucketAccumulators {
        std::vector<AffineElement> buckets;
        BitVector bucket_exists;

        BucketAccumulators(size_t num_buckets) noexcept
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };

    /**
     * @brief Jacobian bucket accumulators for the safe Pippenger variant
     * @details Used when handle_edge_cases=true or when affine trick is not beneficial.
     *          Stores buckets in Jacobian coordinates which correctly handle point
     *          doubling and point at infinity edge cases.
     * @note Thread-local: one instance created per thread
     */
    struct JacobianBucketAccumulators {
        std::vector<Element> buckets;
        BitVector bucket_exists;

        JacobianBucketAccumulators(size_t num_buckets) noexcept
            : buckets(num_buckets)
            , bucket_exists(num_buckets)
        {}
    };
    /**
     * @brief Scratch space for batched affine point additions (one per thread)
     */
    struct AffineAdditionData {
        static constexpr size_t BATCH_SIZE = 2048;
        // when adding affine points, we have an edge case where the number of points in the batch can overflow by 2
        static constexpr size_t BATCH_OVERFLOW_SIZE = 2;
        std::vector<AffineElement> points_to_add;
        std::vector<BaseField> scalar_scratch_space;
        std::vector<uint32_t> addition_result_bucket_destinations;

        AffineAdditionData() noexcept
            : points_to_add(BATCH_SIZE + BATCH_OVERFLOW_SIZE)
            , scalar_scratch_space(BATCH_SIZE + BATCH_OVERFLOW_SIZE)
            , addition_result_bucket_destinations(((BATCH_SIZE + BATCH_OVERFLOW_SIZE) / 2))
        {}
    };

    /**
     * @brief Packed point schedule entry: (point_index << 32) | bucket_index
     * @details Used to sort points by their target bucket for cache-efficient processing
     */
    struct PointScheduleEntry {
        uint64_t data;

        static PointScheduleEntry create(uint32_t point_index, uint32_t bucket_index)
        {
            return { (static_cast<uint64_t>(point_index) << 32) | bucket_index };
        }
        [[nodiscard]] uint32_t point_index() const { return static_cast<uint32_t>(data >> 32); }
        [[nodiscard]] uint32_t bucket_index() const { return static_cast<uint32_t>(data); }
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
    static void get_nonzero_scalar_indices(std::span<const ScalarField> scalars,
                                           std::vector<uint32_t>& nonzero_scalar_indices) noexcept;

    static std::vector<ThreadWorkUnits> get_work_units(std::span<std::span<ScalarField>> scalars,
                                                       std::vector<std::vector<uint32_t>>& msm_scalar_indices) noexcept;
    static uint32_t get_scalar_slice(const ScalarField& scalar, size_t round, size_t normal_slice_size) noexcept;
    static size_t get_optimal_log_num_buckets(const size_t num_points) noexcept;
    static bool use_affine_trick(const size_t num_points, const size_t num_buckets) noexcept;

    static Element small_pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept;
    static Element pippenger_low_memory_with_transformed_scalars(MSMData& msm_data) noexcept;
    static void evaluate_small_pippenger_round(MSMData& msm_data,
                                               const size_t round_index,
                                               JacobianBucketAccumulators& bucket_data,
                                               Element& msm_accumulator,
                                               const size_t bits_per_slice) noexcept;

    static void evaluate_pippenger_round(MSMData& msm_data,
                                         const size_t round_index,
                                         AffineAdditionData& affine_data,
                                         BucketAccumulators& bucket_data,
                                         Element& msm_accumulator,
                                         const size_t bits_per_slice) noexcept;

    static void accumulate_round_result(Element& msm_accumulator,
                                        const Element& bucket_result,
                                        size_t round_index,
                                        size_t bits_per_slice) noexcept;

    static void consume_point_schedule(std::span<const uint64_t> point_schedule,
                                       std::span<const AffineElement> points,
                                       AffineAdditionData& affine_data,
                                       BucketAccumulators& bucket_data,
                                       size_t num_input_points_processed,
                                       size_t num_queued_affine_points) noexcept;

    static std::vector<AffineElement> batch_multi_scalar_mul(std::span<std::span<const AffineElement>> points,
                                                             std::span<std::span<ScalarField>> scalars,
                                                             bool handle_edge_cases = true) noexcept;
    static AffineElement msm(std::span<const AffineElement> points,
                             PolynomialSpan<const ScalarField> scalars,
                             bool handle_edge_cases = false) noexcept;

    template <typename BucketType> static Element accumulate_buckets(BucketType& bucket_accumulators) noexcept
    {
        auto& buckets = bucket_accumulators.buckets;
        BB_ASSERT_DEBUG(buckets.size() > static_cast<size_t>(0));
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
        BB_ASSERT_DEBUG(starting_index > 0);
        const auto& offset_generator = get_offset_generator();
        Element sum = prefix_sum + offset_generator;
        for (int i = starting_index - 1; i > 0; --i) {
            size_t idx = static_cast<size_t>(i);
            BB_ASSERT_DEBUG(idx < bucket_accumulators.bucket_exists.size());
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

} // namespace bb::scalar_multiplication
