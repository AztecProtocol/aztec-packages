#pragma once
#include <array>
#include <tuple>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/relations/relation_types.hpp"

namespace proof_system {

template <typename FF_> class DatabusLookupRelationImpl {
  public:
    using FF = FF_;
    static constexpr size_t READ_TERMS = 1;
    static constexpr size_t WRITE_TERMS = 1;
    // 1 + polynomial degree of this relation
    // WORKTODO
    static constexpr size_t LENGTH = READ_TERMS + WRITE_TERMS + 3;

    static constexpr std::array<size_t, 2> SUBRELATION_PARTIAL_LENGTHS{
        LENGTH, // inverse polynomial correctness subrelation
        LENGTH  // log-derivative lookup argument subrelation
    };

    // The second subrelation is "linearly dependant" in the sense that it establishes the value of a sum across the
    // entire execution trace rather than a per-row identity.
    static constexpr std::array<bool, 2> SUBRELATION_LINEARLY_INDEPENDENT = { true, false };

    template <typename AllValues> static bool lookup_exists_at_row(const AllValues& row)
    {
        return (row.q_busread == 1 || row.calldata_read_counts > 0);
    }

    template <typename Accumulator, typename AllEntities>
    static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        using View = typename Accumulator::View;
        // WORKTODO: really what we need instead of calldata_read_counts is a boolean equivalent that says > 0 counts or
        // not.. or possibly just "is this a row in the calldata"
        return Accumulator(View(in.q_busread) + View(in.calldata_read_counts));
    }

    template <typename Accumulator, size_t index, typename AllEntities>
    static Accumulator lookup_read_counts(const AllEntities& in)
    {
        using View = typename Accumulator::View;

        if constexpr (index == 0) {
            return Accumulator(View(in.calldata_read_counts));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t read_index, typename AllEntities>
    static Accumulator compute_read_term_predicate([[maybe_unused]] const AllEntities& in)

    {
        using View = typename Accumulator::View;

        if constexpr (read_index == 0) {
            return Accumulator(View(in.q_busread));
        }
        return Accumulator(1);
    }

    template <typename Accumulator, size_t write_index, typename AllEntities>
    static Accumulator compute_write_term_predicate(const AllEntities& /*unused*/)
    {
        return Accumulator(1);
    }

    template <typename Accumulator, size_t write_index, typename AllEntities, typename Parameters>
    static Accumulator compute_write_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        static_assert(write_index < WRITE_TERMS);

        const auto& calldata = View(in.calldata);
        const auto& id = View(in.databus_id);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);

        // Construct b_i + idx_i*\beta + \gamma
        if constexpr (write_index == 0) {
            return calldata + gamma + id * beta; // degree 1
        }

        return Accumulator(1);
    }

    template <typename Accumulator, size_t read_index, typename AllEntities, typename Parameters>
    static Accumulator compute_read_term(const AllEntities& in, const Parameters& params)
    {
        using View = typename Accumulator::View;
        using ParameterView = GetParameterView<Parameters, View>;

        static_assert(read_index < READ_TERMS);

        // Bus value stored in w_1, index into bus column stored in w_2
        const auto& w_1 = View(in.w_l);
        const auto& w_2 = View(in.w_r);

        const auto& gamma = ParameterView(params.gamma);
        const auto& beta = ParameterView(params.beta);

        // const auto read_term1 = w_1 + gamma + w_2 * beta; // degree 1

        // Construct value + index*\beta + \gamma
        if constexpr (read_index == 0) {
            return w_1 + gamma + w_2 * beta;
        }

        return Accumulator(1);
    }

