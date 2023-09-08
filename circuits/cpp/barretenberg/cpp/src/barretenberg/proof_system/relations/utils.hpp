#pragma once
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/barycentric.hpp"
#include "barretenberg/polynomials/pow.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"

namespace barretenberg {

template <typename Flavor> class RelationUtils {
  public:
    using FF = typename Flavor::FF;
    using Relations = typename Flavor::Relations;
    using RelationUnivariates = typename Flavor::RelationUnivariates;

    /**
     * Utility methods for tuple of tuples of Univariates
     */
    /**
     * @brief General purpose method for applying an operation to a tuple of tuples of Univariates
     *
     * @tparam Operation Any operation valid on Univariates
     * @tparam outer_idx Index into the outer tuple
     * @tparam inner_idx Index into the inner tuple
     * @param tuple A Tuple of tuples of Univariates
     * @param operation Operation to apply to Univariates
     */
    template <class Operation, size_t outer_idx = 0, size_t inner_idx = 0>
    static void apply_to_tuple_of_tuples(auto& tuple, Operation&& operation)
    {
        auto& inner_tuple = std::get<outer_idx>(tuple);
        auto& univariate = std::get<inner_idx>(inner_tuple);

        // Apply the specified operation to each Univariate
        operation.template operator()<outer_idx, inner_idx>(univariate);

        const size_t inner_size = std::tuple_size_v<std::decay_t<decltype(std::get<outer_idx>(tuple))>>;
        const size_t outer_size = std::tuple_size_v<std::decay_t<decltype(tuple)>>;

        // Recurse over inner and outer tuples
        if constexpr (inner_idx + 1 < inner_size) {
            apply_to_tuple_of_tuples<Operation, outer_idx, inner_idx + 1>(tuple, std::forward<Operation>(operation));
        } else if constexpr (outer_idx + 1 < outer_size) {
            apply_to_tuple_of_tuples<Operation, outer_idx + 1, 0>(tuple, std::forward<Operation>(operation));
        }
    }

    /**
     * @brief Set all coefficients of Univariates to zero
     *
     * @details After computing the round univariate, it is necessary to zero-out the accumulators used to compute it.
     * WORKTODO: rename
     */
    static void zero_univariates(auto& tuple)
    {
        /* WORKTODO const */ auto set_to_zero = []<size_t, size_t>(auto& element) {
            std::fill(element.evaluations.begin(), element.evaluations.end(), FF(0));
        };
        apply_to_tuple_of_tuples(tuple, set_to_zero);
    }

    /**
     * @brief Scale Univaraites by consecutive powers of the provided challenge
     *
     * @param tuple Tuple of tuples of Univariates
     * @param challenge
     * @param current_scalar power of the challenge
     */
    static void scale_univariates(auto& tuple, const FF& challenge, FF current_scalar)
    {
        auto scale_by_consecutive_powers_of_challenge = [&]<size_t, size_t>(auto& element) {
            element *= current_scalar;
            current_scalar *= challenge;
        };
        apply_to_tuple_of_tuples(tuple, scale_by_consecutive_powers_of_challenge);
    }

    /**
     * @brief Componentwise addition of two tuples
     * @details Used for adding tuples of Univariates but in general works for any object for which += is
     * defined. The result is stored in the first tuple.
     *
     * @tparam T Type of the elements contained in the tuples
     * @param tuple_1 First summand. Result stored in this tuple
     * @param tuple_2 Second summand
     */
    template <typename... T>
    static constexpr void add_tuples(std::tuple<T...>& tuple_1, const std::tuple<T...>& tuple_2)
    {
        auto add_tuples_helper = [&]<std::size_t... I>(std::index_sequence<I...>)
        {
            ((std::get<I>(tuple_1) += std::get<I>(tuple_2)), ...);
        };

        add_tuples_helper(std::make_index_sequence<sizeof...(T)>{});
    }

    /**
     * @brief Componentwise addition of nested tuples (tuples of tuples)
     * @details Used for summing tuples of tuples of Univariates. Needed for Sumcheck multithreading. Each thread
     * accumulates realtion contributions across a portion of the hypecube and then the results are accumulated into a
     * single nested tuple.
     *
     * @tparam Tuple
     * @tparam Index Index into outer tuple
     * @param tuple_1 First nested tuple summand. Result stored here
     * @param tuple_2 Second summand
     */
    template <typename Tuple, std::size_t Index = 0>
    static constexpr void add_nested_tuples(Tuple& tuple_1, const Tuple& tuple_2)
    {
        if constexpr (Index < std::tuple_size<Tuple>::value) {
            add_tuples(std::get<Index>(tuple_1), std::get<Index>(tuple_2));
            add_nested_tuples<Tuple, Index + 1>(tuple_1, tuple_2);
        }
    }

    /**
     * @brief Extend Univariates to specified size then sum them
     *
     * @tparam extended_size Size after extension
     * @param tuple A tuple of tuples of Univariates
     * @param result A Univariate of length extended_size
     */
    template <typename ExtendedUnivariate>
    static void extend_and_batch_univariates(const auto& tuple, // WORKTODO: explicit type
                                             const PowUnivariate<FF>& pow_univariate,
                                             ExtendedUnivariate& result)
    {
        // Random poly R(X) = (1-X) + X.zeta_pow
        auto random_poly_edge = Univariate<FF, 2>({ 1, pow_univariate.zeta_pow });
        BarycentricData<FF, 2, ExtendedUnivariate::LENGTH> pow_zeta_univariate_extender;
        ExtendedUnivariate extended_random_polynomial_edge = pow_zeta_univariate_extender.extend(random_poly_edge);

        auto extend_and_sum = [&]<size_t relation_idx, size_t subrelation_idx, typename Element>(Element& element) {
            using Relation = typename std::tuple_element<relation_idx, Relations>::type;

            // TODO(#224)(Cody): this barycentric stuff should be more built-in?
            BarycentricData<FF, Element::LENGTH, ExtendedUnivariate::LENGTH> barycentric_utils;
            auto extended = barycentric_utils.extend(element);

            const bool is_subrelation_linearly_independent =
                Relation::template is_subrelation_linearly_independent<subrelation_idx>();
            if (is_subrelation_linearly_independent) {
                // if subrelation is linearly independent, multiply by random polynomial
                result += extended * extended_random_polynomial_edge;
            } else {
                // if subrelation is pure sum over hypercube, don't multiply by random polynomial
                result += extended;
            }
        };
        apply_to_tuple_of_tuples(tuple, extend_and_sum);
    }

    /**
     * @brief Given a tuple t = (t_0, t_1, ..., t_{NUM_RELATIONS-1}) and a challenge α,
     * return t_0 + αt_1 + ... + α^{NUM_RELATIONS-1}t_{NUM_RELATIONS-1}).
     *
     * @tparam T : In practice, this is a Univariate<FF, MAX_NUM_RELATIONS>.
     */
    template <typename ExtendedUnivariate> // WORKTODO: no template argument?
    static ExtendedUnivariate batch_over_relations(/* WORKTODO const */ RelationUnivariates& univariate_accumulators,
                                                   const FF& challenge,
                                                   const PowUnivariate<FF>& pow_univariate)
    {
        FF running_challenge = 1;
        scale_univariates(univariate_accumulators, challenge, running_challenge);

        auto result = ExtendedUnivariate(0);
        extend_and_batch_univariates(univariate_accumulators, pow_univariate, result);

        // Reset all univariate accumulators to 0 before beginning accumulation in the next round
        zero_univariates(univariate_accumulators);
        return result;
    }
};
} // namespace barretenberg