#pragma once

#include "./runtime_states.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>
#include <cstdint>

namespace bb::scalar_multiplication {

constexpr size_t get_num_buckets(const size_t num_points)
{
    const size_t bits_per_bucket = get_optimal_bucket_width(num_points / 2);
    return 1UL << bits_per_bucket;
}

/**
 * pointers that describe how to add points into buckets, for the pippenger algorithm.
 * `wnaf_table` is an unrolled two-dimensional array, with each inner array being of size `n`,
 * where `n` is the number of points being multiplied. The second dimension size is defined by
 * the number of pippenger rounds (fixed for a given `n`, see `get_num_rounds`)
 *
 * An entry of `wnaf_table` contains the following three pieces of information:
 * 1: the point index that we're working on. This is stored in the high 32 bits
 * 2: the bucket index that we're adding the point into. This is stored in the low 31 bits
 * 3: the sign of the point we're adding (i.e. do we actually need to subtract). This is stored in the 31nd bit (the
 *lowest bit is considered 0th).
 *
 * We pack this information into a 64 bit unsigned integer, so that we can more efficiently sort our wnaf entries.
 * For a given round, we want to sort our wnaf entries in increasing bucket index order.
 *
 * This is so that we can efficiently use multiple threads to execute the pippenger algorithm.
 * For a given round, a given point's bucket index will be uniformly randomly distributed,
 * assuming the inputs are from a zero-knowledge proof. This is because the scalar multiplier will be uniformly randomly
 *distributed, and the bucket indices are derived from the scalar multiplier.
 *
 * This means that, if we were to iterate over all of our points in order, and add each point into its associated
 *bucket, we would be accessing all of our buckets in a completely random pattern.
 *
 * Aside from memory latency problems this incurs, this makes the naive algorithm unsuitable for multithreading - we
 *cannot assign a thread a tranche of points, because each thread will be adding points into the same set of buckets,
 *triggering race conditions. We do not want to manage the overhead of thread locks for each bucket; the process of
 *adding a point into a bucket takes, on average, only 400 CPU cycles, so the slowdown of managing mutex locks would add
 *considerable overhead.
 *
 * The solution is to sort the buckets. If the buckets are sorted, we can assign a tranche of buckets to individual
 *threads, safe in the knowledge that there will be no race conditions, with one condition. A thread's starting bucket
 *may be equal to the previous thread's end bucket, so we need to ensure that each thread works on a local array of
 *buckets. This adds little overhead (for 2^20 points, we have 32,768 buckets. With 8 threads, the amount of bucket
 *overlap is ~16 buckets, so we could incur 16 extra 'additions' in pippenger's bucket concatenation phase, but this is
 *an insignificant contribution).
 *
 * The alternative approach (the one we used to use) is to slice up all of the points being multiplied amongst all
 *available threads, and run the complete pippenger algorithm for each thread. This is suboptimal, because the
 *complexity of pippenger is O(n / logn) point additions, and a sequence of smaller pippenger calls will have a smaller
 *`n`.
 *
 * This is the motivation for multi-threading the actual Pippenger algorithm. In addition, the above approach performs
 *extremely poorly for GPUs, where the number of threads can be as high as 2^10 (for a multi-scalar-multiplication of
 *2^20 points, this doubles the number of pippenger rounds per thread)
 *
 * To give concrete numbers, the difference between calling pippenger on 2^20 points, and calling pippenger 8 times on
 *2^17 points, is 5-10%. Which means that, for 8 threads, we need to ensure that our sorting algorithm adds less than 5%
 *to the total runtime of pippenger. Given a single cache miss per point would increase the run-time by 25%, this is not
 *much room to work with!
 *
 * However, a radix sort, combined with the fact that the total number of buckets is quite small (2^16 at most), seems
 *to be fast enough. Benchmarks indicate (i7-8650U, 8 threads) that, for 2^20 points, the total runtime is <1200ms and
 *of that, the radix sort consumes 58ms (4.8%)
 *
 * One advantage of sorting by bucket order vs point order, is that a 'bucket' is 96 bytes large (sizeof(g1::element),
 *buckets have z-coordinates). Points, on the other hand, are 64 bytes large (affine points, no z-coordinate). This
 *makes fetching random point locations in memory more efficient than fetching random bucket locations, as each point
 *occupies a single cache line. Using __builtin_prefetch to recover the point just before it's needed, seems to improve
 *the runtime of pippenger by 10-20%.
 *
 * Finally, `skew_table` tracks whether a scalar multplier is even or odd
 * (if it's even, we need to subtract the point from the total result,
 * because our windowed non-adjacent form values can only be odd)
 *
 **/

template <typename Curve> struct multiplication_thread_state {
    typename Curve::Element* buckets;
    const uint64_t* point_schedule;
};

template <typename Curve>
void compute_wnaf_states(uint64_t* point_schedule,
                         bool* input_skew_table,
                         uint64_t* round_counts,
                         const typename Curve::ScalarField* scalars,
                         size_t num_initial_points);

template <typename Curve>
void generate_pippenger_point_table(typename Curve::AffineElement* points,
                                    typename Curve::AffineElement* table,
                                    size_t num_points);

void organize_buckets(uint64_t* point_schedule, size_t num_points);

inline void count_bits(const uint32_t* bucket_counts,
                       uint32_t* bit_offsets,
                       const uint32_t num_buckets,
                       const size_t num_bits)
{
    for (size_t i = 0; i < num_buckets; ++i) {
        const uint32_t count = bucket_counts[i];
        for (uint32_t j = 0; j < num_bits; ++j) {
            bit_offsets[j + 1] += (count & (1U << j));
        }
    }
    bit_offsets[0] = 0;
    for (size_t i = 2; i < num_bits + 1; ++i) {
        bit_offsets[i] += bit_offsets[i - 1];
    }
}

template <typename Curve>
uint32_t construct_addition_chains(affine_product_runtime_state<Curve>& state, bool empty_bucket_counts = true);

template <typename Curve>
void add_affine_points(typename Curve::AffineElement* points,
                       size_t num_points,
                       typename Curve::BaseField* scratch_space);

template <typename Curve>
void add_affine_points_with_edge_cases(typename Curve::AffineElement* points,
                                       size_t num_points,
                                       typename Curve::BaseField* scratch_space);

template <typename Curve>
void evaluate_addition_chains(affine_product_runtime_state<Curve>& state,
                              size_t max_bucket_bits,
                              bool handle_edge_cases);
template <typename Curve>
typename Curve::Element pippenger_internal(typename Curve::AffineElement* points,
                                           typename Curve::ScalarField* scalars,
                                           size_t num_initial_points,
                                           pippenger_runtime_state<Curve>& state,
                                           bool handle_edge_cases);

template <typename Curve>
typename Curve::Element evaluate_pippenger_rounds(pippenger_runtime_state<Curve>& state,
                                                  typename Curve::AffineElement* points,
                                                  size_t num_points,
                                                  bool handle_edge_cases = false);

template <typename Curve>
typename Curve::AffineElement* reduce_buckets(affine_product_runtime_state<Curve>& state,
                                              bool first_round = true,
                                              bool handle_edge_cases = false);

template <typename Curve>
typename Curve::Element pippenger(typename Curve::ScalarField* scalars,
                                  typename Curve::AffineElement* points,
                                  size_t num_initial_points,
                                  pippenger_runtime_state<Curve>& state,
                                  bool handle_edge_cases = true);

template <typename Curve>
typename Curve::Element pippenger_unsafe(typename Curve::ScalarField* scalars,
                                         typename Curve::AffineElement* points,
                                         size_t num_initial_points,
                                         pippenger_runtime_state<Curve>& state);

template <typename Curve>
typename Curve::Element pippenger_without_endomorphism_basis_points(typename Curve::ScalarField* scalars,
                                                                    typename Curve::AffineElement* points,
                                                                    size_t num_initial_points,
                                                                    pippenger_runtime_state<Curve>& state);

// Explicit instantiation
// BN254

} // namespace bb::scalar_multiplication