    /**
     * @brief
     * @details
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

        using Accumulator = typename std::tuple_element_t<0, ContainerOverSubrelations>;
        using View = typename Accumulator::View;

        auto lookup_inverses = View(in.lookup_inverses);

        constexpr size_t NUM_TOTAL_TERMS = READ_TERMS + WRITE_TERMS;
        std::array<Accumulator, NUM_TOTAL_TERMS> lookup_terms;
        std::array<Accumulator, NUM_TOTAL_TERMS> denominator_accumulator;

        // The lookup relation = \sum_j (1 / read_term[j]) - \sum_k (read_counts[k] / write_term[k])
        // To get the inverses (1 / read_term[i]), (1 / write_term[i]), we have a commitment to the product of all
        // inverses i.e. lookup_inverse = \prod_j (1 / read_term[j]) * \prod_k (1 / write_term[k]) The purpose of this
        // next section is to derive individual inverse terms using `lookup_inverses` i.e. (1 / read_term[i]) =
        // lookup_inverse * \prod_{j /ne i} (read_term[j]) * \prod_k (write_term[k])
        //      (1 / write_term[i]) = lookup_inverse * \prod_j (read_term[j]) * \prod_{k ne i} (write_term[k])
        barretenberg::constexpr_for<0, READ_TERMS, 1>(
            [&]<size_t i>() { lookup_terms[i] = compute_read_term<Accumulator, i>(in, params); });
        barretenberg::constexpr_for<0, WRITE_TERMS, 1>(
            [&]<size_t i>() { lookup_terms[i + READ_TERMS] = compute_write_term<Accumulator, i>(in, params); });

        barretenberg::constexpr_for<0, NUM_TOTAL_TERMS, 1>(
            [&]<size_t i>() { denominator_accumulator[i] = lookup_terms[i]; });

        barretenberg::constexpr_for<0, NUM_TOTAL_TERMS - 1, 1>(
            [&]<size_t i>() { denominator_accumulator[i + 1] *= denominator_accumulator[i]; });

        auto inverse_accumulator = Accumulator(lookup_inverses); // denominator_accumulator[NUM_TOTAL_TERMS - 1];

        const auto inverse_exists = compute_inverse_exists<Accumulator>(in);

        std::get<0>(accumulator) +=
            (denominator_accumulator[NUM_TOTAL_TERMS - 1] * lookup_inverses - inverse_exists) * scaling_factor;

        // After this algo, total degree of denominator_accumulator = NUM_TOTAL_TERMS
        for (size_t i = 0; i < NUM_TOTAL_TERMS - 1; ++i) {
            denominator_accumulator[NUM_TOTAL_TERMS - 1 - i] =
                denominator_accumulator[NUM_TOTAL_TERMS - 2 - i] * inverse_accumulator;
            inverse_accumulator = inverse_accumulator * lookup_terms[NUM_TOTAL_TERMS - 1 - i];
        }
        denominator_accumulator[0] = inverse_accumulator;

        // auto read_result = denominator_accumulator[0] * compute_read_term<Accumulator, 0>(in, params);
        // info(read_result);
        // auto write_result = denominator_accumulator[1] * compute_write_term<Accumulator, 0>(in, params);
        // info(write_result);
        // info(denominator_accumulator[1]);

        // each predicate is degree-1
        // degree of relation at this point = NUM_TOTAL_TERMS + 1
        barretenberg::constexpr_for<0, READ_TERMS, 1>([&]<size_t i>() {
            std::get<1>(accumulator) += compute_read_term_predicate<Accumulator, i>(in) * denominator_accumulator[i];
        });

        // each predicate is degree-1, `lookup_read_counts` is degree-1
        // degree of relation = NUM_TOTAL_TERMS + 2
        barretenberg::constexpr_for<0, WRITE_TERMS, 1>([&]<size_t i>() {
            const auto p = compute_write_term_predicate<Accumulator, i>(in);
            const auto lookup_read_count = lookup_read_counts<Accumulator, i>(in);
            std::get<1>(accumulator) -= p * (denominator_accumulator[i + READ_TERMS] * lookup_read_count);
        });
    }
};

template <typename FF> using DatabusLookupRelation = Relation<DatabusLookupRelationImpl<FF>>;

} // namespace proof_system
