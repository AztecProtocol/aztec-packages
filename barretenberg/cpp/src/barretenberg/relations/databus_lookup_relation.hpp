#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace bb {

template <typename FF_> class DatabusLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse polynomial correctness subrelation
        LENGTH  // log-derivative lookup argument subrelation
    };

    // The second subrelation is "linearly dependant" in the sense that it establishes the value of a sum across the
    // entire execution trace rather than a per-row identity.
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    /**
     * @brief Determine whether the inverse I needs to be computed at a given row
     * @details The value of the inverse polynomial I(X) only needs to be computed when the databus lookup gate is
     * "active". Otherwise it is set to 0. This method allows for determination of when the inverse should be computed.
     *
     * @tparam AllValues
     * @param row
     * @return true
     * @return false
     */
    template <typename AllValues> static bool operation_exists_at_row(const AllValues& row)
    {
        bool is_read_gate = row.q_busread == 1 && row.q_l == 1;
        return (is_read_gate || row.calldata_read_counts > 0);
    }

    /**
     * @brief Get the lookup inverse polynomial
     *
     * @tparam AllEntities
     * @param in
     * @return auto&
     */
    template <typename AllEntities> static auto& get_inverse_polynomial(AllEntities& in) { return in.lookup_inverses; }

    /**
     * @brief Compute the Accumulator whose values indicate whether the inverse is computed or not
     * @details This is needed for efficiency since we don't need to compute the inverse unless the log derivative
     * lookup relation is active at a given row.
     *
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;
        // WORKTODO(luke): row_has_read should really be a boolean object thats equal to 1 when counts > 0 and 0
        // otherwise. This current structure will lead to failure if call_data_read_counts > 1.
        auto q_busread = View(in.q_busread);
        auto q_1 = View(in.q_l);
        const auto is_read_gate = q_busread * q_1;
        const auto is_read_data = View(in.calldata_read_counts);

        return is_read_gate + is_read_data - (is_read_gate * is_read_data);
    }

    template <typename Accumulator, typename AllEntities> static Accumulator get_read_counts(const AllEntities& in)
    {
        using View = typename Accumulator::View;
        return Accumulator(View(in.calldata_read_counts));
    }

    /**
     * @brief Compute scalar for read term in log derivative lookup argument
     *
     */
    template <typename Accumulator, typename AllEntities>
    static Accumulator get_read_selector([[maybe_unused]] const AllEntities& in)

    {
        using View = typename Accumulator::View;
        auto q_busread = View(in.q_busread);
        auto q_1 = View(in.q_l);

        auto result = q_busread * q_1;

        return result;
    }

    /**
     * @brief Compute write term denominator in log derivative lookup argument
     *
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        const auto& calldata = View(in.calldata);
        const auto& id = View(in.databus_id);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);

        // Construct b_i + idx_i*\beta + \gamma
        return calldata + gamma + id * beta; // degree 1
    }

    /**
     * @brief Compute read term denominator in log derivative lookup argument
     *
     */
    template <typename Accumulator, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        // Bus value stored in w_1, index into bus column stored in w_2
        const auto& w_1 = View(in.w_l);
        const auto& w_2 = View(in.w_r);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);

        // Construct value + index*\beta + \gamma
        return w_1 + gamma + w_2 * beta;
    }

    template <typename Polynomials>
    static void compute_logderivative_inverse(Polynomials& polynomials,
                                              auto& relation_parameters,
                                              const size_t circuit_size)
    {
        auto& inverse_polynomial = get_inverse_polynomial(polynomials);
        for (size_t i = 0; i < circuit_size; ++i) {
            auto row = polynomials.get_row(i);
            // We only compute the inverse if this row contains a read gate or data that has been read
            if (operation_exists_at_row(row)) {
                inverse_polynomial[i] =
                    compute_read_term<FF>(row, relation_parameters) * compute_write_term<FF>(row, relation_parameters);
            }
        }
        // WORKTODO: turn this note from Zac into a genuine TODO
        // todo might be inverting zero in field bleh bleh
        FF::batch_invert(inverse_polynomial);
    };

    template <typename FF, typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate_subrelation_contributions(ContainerOverSubrelations& accumulator,
                                                     const AllEntities& in,
                                                     const Parameters& params,
                                                     const FF& scaling_factor)
    {
        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        const auto lookup_inverses = View(get_inverse_polynomial(in));
        const auto read_term = compute_read_term<Accumulator>(in, params);
        const auto write_term = compute_write_term<Accumulator>(in, params);
        const auto inverse_exists = compute_inverse_exists<Accumulator>(in);
        const auto write_inverse = lookup_inverses * read_term;
        const auto read_inverse = lookup_inverses * write_term;

        // Establish the correctness of the polynomial of inverses I. Note: lookup_inverses is computed so that the
        // value is 0 if !inverse_exists
        std::get<0>(accumulator) += (read_term * write_term * lookup_inverses - inverse_exists) * scaling_factor;

        // Establish the validity of the read.
        std::get<1>(accumulator) +=
            get_read_selector<Accumulator>(in) * read_inverse - (get_read_counts<Accumulator>(in) * write_inverse);
    }

    /**
     * @brief Accumulate the contribution from two surelations for the log derivative databus lookup argument
     * @details See logderivative_library.hpp for details of the generic log-derivative lookup argument
     *
     * @param accumulator transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Accumulator edges.
     * @param params contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities, typename Parameters>
    static void accumulate(ContainerOverSubrelations& accumulator,
                           const AllEntities& in,
                           const Parameters& params,
                           const FF& scaling_factor)
    {
        accumulate_subrelation_contributions<FF>(accumulator, in, params, scaling_factor);
    }
};

template <typename FF> using DatabusLookupRelation = Relation<DatabusLookupRelationImpl<FF>>;

} // namespace bb
