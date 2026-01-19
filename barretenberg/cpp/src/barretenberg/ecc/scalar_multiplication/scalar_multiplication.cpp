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

template <typename Curve>
uint32_t MSM<Curve>::get_scalar_slice(const typename Curve::ScalarField& scalar,
                                      uint32_t round,
                                      uint32_t slice_size) noexcept
{
    uint32_t hi_bit = NUM_BITS_IN_FIELD - (round * slice_size);
    uint32_t lo_bit = (hi_bit < slice_size) ? 0 : hi_bit - slice_size;
    return scalar.get_bit_slice_raw(lo_bit, hi_bit);
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
    using Fq = typename Curve::BaseField;
    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass: prepare batch inversion inputs.
    // We reuse points[i+1] storage: .x stores (x2-x1), .y stores (y2-y1)*accumulator
    for (size_t i = 0; i < num_points; i += 2) {
        scratch_space[i >> 1] = points[i].x + points[i + 1].x; // x2 + x1 (needed later for x3)
        points[i + 1].x -= points[i].x;                        // x2 - x1 (denominator for lambda)
        points[i + 1].y -= points[i].y;                        // y2 - y1 (numerator for lambda)
        points[i + 1].y *= batch_inversion_accumulator;        // (y2 - y1)*accumulator_old
        batch_inversion_accumulator *= (points[i + 1].x);      // accumulate denominators
    }
    if (batch_inversion_accumulator == 0) {
        // prefer abort to throw for code that might emit from multiple threads
        throw_or_abort("attempted to invert zero in add_affine_points");
    } else {
        batch_inversion_accumulator = batch_inversion_accumulator.invert();
    }

    // Backward pass: compute additions using batch inversion results.
    // Reusing points[i+1] storage: .y becomes lambda, .x becomes lambda^2.
    // Results are written to the top half of points array: points[(i+num_points)/2].
    // Loop terminates when i underflows (becomes > num_points for unsigned).
    for (size_t i = (num_points)-2; i < num_points; i -= 2) {
        points[i + 1].y *= batch_inversion_accumulator; // .y now holds lambda = (y2-y1)/(x2-x1)
        batch_inversion_accumulator *= points[i + 1].x; // restore accumulator for next iteration
        points[i + 1].x = points[i + 1].y.sqr();        // .x now holds lambda^2
        points[(i + num_points) >> 1].x = points[i + 1].x - (scratch_space[i >> 1]); // x3 = lambda^2 - x2 - x1
        // Output addresses jump non-sequentially: points[(i+n)>>1] defeats hardware prefetcher.
        // Fetching 2 iterations ahead ensures data arrives before needed.
        if (i >= 2) {
            __builtin_prefetch(points + i - 2);
            __builtin_prefetch(points + i - 1);
            __builtin_prefetch(points + ((i + num_points - 2) >> 1));
            __builtin_prefetch(scratch_space + ((i - 2) >> 1));
        }
        // Compute y3 = lambda * (x1 - x3) - y1, reusing points[i].x as temp storage
        points[i].x -= points[(i + num_points) >> 1].x;              // x1 - x3
        points[i].x *= points[i + 1].y;                              // lambda * (x1 - x3)
        points[(i + num_points) >> 1].y = points[i].x - points[i].y; // y3 = lambda*(x1-x3) - y1
    }
}

template <typename Curve>
typename Curve::Element MSM<Curve>::jacobian_pippenger_with_transformed_scalars(MSMData& msm_data) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    const size_t size = nonzero_scalar_indices.size();
    const uint32_t bits_per_slice = get_optimal_log_num_buckets(size);
    const size_t num_buckets = size_t{ 1 } << bits_per_slice;
    JacobianBucketAccumulators bucket_data = JacobianBucketAccumulators(num_buckets);
    Element msm_result = Curve::Group::point_at_infinity;

    const uint32_t num_rounds = (NUM_BITS_IN_FIELD + bits_per_slice - 1) / bits_per_slice;

    for (uint32_t i = 0; i < num_rounds; ++i) {
        evaluate_jacobian_pippenger_round(msm_data, i, bucket_data, msm_result, bits_per_slice);
    }
    return msm_result;
}

template <typename Curve>
typename Curve::Element MSM<Curve>::affine_pippenger_with_transformed_scalars(MSMData& msm_data) noexcept
{
    const size_t msm_size = msm_data.scalar_indices.size();
    const uint32_t bits_per_slice = get_optimal_log_num_buckets(msm_size);
    const size_t num_buckets = size_t{ 1 } << bits_per_slice;

    if (!use_affine_trick(msm_size, num_buckets)) {
        return jacobian_pippenger_with_transformed_scalars(msm_data);
    }

    // Use thread-local storage to avoid per-call allocations (resolves issue #1452)
    static thread_local AffineAdditionData affine_data;
    static thread_local BucketAccumulators bucket_data(0);
    if (bucket_data.buckets.size() < num_buckets) {
        bucket_data.buckets.resize(num_buckets);
        bucket_data.bucket_exists.resize(num_buckets);
    }

    Element msm_result = Curve::Group::point_at_infinity;

    const uint32_t num_rounds = (NUM_BITS_IN_FIELD + bits_per_slice - 1) / bits_per_slice;
    for (uint32_t i = 0; i < num_rounds; ++i) {
        evaluate_affine_pippenger_round(msm_data, i, affine_data, bucket_data, msm_result, bits_per_slice);
    }

    return msm_result;
}

