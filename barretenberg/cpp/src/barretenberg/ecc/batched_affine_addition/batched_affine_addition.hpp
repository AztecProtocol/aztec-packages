// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <cstddef>
#include <cstdint>

namespace bb {

/**
 * @brief Class for handling fast batched affine addition of large sets of EC points
 * @brief Useful for pre-reducing the SRS points via summation for commitments to polynomials with large ranges of
 * constant coefficients.
 *
 * @tparam Curve
 */
template <typename Curve> class BatchedAffineAddition {
    using G1 = typename Curve::AffineElement;
    using Fr = typename Curve::ScalarField;
    using Fq = typename Curve::BaseField;

    // Struct describing a set of points to be reduced to num-sequence-counts-many points via summation of each sequence
    struct AdditionSequences {
        std::vector<size_t> sequence_counts;
        std::span<G1> points;
        std::span<Fq> scratch_space;
    };

    // Collection of addition sequences to be handled by each thread
    struct ThreadData {
        std::vector<AdditionSequences> addition_sequences;
        std::vector<std::vector<size_t>> sequence_tags; // allows for the recombining of sequences split across threads
    };

  public:
    /**
     * @brief Given a set of points and sequence counts, peform addition to reduce each sequence to a single point
     * @details Reduce each sequence to a single point via repeated rounds of pairwise addition. (If the length
     * of the sequence is odd in a given round, the unpaired point is simply carried over to the next round). The
     * inverses needed in the addition formula are batch computed in a single go for all additions to be performed
     * across all sequences in a given round.
     * @note: Multithreading is achieved by evenly distributing the points across the optimal number of available
     * threads. This can result in the bisecting of some sequences which is acounted for in the final result by further
     * summing the reduced points that resulted from a sequence split across two or more threads. An example with two
     * threads and three add sequences:
     *
     *                     |------------------------| Points
     *                     |------------|-----------| Thread boundaries
     *                     |---|-----------|--------| Addition sequence boundaries
     *                     |---|--------|---|-------| New addition sequence boundaries
     *                     | 0 |    1   | 1 |   2   | Tags
     *
     * Each thread recieves two add sequences and reduces them to two points. The resulting four points are further
     * reduced to three by summing points that share a sequence tag.
     *
     * @param points Set of points to be reduced in place to num-sequences many points
     * @param sequence_counts lengths of the individual sequences to be summed (assumed continguous in points)
     * @return std::vector<G1> the set of reduced points in contiguous memory
     */
    static std::vector<G1> add_in_place(const std::span<G1>& points, const std::vector<size_t>& sequence_counts);

  private:
    /**
     * @brief Construct the set of AdditionSequences to be handled by each thread
     * @details To optimize thread utilization, points are distributed evenly across the number of available threads.
     * This may in general result in the splitting of individual addition sequences across two or more threads. This is
     * accounted for by assigning a tag to each sequence so that the results can be further combined post-facto to
     * ensure that the final number of points corresponds to the number of addition sequences.
     *
     * @param points
     * @param sequence_counts
     * @param scratch_space Space for computing and storing the point addition slope denominators
     * @return ThreadData
     */
    static ThreadData construct_thread_data(const std::span<G1>& points,
                                            const std::vector<size_t>& sequence_counts,
                                            const std::span<Fq>& scratch_space);

    /**
     * @brief Batch compute inverses needed for a set of affine point addition sequences
     * @details Addition of points P_1, P_2 requires computation of a term of the form 1/(P_2.x - P_1.x). For
     * efficiency, these terms are computed all at once for a full set of addition sequences using batch inversion.
     *
     * @tparam Curve
     * @param add_sequences
     */
    static std::span<Fq> batch_compute_point_addition_slope_inverses(const AdditionSequences& add_sequences);

    /**
     * @brief Internal method for in-place summation of a single set of addition sequences
     *
     * @tparam Curve
     * @param addition_sequences Set of points and counts indicating number of points in each addition chain
     */
    static void batched_affine_add_in_place(AdditionSequences add_sequences);

    /**
     * @brief Add two affine elements with the inverse in the slope term \lambda provided as input
     * @details The sum of two points (x1, y1), (x2, y2) is given by x3 = \lambda^2 - x1 - x2, y3 = \lambda*(x1 - x3) -
     * y1, where \lambda  = (y2 - y1)/(x2 - x1). When performing many additions at once, it is more efficient to batch
     * compute the inverse component of \lambda for each pair of points. This gives rise to the need for a method like
     * this one.
     *
     * @tparam Curve
     * @param point_1 (x1, y1)
     * @param point_2 (x2, y2)
     * @param denominator 1/(x2 - x1)
     * @return Curve::AffineElement
     */
    static inline G1 affine_add_with_denominator(const G1& point_1, const G1& point_2, const Fq& denominator)
    {
        const auto& x1 = point_1.x;
        const auto& y1 = point_1.y;
        const auto& x2 = point_2.x;
        const auto& y2 = point_2.y;

        const Fq lambda = denominator * (y2 - y1);
        Fq x3 = lambda.sqr() - x2 - x1;
        Fq y3 = lambda * (x1 - x3) - y1;
        return { x3, y3 };
    }
};

} // namespace bb
