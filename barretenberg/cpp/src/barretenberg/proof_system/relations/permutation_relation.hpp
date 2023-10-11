#pragma once
#include "relation_parameters.hpp"
#include "relation_types.hpp"

namespace proof_system {

template <typename FF_> class UltraPermutationRelationImpl {
  public:
    using FF = FF_;

    static constexpr std::array<size_t, 2> SUBRELATION_LENGTHS{
        6, // grand product construction sub-relation
        3  // left-shiftable polynomial sub-relation
    };

    inline static auto& get_grand_product_polynomial(auto& in) { return in.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& in) { return in.z_perm_shift; }

    template <typename Accumulator, typename AllEntities>
    inline static Accumulator compute_grand_product_numerator(const AllEntities& in,
                                                              const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto w_1 = View(in.w_l);
        auto w_2 = View(in.w_r);
        auto w_3 = View(in.w_o);
        auto w_4 = View(in.w_4);
        auto id_1 = View(in.id_1);
        auto id_2 = View(in.id_2);
        auto id_3 = View(in.id_3);
        auto id_4 = View(in.id_4);

        const auto& beta = relation_parameters.beta;
        const auto& gamma = relation_parameters.gamma;

        return (w_1 + id_1 * beta + gamma) * (w_2 + id_2 * beta + gamma) * (w_3 + id_3 * beta + gamma) *
               (w_4 + id_4 * beta + gamma);
    }

    template <typename Accumulator, typename AllEntities>
    inline static Accumulator compute_grand_product_denominator(const AllEntities& in,
                                                                const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto w_1 = View(in.w_l);
        auto w_2 = View(in.w_r);
        auto w_3 = View(in.w_o);
        auto w_4 = View(in.w_4);

        auto sigma_1 = View(in.sigma_1);
        auto sigma_2 = View(in.sigma_2);
        auto sigma_3 = View(in.sigma_3);
        auto sigma_4 = View(in.sigma_4);

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
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */
    template <typename ContainerOverSubrelations, typename AllEntities>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const RelationParameters<FF>& relation_parameters,
                                  const FF& scaling_factor)
    {
        const auto& public_input_delta = relation_parameters.public_input_delta;

        // Contribution (1)
        {
            using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
            using View = typename Accumulator::View;
            auto z_perm = View(in.z_perm);
            auto z_perm_shift = View(in.z_perm_shift);
            auto lagrange_first = View(in.lagrange_first);
            auto lagrange_last = View(in.lagrange_last);

            // Contribution (1)
            std::get<0>(accumulators) +=
                (((z_perm + lagrange_first) * compute_grand_product_numerator<Accumulator>(in, relation_parameters)) -
                 ((z_perm_shift + lagrange_last * public_input_delta) *
                  compute_grand_product_denominator<Accumulator>(in, relation_parameters))) *
                scaling_factor;
        }
        // Contribution (2)
        {
            using Accumulator = std::tuple_element_t<1, ContainerOverSubrelations>;
            using View = typename Accumulator::View;
            auto z_perm_shift = View(in.z_perm_shift);
            auto lagrange_last = View(in.lagrange_last);

            std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
        }
    };
};

template <typename FF_> class GoblinTranslatorPermutationRelationImpl {
  public:
    using FF = FF_;
    // 1 + polynomial degree of this relation
    static constexpr size_t RELATION_LENGTH = 7;

    static constexpr std::array<size_t, 2> SUBRELATION_LENGTHS{
        7, // grand product construction sub-relation
        3  // left-shiftable polynomial sub-relation
    };

    inline static auto& get_grand_product_polynomial(auto& in) { return in.z_perm; }
    inline static auto& get_shifted_grand_product_polynomial(auto& in) { return in.z_perm_shift; }

    template <typename Accumulator, typename AllEntities>
    inline static Accumulator compute_grand_product_numerator(const AllEntities& in,
                                                              const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto concatenated_range_constraints_0 = View(in.concatenated_range_constraints_0);
        auto concatenated_range_constraints_1 = View(in.concatenated_range_constraints_1);
        auto concatenated_range_constraints_2 = View(in.concatenated_range_constraints_2);
        auto concatenated_range_constraints_3 = View(in.concatenated_range_constraints_3);

        auto ordered_extra_range_constraints_numerator = View(in.ordered_extra_range_constraints_numerator);

        const auto& gamma = relation_parameters.gamma;
        return (concatenated_range_constraints_0 + gamma) * (concatenated_range_constraints_1 + gamma) *
               (concatenated_range_constraints_2 + gamma) * (concatenated_range_constraints_3 + gamma) *
               (ordered_extra_range_constraints_numerator + gamma);
    }

    template <typename Accumulator, typename AllEntities>
    inline static Accumulator compute_grand_product_denominator(const AllEntities& in,
                                                                const RelationParameters<FF>& relation_parameters)
    {
        using View = typename Accumulator::View;

        auto ordered_range_constraints_0 = View(in.ordered_range_constraints_0);
        auto ordered_range_constraints_1 = View(in.ordered_range_constraints_1);
        auto ordered_range_constraints_2 = View(in.ordered_range_constraints_2);
        auto ordered_range_constraints_3 = View(in.ordered_range_constraints_3);
        auto ordered_range_constraints_4 = View(in.ordered_range_constraints_4);

        const auto& gamma = relation_parameters.gamma;

        return (ordered_range_constraints_0 + gamma) * (ordered_range_constraints_1 + gamma) *
               (ordered_range_constraints_2 + gamma) * (ordered_range_constraints_3 + gamma) *
               (ordered_range_constraints_4 + gamma);
    }
    /**
     * @brief Compute contribution of the goblin translator permutation relation for a given edge (internal function)
     *
     * @details There are 2 relations associated with enforcing the set permutation relation
     * This file handles the relation that confirms faithful calculation of the grand
     * product polynomial Z_perm.
     *
     *  C(in(X)...) =
     *      ( z_perm(X) + lagrange_first(X) )*P(X)
     *         - ( z_perm_shift(X) + lagrange_last(X))*Q(X),
     * where P(X) = Prod_{i=0:4} numerator_polynomial_i(X) + γ
     *       Q(X) = Prod_{i=0:4} ordered_range_constraint_i(X) + γ
     * the first 4 numerator polynomials are concatenated range constraint polynomials and the last one is the constant
     * extra numerator
     *
     * @param evals transformed to `evals + C(in(X)...)*scaling_factor`
     * @param in an std::array containing the fully extended Univariate edges.
     * @param parameters contains beta, gamma, and public_input_delta, ....
     * @param scaling_factor optional term to scale the evaluation before adding to evals.
     */

    template <typename ContainerOverSubrelations, typename AllEntities>
    inline static void accumulate(ContainerOverSubrelations& accumulators,
                                  const AllEntities& in,
                                  const RelationParameters<FF>& relation_parameters,
                                  const FF& scaling_factor)
    {
        [&]() {
            using Accumulator = std::tuple_element_t<0, ContainerOverSubrelations>;
            using View = typename Accumulator::View;

            auto z_perm = View(in.z_perm);
            auto z_perm_shift = View(in.z_perm_shift);
            auto lagrange_first = View(in.lagrange_first);
            auto lagrange_last = View(in.lagrange_last);

            // Contribution (1)
            std::get<0>(accumulators) +=
                (((z_perm + lagrange_first) * compute_grand_product_numerator<Accumulator>(in, relation_parameters)) -
                 ((z_perm_shift + lagrange_last) *
                  compute_grand_product_denominator<Accumulator>(in, relation_parameters))) *
                scaling_factor;
        }();

        [&]() {
            using Accumulator = std::tuple_element_t<1, ContainerOverSubrelations>;
            using View = typename Accumulator::View;

            auto z_perm_shift = View(in.z_perm_shift);
            auto lagrange_last = View(in.lagrange_last);

            // Contribution (2)
            std::get<1>(accumulators) += (lagrange_last * z_perm_shift) * scaling_factor;
        }();
    };
};

template <typename FF> using UltraPermutationRelation = Relation<UltraPermutationRelationImpl<FF>>;
template <typename FF>
using GoblinTranslatorPermutationRelation = Relation<GoblinTranslatorPermutationRelationImpl<FF>>;

} // namespace proof_system