template <typename Curve>
void MSM<Curve>::evaluate_jacobian_pippenger_round(MSMData& msm_data,
                                                   const uint32_t round_index,
                                                   MSM<Curve>::JacobianBucketAccumulators& bucket_data,
                                                   typename Curve::Element& msm_accumulator,
                                                   const uint32_t bits_per_slice) noexcept
{
    std::span<const uint32_t>& nonzero_scalar_indices = msm_data.scalar_indices;
    std::span<const ScalarField>& scalars = msm_data.scalars;
    std::span<const AffineElement>& points = msm_data.points;

    // Populate buckets using simple Jacobian accumulation
    const size_t size = nonzero_scalar_indices.size();
    for (size_t i = 0; i < size; ++i) {
        BB_ASSERT_DEBUG(nonzero_scalar_indices[i] < scalars.size());
        uint32_t bucket_index = get_scalar_slice(scalars[nonzero_scalar_indices[i]], round_index, bits_per_slice);
        BB_ASSERT_DEBUG(bucket_index < (1U << bits_per_slice));
        if (bucket_index > 0) {
            // Check bucket_exists because buckets aren't reset to infinity between rounds.
            // Resetting would require O(num_buckets) clears per round; using a bitmap is O(1) amortized.
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

template <typename Curve>
void MSM<Curve>::evaluate_affine_pippenger_round(MSMData& msm_data,
                                                 const uint32_t round_index,
                                                 MSM<Curve>::AffineAdditionData& affine_data,
                                                 MSM<Curve>::BucketAccumulators& bucket_data,
                                                 typename Curve::Element& msm_accumulator,
                                                 const uint32_t bits_per_slice) noexcept
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

    // Sort point schedule by bucket index for cache-efficient processing; also count zero-bucket entries to skip
    const size_t num_zero_entries =
        scalar_multiplication::sort_point_schedule_and_count_zero_buckets(&round_schedule[0], size, bits_per_slice);
    BB_ASSERT_DEBUG(num_zero_entries <= size);
    const size_t round_size = size - num_zero_entries;

    // Populate buckets using affine addition with batch inversion
    Element bucket_result = Curve::Group::point_at_infinity;
    if (round_size > 0) {
        std::span<uint64_t> point_schedule(&round_schedule[num_zero_entries], round_size);
        // Iterate through our point schedule and add points into corresponding buckets
        batch_accumulate_points_into_buckets(point_schedule, points, affine_data, bucket_data);
        bucket_result = accumulate_buckets(bucket_data);
        bucket_data.bucket_exists.clear();
    }

    // Accumulate into running total
    accumulate_round_result(msm_accumulator, bucket_result, round_index, bits_per_slice);
}

template <typename Curve>
void MSM<Curve>::accumulate_round_result(Element& msm_accumulator,
                                         const Element& bucket_result,
                                         uint32_t round_index,
                                         uint32_t bits_per_slice) noexcept
{
    const uint32_t num_rounds = (NUM_BITS_IN_FIELD + bits_per_slice - 1) / bits_per_slice;
    const bool is_last_round = (round_index == num_rounds - 1);
    const uint32_t remainder = NUM_BITS_IN_FIELD % bits_per_slice;

    // Last round may process fewer bits if NUM_BITS_IN_FIELD is not divisible by bits_per_slice
    uint32_t num_doublings = (is_last_round && remainder != 0) ? remainder : bits_per_slice;

    for (size_t i = 0; i < num_doublings; ++i) {
        msm_accumulator.self_dbl();
    }
    msm_accumulator += bucket_result;
}

template <typename Curve>
void MSM<Curve>::process_single_point(size_t bucket,
                                      const AffineElement* point_source,
                                      AffineAdditionData& affine_data,
                                      BucketAccumulators& bucket_data,
                                      size_t& scratch_it,
                                      size_t& point_it) noexcept
{
    bool has_accumulator = bucket_data.bucket_exists.get(bucket);
    if (has_accumulator) {
        affine_data.points_to_add[scratch_it] = *point_source;
        affine_data.points_to_add[scratch_it + 1] = bucket_data.buckets[bucket];
        bucket_data.bucket_exists.set(bucket, false);
        affine_data.addition_result_bucket_destinations[scratch_it >> 1] = static_cast<uint32_t>(bucket);
        scratch_it += 2;
    } else {
        bucket_data.buckets[bucket] = *point_source;
        bucket_data.bucket_exists.set(bucket, true);
    }
    point_it += 1;
}

template <typename Curve>
void MSM<Curve>::process_bucket_pair(size_t lhs_bucket,
                                     size_t rhs_bucket,
                                     const AffineElement* lhs_source,
                                     const AffineElement* rhs_source_if_match,
                                     AffineAdditionData& affine_data,
                                     BucketAccumulators& bucket_data,
                                     size_t& scratch_it,
                                     size_t& point_it) noexcept
{
    bool has_bucket_accumulator = bucket_data.bucket_exists.get(lhs_bucket);
    bool buckets_match = lhs_bucket == rhs_bucket;
    bool do_affine_add = buckets_match || has_bucket_accumulator;

    const AffineElement* rhs_source = buckets_match ? rhs_source_if_match : &bucket_data.buckets[lhs_bucket];

    AffineElement* lhs_destination =
        do_affine_add ? &affine_data.points_to_add[scratch_it] : &bucket_data.buckets[lhs_bucket];
    AffineElement* rhs_destination =
        do_affine_add ? &affine_data.points_to_add[scratch_it + 1] : &affine_data.null_location;

    uint32_t& dest_bucket = affine_data.addition_result_bucket_destinations[scratch_it >> 1];
    dest_bucket = do_affine_add ? static_cast<uint32_t>(lhs_bucket) : dest_bucket;

    *lhs_destination = *lhs_source;
    *rhs_destination = *rhs_source;

    bucket_data.bucket_exists.set(lhs_bucket, (has_bucket_accumulator && buckets_match) || !do_affine_add);
    scratch_it += do_affine_add ? 2 : 0;
    point_it += (do_affine_add && buckets_match) ? 2 : 1;
}

template <typename Curve>
void MSM<Curve>::batch_accumulate_points_into_buckets(std::span<const uint64_t> point_schedule,
                                                      std::span<const typename Curve::AffineElement> points,
                                                      MSM<Curve>::AffineAdditionData& affine_data,
                                                      MSM<Curve>::BucketAccumulators& bucket_data) noexcept
{
    BB_BENCH_NAME("batch_accumulate_points_into_buckets");

    size_t point_it = 0;
    size_t scratch_it = 0;
    const size_t num_points = point_schedule.size();
    const size_t prefetch_max = (num_points >= PREFETCH_LOOKAHEAD) ? (num_points - PREFETCH_LOOKAHEAD) : 0;
    const size_t end = (num_points > 0) ? (num_points - 1) : 0;

    // Iterative loop - continues until all points processed and no work remains in scratch space
    while (point_it < num_points || scratch_it != 0) {
        // Step 1: Fill scratch space with up to BATCH_SIZE/2 independent additions
        {
            BB_BENCH_NAME("fill_scratch_from_schedule");
            while (((scratch_it + 1) < AffineAdditionData::BATCH_SIZE) && (point_it < end)) {
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
        }

        // Handle the last point (odd count case) - separate to avoid bounds check on point_schedule[point_it + 1]
        if (point_it == num_points - 1) {
            PointScheduleEntry last{ point_schedule[point_it] };
            process_single_point(
                last.bucket_index(), &points[last.point_index()], affine_data, bucket_data, scratch_it, point_it);
        }

        // Compute independent additions using Montgomery's batch inversion trick
        size_t num_points_to_add = scratch_it;
        {
            BB_BENCH_NAME("batch_affine_addition");
            if (num_points_to_add >= 2) {
                add_affine_points(
                    &affine_data.points_to_add[0], num_points_to_add, &affine_data.inversion_scratch_space[0]);
            }
        }

        // add_affine_points stores results in the top-half of scratch space
        AffineElement* affine_output = &affine_data.points_to_add[0] + (num_points_to_add / 2);

        // Recirculate addition outputs back into scratch space or bucket accumulators
        size_t new_scratch_it = 0;
        size_t output_it = 0;
        size_t num_outputs = num_points_to_add / 2;

        {
            BB_BENCH_NAME("recirculate_affine_outputs");
            while ((output_it < (num_outputs - 1)) && (num_outputs > 0)) {
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
            if (output_it == (num_outputs - 1)) {
                uint32_t bucket = affine_data.addition_result_bucket_destinations[output_it];
                process_single_point(
                    bucket, &affine_output[output_it], affine_data, bucket_data, new_scratch_it, output_it);
            }
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

template <typename Curve>
typename Curve::AffineElement MSM<Curve>::msm(std::span<const typename Curve::AffineElement> points,
                                              PolynomialSpan<const ScalarField> scalars,
                                              bool handle_edge_cases) noexcept
{
    if (scalars.size() == 0) {
        return Curve::Group::affine_point_at_infinity;
    }
    BB_ASSERT_GTE(points.size(), scalars.start_index + scalars.size());

    // const_cast is safe: batch_multi_scalar_mul converts from Montgomery, then we convert back.
    // Scalars are unchanged from the caller's perspective.
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-const-cast)
    ScalarField* scalar_ptr = const_cast<ScalarField*>(&scalars[scalars.start_index]);
    const size_t num_scalars = scalars.size();

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
