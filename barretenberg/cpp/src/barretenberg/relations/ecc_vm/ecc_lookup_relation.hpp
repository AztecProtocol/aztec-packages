// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: 2a49eb6 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class ECCVMLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t NUM_LOOKUP_TERMS = 8;
    static constexpr size_t NUM_TABLE_TERMS = 4;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = NUM_LOOKUP_TERMS + NUM_TABLE_TERMS + 3; // 15

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // grand product construction sub-relation
        LENGTH  // left-shiftable polynomial sub-relation
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)

    {
        return (row.msm_add == 1) || (row.msm_skew == 1) || (row.precompute_select == 1);
    }

    /**
     * @brief Get the inverse lookup polynomial
     *
     * @tparam AllEntities
     * @param in
     * @return auto&
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in) { return in.lookup_inverses; }

    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        const auto row_has_write = View(in.precompute_select);
        const auto row_has_read = View(in.msm_add) + View(in.msm_skew);
        return row_has_write + row_has_read - (row_has_write * row_has_read);
    }

    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        if constexpr (index == 0) {
            return Accumulator(View(in.lookup_read_counts_0));
        }
        if constexpr (index == 1) {
            return Accumulator(View(in.lookup_read_counts_1));
        }
        if constexpr (index == 2) {
            return Accumulator(View(in.lookup_read_counts_2));
        }
        if constexpr (index == 3) {
            return Accumulator(View(in.lookup_read_counts_3));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t lookup_index, typename AllEntities>
    static Accumulator get_lookup_term_predicate(const AllEntities& in)

    {
        using View = typename Accumulator::View;

        if constexpr (lookup_index == 0) {
            return Accumulator(View(in.msm_add1));
        }
        if constexpr (lookup_index == 1) {
            return Accumulator(View(in.msm_add2));
        }
        if constexpr (lookup_index == 2) {
            return Accumulator(View(in.msm_add3));
        }
        if constexpr (lookup_index == 3) {
            return Accumulator(View(in.msm_add4));
        }
        if constexpr (lookup_index == 4) {
            return Accumulator(View(in.msm_add5));
        }
        if constexpr (lookup_index == 5) {
            return Accumulator(View(in.msm_add6));
        }
        if constexpr (lookup_index == 6) {
            return Accumulator(View(in.msm_add7));
        }
        if constexpr (lookup_index == 7) {
            return Accumulator(View(in.msm_add8));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t table_index, typename AllEntities>
    static Accumulator get_table_term_predicate(const AllEntities& in)
    {
        using View = typename Accumulator::View;
        // anytime `precompute_select` is on, we "turn on" the table predicate. This concretely means that the sP, where
        // s is a WNAF slice and P is the point being processed, are "written" to the lookup table, i.e., may be
        // read/looked up later.
        // table_index 0: point 1 positive WNAF entries
        // table_index 1: point 1 negative WNAF entries
        // table_index 2: point 2 positive WNAF entries
        // table_index 3: point 2 negative WNAF entries
        if constexpr (table_index < NUM_TABLE_TERMS) {
            return Accumulator(View(in.precompute_select));
        }
        return Accumulator(1);
    }
    /**
     * @brief Returns the fingerprint of `(precompute_pc, compressed_slice, (2 * compressed_slice - 15)[P])`, where [P]
     * is the point corresponding to `precompute_pc` and `compressed_slice`∈{0, ..., 15}.
     *
     * @details With 2 points per precompute row (tx/ty and tx2/ty2), we have 4 table terms:
     *   table_index 0: point 1 positive — slice = 15 - 2*round, covers {15,13,11,9}
     *   table_index 1: point 1 negative — slice = 2*round,      covers {0,2,4,6}
     *   table_index 2: point 2 positive — slice = 14 - 2*round, covers {14,12,10,8}
     *   table_index 3: point 2 negative — slice = 2*round + 1,  covers {1,3,5,7}
     *
     * Together these cover all 16 slice values {0, ..., 15}.
     *
     * Point 1 (tx, ty) at row round = table[15 - 2*round]:
     *   round 0: 15P, round 1: 13P [was 11P], round 2: 11P [was 7P], round 3: 9P [was 3P]
     * Point 2 (tx2, ty2) at row round = table[14 - 2*round]:
     *   round 0: 13P, round 1: 9P, round 2: 5P, round 3: P
     */
    template <typename Accumulator, size_t table_index, typename AllEntities, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(table_index < NUM_TABLE_TERMS);

        const auto& precompute_pc = View(in.precompute_pc);
        const auto& precompute_round = View(in.precompute_round);
        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;
        const auto precompute_round2 = precompute_round + precompute_round;

        if constexpr (table_index == 0) {
            // Point 1 positive: slice = 15 - 2*round
            const auto& tx = View(in.precompute_tx);
            const auto& ty = View(in.precompute_ty);
            const auto positive_slice_value = -(precompute_round2) + 15;
            return precompute_pc + gamma + positive_slice_value * beta + tx * beta_sqr + ty * beta_cube; // degree 1
        }
        if constexpr (table_index == 1) {
            // Point 1 negative: slice = 2*round
            const auto& tx = View(in.precompute_tx);
            const auto& ty = View(in.precompute_ty);
            return precompute_pc + gamma + precompute_round2 * beta + tx * beta_sqr - ty * beta_cube; // degree 1
        }
        if constexpr (table_index == 2) {
            // Point 2 positive: slice = 14 - 2*round
            const auto& tx2 = View(in.precompute_tx2);
            const auto& ty2 = View(in.precompute_ty2);
            const auto positive_slice_value2 = -(precompute_round2) + 14;
            return precompute_pc + gamma + positive_slice_value2 * beta + tx2 * beta_sqr + ty2 * beta_cube; // degree 1
        }
        if constexpr (table_index == 3) {
            // Point 2 negative: slice = 2*round + 1
            const auto& tx2 = View(in.precompute_tx2);
            const auto& ty2 = View(in.precompute_ty2);
            const auto negative_slice_value2 = precompute_round2 + 1;
            return precompute_pc + gamma + negative_slice_value2 * beta + tx2 * beta_sqr - ty2 * beta_cube; // degree 1
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t lookup_index, typename AllEntities, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        // read term: (pc, compressed_slice, (2 * compressed_slice - 15)[P])
        // (the latter term is of course represented via an x and y coordinate.)
        static_assert(lookup_index < NUM_LOOKUP_TERMS);
        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;
        const auto& msm_pc = View(in.msm_pc);
        const auto& msm_count = View(in.msm_count);

        // Recall that `pc` stands for point-counter. We recall how to compute the current pc.
        //
        // row pc = value of pc after msm
        // msm_count = number of (128-bit) multiplications processed so far in current MSM round (NOT INCLUDING current
        // row) current_pc = msm_pc - msm_count next_pc = current_pc - {0, 1, ..., 7}, depending on how many adds are
        // performed in the current row.
        const auto current_pc = msm_pc - msm_count;

        if constexpr (lookup_index == 0) {
            return (current_pc) + gamma + View(in.msm_slice1) * beta + View(in.msm_x1) * beta_sqr +
                   View(in.msm_y1) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 1) {
            return (current_pc - 1) + gamma + View(in.msm_slice2) * beta + View(in.msm_x2) * beta_sqr +
                   View(in.msm_y2) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 2) {
            return (current_pc - 2) + gamma + View(in.msm_slice3) * beta + View(in.msm_x3) * beta_sqr +
                   View(in.msm_y3) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 3) {
            return (current_pc - 3) + gamma + View(in.msm_slice4) * beta + View(in.msm_x4) * beta_sqr +
                   View(in.msm_y4) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 4) {
            return (current_pc - 4) + gamma + View(in.msm_slice5) * beta + View(in.msm_x5) * beta_sqr +
                   View(in.msm_y5) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 5) {
            return (current_pc - 5) + gamma + View(in.msm_slice6) * beta + View(in.msm_x6) * beta_sqr +
                   View(in.msm_y6) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 6) {
            return (current_pc - 6) + gamma + View(in.msm_slice7) * beta + View(in.msm_x7) * beta_sqr +
                   View(in.msm_y7) * beta_cube; // degree 1
        }
        if constexpr (lookup_index == 7) {
            return (current_pc - 7) + gamma + View(in.msm_slice8) * beta + View(in.msm_x8) * beta_sqr +
                   View(in.msm_y8) * beta_cube; // degree 1
        }
        return Accumulator(1);
    }

    /**
     * @brief Expression for ECCVM lookup tables.
     * @details We use log-derivative lookup tables for the following case:
     * Table writes: ECCVMPointTable columns: we define Straus point table:
     * { {0, -15[P]}, {1, -13[P]}, ..., {15, 15[P]} }
     * write source: { precompute_round, precompute_tx, precompute_ty }
     * Table reads: ECCVMMSM columns. Each row adds up to 8 points into MSM accumulator
     * read source: { msm_slice1, msm_x1, msm_y1 }, ..., { msm_slice8, msm_x8, msm_y8 }
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param relation_params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor);
};

template <typename FF> using ECCVMLookupRelation = Relation<ECCVMLookupRelationImpl<FF>>;

} // namespace bb
