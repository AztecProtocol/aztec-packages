#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class LogDerivLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3; // 5

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse construction sub-relation
        LENGTH  // log derivative lookup argument sub-relation
    };

    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        return (row.q_lookup == 1) || (row.lookup_read_tags == 1);
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

        const auto row_has_write = View(in.lookup_read_tags);
        const auto row_has_read = View(in.q_lookup);
        return row_has_write + row_has_read - (row_has_write * row_has_read);
    }

    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        return Accumulator(View(in.lookup_read_counts));
    }

    template <typename Accumulator, size_t read_index, typename AllEntities>
    static Accumulator compute_read_term_predicate(const AllEntities& in)

    {
        using View = typename Accumulator::View;

        return Accumulator(View(in.q_lookup));
    }

    template <typename Accumulator, size_t write_index, typename AllEntities>
    static Accumulator compute_write_term_predicate([[maybe_unused]] const AllEntities& in)
    {
        // using View = typename Accumulator::View;
        return Accumulator(1);
    }

    template <typename Accumulator, size_t write_index, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        static_assert(write_index < WRITE_TERMS);

        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;

        auto table_1 = View(in.table_1);
        auto table_2 = View(in.table_2);
        auto table_3 = View(in.table_3);
        auto table_4 = View(in.table_4);

        return table_1 + gamma + table_2 * beta + table_3 * beta_sqr + table_4 * beta_cube;
    }

    template <typename Accumulator, size_t read_index, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;

        const auto& gamma = params.gamma;
        const auto& beta = params.beta;
        const auto& beta_sqr = params.beta_sqr;
        const auto& beta_cube = params.beta_cube;

        auto w_1 = View(in.w_l);
        auto w_2 = View(in.w_r);
        auto w_3 = View(in.w_o);

        auto w_1_shift = View(in.w_l_shift);
        auto w_2_shift = View(in.w_r_shift);
        auto w_3_shift = View(in.w_o_shift);

        auto table_index = View(in.q_o);
        auto negative_column_1_step_size = View(in.q_r);
        auto negative_column_2_step_size = View(in.q_m);
        auto negative_column_3_step_size = View(in.q_c);

        // The wire values for lookup gates are accumulators structured in such a way that the differences w_i -
        // step_size*w_i_shift should result in a values that exists in table_i.
        auto derived_table_entry_1 = w_1 + negative_column_1_step_size * w_1_shift;
        auto derived_table_entry_2 = w_2 + negative_column_2_step_size * w_2_shift;
        auto derived_table_entry_3 = w_3 + negative_column_3_step_size * w_3_shift;

        // (w_1 + q_2*w_1_shift) + η(w_2 + q_m*w_2_shift) + η₂(w_3 + q_c*w_3_shift) + η₃q_index.
        // deg 2 or 3
        return derived_table_entry_1 + gamma + derived_table_entry_2 * beta + derived_table_entry_3 * beta_sqr +
               table_index * beta_cube;
    }

    /**
     * @brief Expression for ECCVM lookup tables.
     * @details We use log-derivative lookup tables for the following case:
     * Table writes: ECCVMPointTable columns: we define Straus point table:
     * { {0, -15[P]}, {1, -13[P]}, ..., {15, 15[P]} }
     * write source: { precompute_round, precompute_tx, precompute_ty }
     * Table reads: ECCVMMSM columns. Each row adds up to 4 points into MSM accumulator
     * read source: { msm_slice1, msm_x1, msm_y1 }, ..., { msm_slice4, msm_x4, msm_y4 }
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param relation_params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        accumulate_logderivative_lookup_subrelation_contributions<FF, LogDerivLookupRelationImpl<FF>>(
            accumulator, in, params, scaling_factor);
    }
};

template <typename FF> using LogDerivLookupRelation = Relation<LogDerivLookupRelationImpl<FF>>;

} // namespace bb
