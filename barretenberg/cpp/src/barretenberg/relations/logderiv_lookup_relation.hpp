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
        using ParameterView = GetParameterView<Parameters, View>;

        static_assert(write_index < WRITE_TERMS);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        const auto& beta_sqr = ParameterView(params.beta_sqr);
        const auto& beta_cube = ParameterView(params.beta_cube);

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
        using ParameterView = GetParameterView<Parameters, View>;

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);
        const auto& beta_sqr = ParameterView(params.beta_sqr);
        const auto& beta_cube = ParameterView(params.beta_cube);

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
        auto derived_table_entry_1 = w_1 + gamma + negative_column_1_step_size * w_1_shift;
        auto derived_table_entry_2 = w_2 + negative_column_2_step_size * w_2_shift;
        auto derived_table_entry_3 = w_3 + negative_column_3_step_size * w_3_shift;

        // (w_1 + q_2*w_1_shift) + η(w_2 + q_m*w_2_shift) + η₂(w_3 + q_c*w_3_shift) + η₃q_index.
        // deg 2 or 3
        return derived_table_entry_1 + derived_table_entry_2 * beta + derived_table_entry_3 * beta_sqr +
               table_index * beta_cube;
    }

    /**
     * @brief WORKTODO
     *
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
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto inverses = View(in.lookup_inverses);                         // Degree 1
        const auto read_counts = View(in.lookup_read_counts);                   // Degree 1
        const auto read_selector = View(in.q_lookup);                           // Degree 1
        const auto inverse_exists = compute_inverse_exists<Accumulator>(in);    // Degree 1
        const auto read_term = compute_read_term<Accumulator, 0>(in, params);   // Degree 1
        const auto write_term = compute_write_term<Accumulator, 0>(in, params); // Degree 1
        const auto write_inverse = inverses * read_term;                        // Degree 2
        const auto read_inverse = inverses * write_term;                        // Degree 2

        // Establish the correctness of the polynomial of inverses I. Note: inverses is computed so that the value is 0
        // if !inverse_exists. Degree 3
        std::get<0>(accumulator) += (read_term * write_term * inverses - inverse_exists) * scaling_factor;

        // Establish validity of the read. Note: no scaling factor here since this constraint is enforced across the
        // entire trace, not on a per-row basis
        std::get<1>(accumulator) += read_selector * read_inverse - read_counts * write_inverse; // Degree 4

        // ******************
        // accumulate_logderivative_lookup_subrelation_contributions<FF, LogDerivLookupRelationImpl<FF>>(
        //     accumulator, in, params, scaling_factor);
    }
};

template <typename FF> using LogDerivLookupRelation = Relation<LogDerivLookupRelationImpl<FF>>;

} // namespace bb
