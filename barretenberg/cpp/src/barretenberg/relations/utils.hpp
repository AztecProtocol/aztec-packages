// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <tuple>
#include <type_traits>
#include <utility>

#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/relations/relation_parameters.hpp"

namespace bb {

template <typename Flavor> class RelationUtils {
  public:
    using FF = typename Flavor::FF;
    using Relations = typename Flavor::Relations;
    using PolynomialEvaluations = typename Flavor::AllValues;
    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues;
    using RelationSeparator = typename Flavor::RelationSeparator;

    static constexpr size_t NUM_RELATIONS = Flavor::NUM_RELATIONS;
    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    /**
     * Utility methods for tuple of tuples of Univariates
     */
    /**
     * @brief General purpose method for applying an operation to a tuple of tuples of Univariates
     *
     * @tparam Operation Any operation valid on Univariates
     * @param tuple A Tuple of tuples of Univariates
     * @param operation Operation to apply to Univariates
     */
    template <class Operation> static void apply_to_tuple_of_tuples(auto& tuple, Operation&& operation)
    {
        constexpr size_t outer_tuple_size = std::tuple_size_v<std::decay_t<decltype(tuple)>>;
        constexpr_for<0, outer_tuple_size, 1>([&]<size_t outer_idx>() {
            auto& inner_tuple = std::get<outer_idx>(tuple);
            constexpr size_t inner_tuple_size = std::tuple_size_v<std::decay_t<decltype(inner_tuple)>>;
            constexpr_for<0, inner_tuple_size, 1>([&]<size_t inner_idx>() {
                std::forward<Operation>(operation).template operator()<outer_idx, inner_idx>(
                    std::get<inner_idx>(inner_tuple));
            });
        });
    }

    /**
     * @brief Set all coefficients of Univariates to zero
     *
     * @details After computing the round univariate, it is necessary to zero-out the accumulators used to compute it.
     */
    static void zero_univariates(auto& tuple)
    {
        auto set_to_zero = [](auto&&... elements) {
            (std::fill(elements.evaluations.begin(), elements.evaluations.end(), FF(0)), ...);
        };
        std::apply([&](auto&&... args) { (std::apply(set_to_zero, args), ...); }, tuple);
    }

    /**
     * @brief Scale Univariates, each representing a subrelation, by different challenges
     *
     * @param tuple Tuple of tuples of Univariates
     * @param subrelation_separators Array of NUM_SUBRELATIONS challenges with the first entry equal to 1.
     * scaled)
     */
    static void scale_univariates(auto& tuple, const RelationSeparator& subrelation_separators)
    {
        size_t idx = 0;
        auto scale_by_challenges = [&]<size_t, size_t>(auto& element) { element *= subrelation_separators[idx++]; };
        apply_to_tuple_of_tuples(tuple, scale_by_challenges);
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
        auto add_tuples_helper = [&]<std::size_t... I>(std::index_sequence<I...>) {
            ((std::get<I>(tuple_1) += std::get<I>(tuple_2)), ...);
        };

        add_tuples_helper(std::make_index_sequence<sizeof...(T)>{});
    }

    /**
     * @brief Componentwise addition of nested tuples (tuples of tuples)
     * @details Used for summing tuples of tuples of Univariates. Needed for Sumcheck multithreading. Each thread
     * accumulates relation contributions across a portion of the hypecube and then the results are accumulated into
     * a single nested tuple.
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
     * @brief Calculate the contribution of each relation to the expected value of the full Honk relation.
     *
     * @details For each relation, use the purported values (supplied by the prover) of the multivariates to
     * calculate a contribution to the purported value of the full Honk relation. These are stored in `evaluations`.
     * Adding these together, with appropriate scaling factors, produces the expected value of the full Honk
     * relation. This value is checked against the final value of the target total sum (called sigma_0 in the
     * thesis).
     */
    template <typename Parameters>
    inline static void accumulate_relation_evaluations_without_skipping(const PolynomialEvaluations& evaluations,
                                                                        RelationEvaluations& relation_evaluations,
                                                                        const Parameters& relation_parameters,
                                                                        const FF& partial_evaluation_result)
    {
        constexpr_for<0, NUM_RELATIONS, 1>([&]<size_t rel_index>() {
            // FIXME: You wan't /*consider_skipping=*/false here, but tests need to be fixed.
            accumulate_single_relation<Parameters, rel_index, /*consider_skipping=*/false>(
                evaluations, relation_evaluations, relation_parameters, partial_evaluation_result);
        });
    }

    /**
     * @brief Calculate the contribution of each relation to the expected value of the full Honk relation.
     *
     * @details For each relation, use the purported values (supplied by the prover) of the multivariates to
     * calculate a contribution to the purported value of the full Honk relation. These are stored in `evaluations`.
     * Adding these together, with appropriate scaling factors, produces the expected value of the full Honk
     * relation. This value is checked against the final value of the target total sum (called sigma_0 in the
     * thesis).
     */
    template <typename Parameters>
    inline static RelationEvaluations accumulate_relation_evaluations(const PolynomialEvaluations& evaluations,
                                                                      const Parameters& relation_parameters,
                                                                      const FF& partial_evaluation_result)
    {
        RelationEvaluations result;
        constexpr_for<0, NUM_RELATIONS, 1>([&]<size_t rel_index>() {
            accumulate_single_relation<Parameters, rel_index>(
                evaluations, result, relation_parameters, partial_evaluation_result);
        });
        return result;
    }

    template <typename Parameters, size_t relation_idx, bool consider_skipping = true>
    inline static void accumulate_single_relation(const PolynomialEvaluations& evaluations,
                                                  RelationEvaluations& relation_evaluations,
                                                  const Parameters& relation_parameters,
                                                  const FF& partial_evaluation_result)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;

        // Check if the relation is skippable to speed up accumulation
        if constexpr (!consider_skipping || !isSkippable<Relation, decltype(evaluations)> ||
                      !std::is_same_v<FF, bb::fr>) {
            // If not, accumulate normally
            Relation::accumulate(std::get<relation_idx>(relation_evaluations),
                                 evaluations,
                                 relation_parameters,
                                 partial_evaluation_result);
        } else {
            // If so, only compute the contribution if the relation is active
            if (!Relation::skip(evaluations)) {
                Relation::accumulate(std::get<relation_idx>(relation_evaluations),
                                     evaluations,
                                     relation_parameters,
                                     partial_evaluation_result);
            }
        }
    }

