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

// Naive double-and-add fallback for small inputs (< PIPPENGER_THRESHOLD points).
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

template <typename Curve>
void MSM<Curve>::transform_scalar_and_get_nonzero_scalar_indices(std::span<typename Curve::ScalarField> scalars,
                                                                 std::vector<uint32_t>& nonzero_scalar_indices) noexcept
{
    std::vector<std::vector<uint32_t>> thread_indices(get_num_cpus());

    // Pass 1: Each thread converts from Montgomery and collects nonzero indices into its own vector
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
            auto& scalar = scalars[i];
            scalar.self_from_montgomery_form();

            if (!scalar.is_zero()) {
                thread_scalar_indices.push_back(static_cast<uint32_t>(i));
            }
        }
    });

    size_t num_entries = 0;
    for (const auto& indices : thread_indices) {
        num_entries += indices.size();
    }
    nonzero_scalar_indices.resize(num_entries);

    // Pass 2: Copy each thread's indices to the output vector (no branching)
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

template <typename Curve>
std::vector<typename MSM<Curve>::ThreadWorkUnits> MSM<Curve>::get_work_units(
    std::span<std::span<ScalarField>> scalars, std::vector<std::vector<uint32_t>>& msm_scalar_indices) noexcept
{

    const size_t num_msms = scalars.size();
    msm_scalar_indices.resize(num_msms);
    for (size_t i = 0; i < num_msms; ++i) {
        transform_scalar_and_get_nonzero_scalar_indices(scalars[i], msm_scalar_indices[i]);
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
 * @brief Extract a slice of bits from a scalar for Pippenger bucket assignment
 * @details Extracts bits [lo_bit, hi_bit) from the scalar's raw limb representation.
 *          The scalar must already be converted out of Montgomery form.
 *
 * IMPORTANT RESTRICTIONS (optimized for Pippenger's specific usage pattern):
 * - slice_size must be <= 32 bits (returns uint32_t)
 * - The bit range must span at most 2 limbs (satisfied when slice_size <= 64)
 * - hi_bit must be < 256 to avoid out-of-bounds access (satisfied since hi_bit <= NUM_BITS_IN_FIELD < 256)
 *
 * @param scalar The scalar field element (must be in non-Montgomery form)
 * @param round The current Pippenger round (0 = most significant bits)
 * @param slice_size Number of bits per slice
 * @return uint32_t The bucket index for this round
 */
template <typename Curve>
uint32_t MSM<Curve>::get_scalar_slice(const typename Curve::ScalarField& scalar,
                                      size_t round,
                                      size_t slice_size) noexcept
{
    constexpr size_t LIMB_BITS = 64;

    size_t hi_bit = NUM_BITS_IN_FIELD - (round * slice_size);
    size_t lo_bit = (hi_bit < slice_size) ? 0 : hi_bit - slice_size;

    BB_ASSERT_DEBUG(lo_bit < hi_bit);
    BB_ASSERT_DEBUG(hi_bit <= NUM_BITS_IN_FIELD); // Ensures hi_bit < 256, so end_limb <= 3

    size_t start_limb = lo_bit / LIMB_BITS;
    size_t end_limb = hi_bit / LIMB_BITS;
    size_t lo_slice_offset = lo_bit & (LIMB_BITS - 1);
    size_t actual_slice_size = hi_bit - lo_bit;
    size_t lo_slice_bits =
        (LIMB_BITS - lo_slice_offset < actual_slice_size) ? (LIMB_BITS - lo_slice_offset) : actual_slice_size;
    size_t hi_slice_bits = actual_slice_size - lo_slice_bits;

    uint64_t lo_slice = (scalar.data[start_limb] >> lo_slice_offset) & ((1ULL << lo_slice_bits) - 1);
    uint64_t hi_slice = (start_limb != end_limb) ? (scalar.data[end_limb] & ((1ULL << hi_slice_bits) - 1)) : 0;

    return static_cast<uint32_t>(lo_slice | (hi_slice << lo_slice_bits));
}

template <typename Curve> uint32_t MSM<Curve>::get_optimal_log_num_buckets(const size_t num_points) noexcept
{
    // Cost model: total_cost = num_rounds * (num_points + num_buckets * BUCKET_ACCUMULATION_COST)
    auto compute_cost = [&](uint32_t bits) {
        size_t rounds = numeric::ceil_div(NUM_BITS_IN_FIELD, static_cast<size_t>(bits));
        size_t buckets = size_t{ 1 } << bits;
        return rounds * (num_points + buckets * BUCKET_ACCUMULATION_COST);
    };

    uint32_t best_bits = 1;
    size_t best_cost = compute_cost(1);
    for (uint32_t bits = 2; bits < MAX_SLICE_BITS; ++bits) {
        size_t cost = compute_cost(bits);
        if (cost < best_cost) {
            best_cost = cost;
            best_bits = bits;
        }
    }
    return best_bits;
}

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

template <typename Curve>
void MSM<Curve>::add_affine_points(typename Curve::AffineElement* points,
                                   const size_t num_points,
                                   typename Curve::BaseField* scratch_space) noexcept
{
    using AffineElement = typename Curve::AffineElement;
    using BaseField = typename Curve::BaseField;

    // Use interleaved array policy: pairs are (points[2i], points[2i+1]), output in points[num_pairs + 1]
    // This includes prefetching for non-sequential output access
    const size_t num_pairs = num_points / 2;
    bb::group_elements::batch_affine_add_impl<bb::group_elements::InterleavedArrayPolicy, AffineElement, BaseField>(
        points, points, num_pairs, scratch_space);
}

template <typename Curve>
typename Curve::Element MSM<Curve>::jacobian_pippenger_with_transformed_scalars(MSMData& msm_data) noexcept
{
    const size_t size = msm_data.scalar_indices.size();
    const uint32_t bits_per_slice = get_optimal_log_num_buckets(size);
    const size_t num_buckets = size_t{ 1 } << bits_per_slice;
    const uint32_t num_rounds = static_cast<uint32_t>((NUM_BITS_IN_FIELD + bits_per_slice - 1) / bits_per_slice);
    const uint32_t remainder = NUM_BITS_IN_FIELD % bits_per_slice;

    JacobianBucketAccumulators bucket_data(num_buckets);
    Element msm_result = Curve::Group::point_at_infinity;

    for (uint32_t round = 0; round < num_rounds; ++round) {
        // Populate buckets using Jacobian accumulation
        for (size_t i = 0; i < size; ++i) {
            uint32_t idx = msm_data.scalar_indices[i];
            uint32_t bucket = get_scalar_slice(msm_data.scalars[idx], round, bits_per_slice);
            if (bucket > 0) {
                if (bucket_data.bucket_exists.get(bucket)) {
                    bucket_data.buckets[bucket] += msm_data.points[idx];
                } else {
                    bucket_data.buckets[bucket] = msm_data.points[idx];
                    bucket_data.bucket_exists.set(bucket, true);
                }
            }
        }

        // Reduce buckets and accumulate into result
        Element bucket_result = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();

        uint32_t num_doublings = (round == num_rounds - 1 && remainder != 0) ? remainder : bits_per_slice;
        for (uint32_t i = 0; i < num_doublings; ++i) {
            msm_result.self_dbl();
        }
        msm_result += bucket_result;
    }
    return msm_result;
}

template <typename Curve>
typename Curve::Element MSM<Curve>::affine_pippenger_with_transformed_scalars(MSMData& msm_data) noexcept
{
    const size_t num_points = msm_data.scalar_indices.size();
    const uint32_t bits_per_slice = get_optimal_log_num_buckets(num_points);
    const size_t num_buckets = size_t{ 1 } << bits_per_slice;

    if (!use_affine_trick(num_points, num_buckets)) {
        return jacobian_pippenger_with_transformed_scalars(msm_data);
    }

    const uint32_t num_rounds = static_cast<uint32_t>((NUM_BITS_IN_FIELD + bits_per_slice - 1) / bits_per_slice);
    const uint32_t remainder = NUM_BITS_IN_FIELD % bits_per_slice;

    // Per-call allocation for WASM compatibility (thread_local causes issues in WASM)
    AffineAdditionData affine_data;
    BucketAccumulators bucket_data(num_buckets);

    Element msm_result = Curve::Group::point_at_infinity;

    for (uint32_t round = 0; round < num_rounds; ++round) {
        // Build point schedule for this round
        {
            for (size_t i = 0; i < num_points; ++i) {
                uint32_t idx = msm_data.scalar_indices[i];
                uint32_t bucket_idx = get_scalar_slice(msm_data.scalars[idx], round, bits_per_slice);
                msm_data.point_schedule[i] = PointScheduleEntry::create(idx, bucket_idx).data;
            }
        }

        // Sort by bucket and count zero-bucket entries
        size_t num_zero_bucket_entries =
            sort_point_schedule_and_count_zero_buckets(&msm_data.point_schedule[0], num_points, bits_per_slice);
        size_t round_size = num_points - num_zero_bucket_entries;

        // Accumulate points into buckets
        Element bucket_result = Curve::Group::point_at_infinity;
        if (round_size > 0) {
            std::span<uint64_t> schedule(&msm_data.point_schedule[num_zero_bucket_entries], round_size);
            batch_accumulate_points_into_buckets(schedule, msm_data.points, affine_data, bucket_data);
            bucket_result = accumulate_buckets(bucket_data);
            bucket_data.bucket_exists.clear();
        }

        // Combine into running result
        uint32_t num_doublings = (round == num_rounds - 1 && remainder != 0) ? remainder : bits_per_slice;
        for (uint32_t i = 0; i < num_doublings; ++i) {
            msm_result.self_dbl();
        }
        msm_result += bucket_result;
    }

    return msm_result;
}

template <typename Curve>
void MSM<Curve>::batch_accumulate_points_into_buckets(std::span<const uint64_t> point_schedule,
                                                      std::span<const typename Curve::AffineElement> points,
                                                      MSM<Curve>::AffineAdditionData& affine_data,
                                                      MSM<Curve>::BucketAccumulators& bucket_data) noexcept
{

    if (point_schedule.empty()) {
        return;
    }

    size_t point_it = 0;
    size_t scratch_it = 0;
    const size_t num_points = point_schedule.size();
    const size_t prefetch_max = (num_points >= PREFETCH_LOOKAHEAD) ? (num_points - PREFETCH_LOOKAHEAD) : 0;
    const size_t last_index = num_points - 1;

    // Iterative loop - continues until all points processed and no work remains in scratch space
    while (point_it < num_points || scratch_it != 0) {
        // Step 1: Fill scratch space with up to BATCH_SIZE/2 independent additions
        while (((scratch_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < last_index)) {
            // Prefetch points we'll need soon (every PREFETCH_INTERVAL iterations)
            if ((point_it < prefetch_max) && ((point_it & PREFETCH_INTERVAL_MASK) == 0)) {
                for (size_t i = PREFETCH_LOOKAHEAD / 2; i < PREFETCH_LOOKAHEAD; ++i) {
                    PointScheduleEntry entry{ point_schedule[point_it + i] };
                    __builtin_prefetch(&points[entry.point_index()]);
                }
            }

            PointScheduleEntry lhs{ point_schedule[point_it] };
            PointScheduleEntry rhs{ point_schedule[point_it + 1] };

            process_bucket_pair(lhs.bucket_index(),
                                rhs.bucket_index(),
                                &points[lhs.point_index()],
                                &points[rhs.point_index()],
                                affine_data,
                                bucket_data,
                                scratch_it,
                                point_it);
        }

        // Handle the last point (odd count case) - separate to avoid bounds check on point_schedule[point_it + 1]
        if (point_it == last_index) {
            PointScheduleEntry last{ point_schedule[point_it] };
            process_single_point(
                last.bucket_index(), &points[last.point_index()], affine_data, bucket_data, scratch_it, point_it);
        }

        // Compute independent additions using Montgomery's batch inversion trick
        size_t num_points_to_add = scratch_it;
        if (num_points_to_add >= 2) {
            add_affine_points(
                affine_data.points_to_add.data(), num_points_to_add, affine_data.inversion_scratch_space.data());
        }

        // add_affine_points stores results in the top-half of scratch space
        AffineElement* affine_output = affine_data.points_to_add.data() + (num_points_to_add / 2);

        // Recirculate addition outputs back into scratch space or bucket accumulators
        size_t new_scratch_it = 0;
        size_t output_it = 0;
        size_t num_outputs = num_points_to_add / 2;

        while ((num_outputs > 1) && (output_it + 1 < num_outputs)) {
            uint32_t lhs_bucket = affine_data.addition_result_bucket_destinations[output_it];
            uint32_t rhs_bucket = affine_data.addition_result_bucket_destinations[output_it + 1];

            process_bucket_pair(lhs_bucket,
                                rhs_bucket,
                                &affine_output[output_it],
                                &affine_output[output_it + 1],
                                affine_data,
                                bucket_data,
                                new_scratch_it,
                                output_it);
        }

        // Handle the last output (odd count case)
        if (num_outputs > 0 && output_it == num_outputs - 1) {
            uint32_t bucket = affine_data.addition_result_bucket_destinations[output_it];
            process_single_point(
                bucket, &affine_output[output_it], affine_data, bucket_data, new_scratch_it, output_it);
        }

        // Continue with recirculated points
        scratch_it = new_scratch_it;
    }
}

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
    auto pippenger_impl =
        handle_edge_cases ? jacobian_pippenger_with_transformed_scalars : affine_pippenger_with_transformed_scalars;

    // Once we have our work units, each thread can independently evaluate its assigned msms
    parallel_for(num_cpus, [&](size_t thread_idx) {
        if (!thread_work_units[thread_idx].empty()) {
            const std::vector<MSMWorkUnit>& msms = thread_work_units[thread_idx];
            std::vector<std::pair<Element, size_t>>& msm_results = thread_msm_results[thread_idx];
            msm_results.reserve(msms.size());

            // Point schedule buffer for this thread - avoids per-work-unit heap allocation
            std::vector<uint64_t> point_schedule_buffer;

            for (const MSMWorkUnit& msm : msms) {
                point_schedule_buffer.resize(msm.size);
                MSMData msm_data =
                    MSMData::from_work_unit(scalars, points, msm_scalar_indices, point_schedule_buffer, msm);
                Element msm_result =
                    (msm.size < PIPPENGER_THRESHOLD) ? small_mul<Curve>(msm_data) : pippenger_impl(msm_data);

                msm_results.emplace_back(msm_result, msm.batch_msm_index);
            }
        }
    });

    // Accumulate results. This part needs to be single threaded, but amount of work done here should be small
    // TODO(@zac-williamson) check this? E.g. if we are doing a 2^16 MSM with 256 threads this single-threaded part
    // will be painful.
    std::vector<Element> results(num_msms, Curve::Group::point_at_infinity);
    for (const auto& single_thread_msm_results : thread_msm_results) {
        for (const auto& [element, index] : single_thread_msm_results) {
            results[index] += element;
        }
    }
    Element::batch_normalize(results.data(), num_msms);

    // Convert scalars back TO Montgomery form so they remain unchanged from caller's perspective
    for (auto& scalar_span : scalars) {
        parallel_for_range(scalar_span.size(), [&](size_t start, size_t end) {
            for (size_t i = start; i < end; ++i) {
                scalar_span[i].self_to_montgomery_form();
            }
        });
    }

    return std::vector<AffineElement>(results.begin(), results.end());
}

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const ScalarField> scalars,
                                              bool handle_edge_cases) noexcept
{
    if (scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    const size_t num_scalars = scalars.size();
    BB_ASSERT_GTE(points.size(), scalars.start_index + num_scalars);

    // const_cast is safe: we convert from Montgomery, compute, then convert back.
    // Scalars are unchanged from the caller's perspective.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    ScalarField* scalar_ptr = const_cast<ScalarField*>(&scalars[scalars.start_index]);
    std::span<ScalarField> scalar_span(scalar_ptr, num_scalars);

    // Wrap into a size-1 batch and delegate to the general method that properly handles multi-threading
    std::array<std::span<const AffineElement>, 1> points_batch{ points.subspan(scalars.start_index) };
    std::array<std::span<ScalarField>, 1> scalars_batch{ scalar_span };

    auto results = batch_multi_scalar_mul(std::span(points_batch), std::span(scalars_batch), handle_edge_cases);
    return results[0];
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
