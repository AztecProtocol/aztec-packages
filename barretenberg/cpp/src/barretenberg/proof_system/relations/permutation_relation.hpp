#pragma once
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system {

template <typename FF_> class UltraPermutationRelationImpl {
  public:
    using FF = FF_;

    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 6;

    static constexpr std::array<size_t, 2> LENGTHS{
        6, // grand product construction sub-relation
        3  // left-shiftable polynomial sub-relation
    };

    static constexpr size_t LEN_1 = 6; // grand product construction sub-relation
    static constexpr size_t LEN_2 = 3; // left-shiftable polynomial sub-relation
    template <template <size_t...> typename SubrelationAccumulatorsTemplate>
    using GetAccumulatorTypes = SubrelationAccumulatorsTemplate<LEN_1, LEN_2>;
    template <typename T> using GetAccumulator0 = typename std::tuple_element<0, typename T::Accumulators>::type;

    inline static auto& get_grand_product_polynomial(auto& input) { return input.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& input) { return input.z_perm_shift; }

    template <typename AccumulatorTypes>
    inline static GetAccumulator0<AccumulatorTypes> compute_grand_product_numerator(
        const auto& input, const RelationParameters<FF>& relation_parameters)
    {
        using View = typename std::tuple_element_t<0, typename AccumulatorTypes::AccumulatorViews>;

        auto w_1 = View(input.w_l);
        auto w_2 = View(input.w_r);
        auto w_3 = View(input.w_o);
        auto w_4 = View(input.w_4);
        auto id_1 = View(input.id_1);
        auto id_2 = View(input.id_2);
        auto id_3 = View(input.id_3);
        auto id_4 = View(input.id_4);

        const auto& beta = relation_parameters.beta;
        const auto& gamma = relation_parameters.gamma;

        return (w_1 + id_1 * beta + gamma) * (w_2 + id_2 * beta + gamma) * (w_3 + id_3 * beta + gamma) *
               (w_4 + id_4 * beta + gamma);
    }

    template <typename Accumulator>
    inline static Accumulator new_compute_grand_product_numerator(const auto& input,
                                                                  const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto w_1 = View(input.w_l);
        auto w_2 = View(input.w_r);
        auto w_3 = View(input.w_o);
        auto w_4 = View(input.w_4);
        auto id_1 = View(input.id_1);
        auto id_2 = View(input.id_2);
        auto id_3 = View(input.id_3);
        auto id_4 = View(input.id_4);

        const auto& beta = relation_parameters.beta;
        const auto& gamma = relation_parameters.gamma;

        return (w_1 + id_1 * beta + gamma) * (w_2 + id_2 * beta + gamma) * (w_3 + id_3 * beta + gamma) *
               (w_4 + id_4 * beta + gamma);
    }
    template <typename AccumulatorTypes>
    inline static GetAccumulator0<AccumulatorTypes> compute_grand_product_denominator(
        const auto& input, const RelationParameters<FF>& relation_parameters)
    {
        using View = typename std::tuple_element_t<0, typename AccumulatorTypes::AccumulatorViews>;

        auto w_1 = View(input.w_l);
        auto w_2 = View(input.w_r);
        auto w_3 = View(input.w_o);
        auto w_4 = View(input.w_4);

        auto sigma_1 = View(input.sigma_1);
        auto sigma_2 = View(input.sigma_2);
        auto sigma_3 = View(input.sigma_3);
        auto sigma_4 = View(input.sigma_4);

        const auto& beta = relation_parameters.beta;
        const auto& gamma = relation_parameters.gamma;

        return (w_1 + sigma_1 * beta + gamma) * (w_2 + sigma_2 * beta + gamma) * (w_3 + sigma_3 * beta + gamma) *
               (w_4 + sigma_4 * beta + gamma);
    }

    template <typename Accumulator>
    inline static Accumulator new_compute_grand_product_denominator(const auto& input,
                                                                    const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto w_1 = View(input.w_l);
        auto w_2 = View(input.w_r);
        auto w_3 = View(input.w_o);
        auto w_4 = View(input.w_4);

        auto sigma_1 = View(input.sigma_1);
        auto sigma_2 = View(input.sigma_2);
        auto sigma_3 = View(input.sigma_3);
        auto sigma_4 = View(input.sigma_4);

        const auto& beta = relation_parameters.beta;
        const auto& gamma = relation_parameters.gamma;

        return (w_1 + sigma_1 * beta + gamma) * (w_2 + sigma_2 * beta + gamma) * (w_3 + sigma_3 * beta + gamma) *
               (w_4 + sigma_4 * beta + gamma);
    }

    /**
     * @brief Compute contribution of the permutation relation for a given edge (internal function)
     *
     * @details This the relation confirms faithful calculation of the grand
     * product polynomial Z_perm.
     *
     * @param evals transformed to `evals + C(extended_edges(X)...)*scaling_factor`
     * @param extended_edges an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename AccumulatorTypes>
    inline static void accumulate(typename AccumulatorTypes::Accumulators& accumulators,
                                  const auto& extended_edges,
                                  const RelationParameters<FF>& relation_parameters,
                                  const FF& scaling_factor)
    {
        const auto& public_input_delta = relation_parameters.public_input_delta;

        // Contribution (1)
        {
            using View = typename std::tuple_element<0, typename AccumulatorTypes::AccumulatorViews>::type;
            auto z_perm = View(extended_edges.z_perm);
            auto z_perm_shift = View(extended_edges.z_perm_shift);
            auto lagrange_first = View(extended_edges.lagrange_first);
            auto lagrange_last = View(extended_edges.lagrange_last);

            // Contribution (1)
            std::get<0>(accumulators) +=
                (((z_perm + lagrange_first) *
                  compute_grand_product_numerator<AccumulatorTypes>(extended_edges, relation_parameters)) -
                 ((z_perm_shift + lagrange_last * public_input_delta) *
                  compute_grand_product_denominator<AccumulatorTypes>(extended_edges, relation_parameters))) *
                scaling_factor;
        }
        // Contribution (2)
        {
            using View = typename std::tuple_element<1, typename AccumulatorTypes::AccumulatorViews>::type;
            auto z_perm_shift = View(extended_edges.z_perm_shift);
            auto lagrange_last = View(extended_edges.lagrange_last);

            std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
        }
    };

    template <typename TupleOverRelations>
    inline static void new_accumulate(TupleOverRelations& accumulators,
                                      const auto& extended_edges,
                                      const RelationParameters<FF>& relation_parameters,
                                      const FF& scaling_factor)
    {
        const auto& public_input_delta = relation_parameters.public_input_delta;

        // Contribution (1)
        {
            using Accumulator = std::tuple_element_t<0, TupleOverRelations>;
            using View = typename Accumulator::View;
            auto z_perm = View(extended_edges.z_perm);
            auto z_perm_shift = View(extended_edges.z_perm_shift);
            auto lagrange_first = View(extended_edges.lagrange_first);
            auto lagrange_last = View(extended_edges.lagrange_last);

            // Contribution (1)
            std::get<0>(accumulators) +=
                (((z_perm + lagrange_first) *
                  new_compute_grand_product_numerator<Accumulator>(extended_edges, relation_parameters)) -
                 ((z_perm_shift + lagrange_last * public_input_delta) *
                  new_compute_grand_product_denominator<Accumulator>(extended_edges, relation_parameters))) *
                scaling_factor;
        }
        // Contribution (2)
        {
            using Accumulator = std::tuple_element_t<1, TupleOverRelations>;
            using View = typename Accumulator::View;
            auto z_perm_shift = View(extended_edges.z_perm_shift);
            auto lagrange_last = View(extended_edges.lagrange_last);

            std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
        }
    };
};

template <typename FF> using UltraPermutationRelation = Relation<UltraPermutationRelationImpl<FF>>;

} // namespace proof_system