    /**
     * Utility methods for tuple of arrays
     */

    /**
     * @brief Set each element in a tuple of arrays to zero.
     * @details FF's default constructor may not initialize to zero (e.g., bb::fr), hence we can't rely on
     * aggregate initialization of the evaluations array.
     */
    template <size_t idx = 0> static void zero_elements(auto& tuple)
    {
        auto set_to_zero = [](auto& element) { std::fill(element.begin(), element.end(), FF(0)); };
        apply_to_tuple_of_arrays(set_to_zero, tuple);
    };

    /**
     * @brief Scale elements, representing evaluations of subrelations, by separate challenges then sum them
     * @param challenges Array of NUM_SUBRELATIONS - 1 challenges (because the first subrelation does not need to be
     * scaled)
     * @param result Batched result
     */
    static FF scale_and_batch_elements(auto& tuple, const RelationSeparator& challenges)
    {
        FF result{ 0 };
        size_t idx = 0;
        auto scale_by_challenges_and_accumulate = [&](auto& element) {
            for (auto& entry : element) {
                result += entry * challenges[idx++];
            }
        };
        apply_to_tuple_of_arrays(scale_by_challenges_and_accumulate, tuple);
        return result;
    }

    /**
     * @brief General purpose method for applying a tuple of arrays (of FFs)
     *
     * @tparam Operation Any operation valid on elements of the inner arrays (FFs)
     * @param tuple Tuple of arrays (of FFs)
     */
    template <typename Operation, typename... Ts>
    static void apply_to_tuple_of_arrays(Operation&& operation, std::tuple<Ts...>& tuple)
    {
        std::apply(
            [&operation](auto&... elements_ref) {
                // The comma operator ensures sequential application of the operation to each element.
                // (void) cast is used to discard the result of std::invoke if it's not void,
                // to prevent issues with overloaded comma operators.
                ((void)std::invoke(std::forward<Operation>(operation), elements_ref), ...);
            },
            tuple);
    }

    /**
     * @brief Recursive template function to apply a specific operation on each element of several arrays in a tuple
     *
     * @details We need this method in addition to the apply_to_tuple_of_arrays when we aim to perform different
     * operations depending on the array element. More explicitly, in our codebase this method is used when the elements
     * of array are values of subrelations and we want to accumulate some of these values separately (the linearly
     * dependent contribution when we compute the evaluation of full rel_U(G)H at particular row.)
     */
    template <typename Operation, typename... Ts>
    static void apply_to_tuple_of_arrays_elements(Operation&& operation, const std::tuple<Ts...>& tuple)
    {
        // Iterate over each array in the outer tuple.
        // OuterIdx is the compile-time index of the current array in the tuple.
        constexpr_for<0, sizeof...(Ts), 1>([&]<size_t OuterIdx>() {
            // Determine the specific Relation type corresponding to the OuterIdx-th array.
            // This is used to find the number of elements in the current array.
            using Relation = typename std::tuple_element_t<OuterIdx, Relations>;

            // Determine the number of elements in the current array.
            // This relies on Relation::SUBRELATION_PARTIAL_LENGTHS.size() being a constexpr value,
            // which indicates how many subrelations (and thus, evaluations) are in this relation's array.
            constexpr size_t num_elements_in_current_array = Relation::SUBRELATION_PARTIAL_LENGTHS.size();

            // Get a const reference to the current array from the tuple.
            const auto& current_array = std::get<OuterIdx>(tuple);

            // Iterate over each element within the current_array.
            // InnerIdx is the compile-time index of the element within this specific array.
            constexpr_for<0, num_elements_in_current_array, 1>([&]<size_t InnerIdx>() {
                // Invoke the operation.
                // The operation is called with OuterIdx (array index in the tuple) and
                // InnerIdx (element index in the current array) as template arguments.
                // The current element (e.g., an FF value) is passed as an argument.
                std::forward<Operation>(operation).template operator()<OuterIdx, InnerIdx>(current_array[InnerIdx]);
            });
        });
    }
};

} // namespace bb
