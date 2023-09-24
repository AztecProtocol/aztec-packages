#include "../polynomials/barycentric_data.hpp"
#include "../polynomials/univariate.hpp"
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/sumcheck/relations/translator_gen_perm_sort_relation.hpp"
#include "permutation_relation.hpp"
#include "relation_parameters.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <cstddef>
#include <gtest/gtest.h>
using namespace proof_system::honk::sumcheck;
/**
 * The purpose of this test suite is to show that the identity arithmetic implemented in the Relations is equivalent to
 * a simpler unoptimized version implemented in the tests themselves. This is useful 1) as documentation since the
 * simple implementations here should make the underlying arithmetic easier to see, and 2) as a check that optimizations
 * introduced into the Relations have not changed the result.
 *
 * For this purpose, we simply feed (the same) random inputs into each of the two implementations and confirm that
 * the outputs match. This does not confirm the correctness of the identity arithmetic (the identities will not be
 * satisfied in general by random inputs) only that the two implementations are equivalent.
 */
static const size_t INPUT_UNIVARIATE_LENGTH = 2;

namespace proof_system::honk_relation_tests {

class GoblinTranslatorRelationConsistency : public testing::Test {
  public:
    using Flavor = honk::flavor::GoblinTranslatorBasic;
    using FF = typename Flavor::FF;
    using ClaimedEvaluations = typename Flavor::ClaimedEvaluations;
    // TODO(#390): Move MAX_RELATION_LENGTH into Flavor and simplify this.

    template <size_t t> using ExtendedEdges = typename Flavor::template ExtendedEdges<t>;

    // TODO(#225)(Adrian): Accept FULL_RELATION_LENGTH as a template parameter for this function only, so that the
    // test can decide to which degree the polynomials must be extended. Possible accept an existing list of
    // "edges" and extend them to the degree.
    template <size_t FULL_RELATION_LENGTH, size_t NUM_POLYNOMIALS>
    static void compute_mock_extended_edges(
        ExtendedEdges<FULL_RELATION_LENGTH>& extended_edges,
        std::array<Univariate<FF, INPUT_UNIVARIATE_LENGTH>, NUM_POLYNOMIALS>& input_edges)
    {
        BarycentricData<FF, INPUT_UNIVARIATE_LENGTH, FULL_RELATION_LENGTH> barycentric_2_to_max =
            BarycentricData<FF, INPUT_UNIVARIATE_LENGTH, FULL_RELATION_LENGTH>();
        for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
            extended_edges[i] = barycentric_2_to_max.extend(input_edges[i]);
        }
    }

    /**
     * @brief Returns randomly sampled parameters to feed to the relations.
     *
     * @return RelationParameters<FF>
     */
    RelationParameters<FF> compute_mock_relation_parameters()
    {

        return { .eta = FF::random_element(),
                 .beta = FF::random_element(),
                 .gamma = FF::random_element(),
                 .public_input_delta = FF::zero(),
                 .lookup_grand_product_delta = FF::zero() };
    }

    /**
     * @brief Given an array of Univariates, create a new array containing only the i-th evaluations
     * of all the univariates.
     *
     * @note Not really optimized, mainly used for testing that the relations evaluate to the same value when
     * evaluated as Univariates, Expressions, or index-by-index
     * @todo(Adrian) Maybe this is more helpful as part of a `check_logic` function.
     *
     * @tparam NUM_UNIVARIATES number of univariates in the input array (deduced from `univariates`)
     * @tparam univariate_length number of evaluations (deduced from `univariates`)
     * @param univariates array of Univariates
     * @param i index of the evaluations we want to take from each univariate
     * @return std::array<FF, NUM_UNIVARIATES> such that result[j] = univariates[j].value_at(i)
     */
    template <size_t univariate_length>
    static ClaimedEvaluations transposed_univariate_array_at(ExtendedEdges<univariate_length> univariates, size_t i)
    {
        ASSERT(i < univariate_length);
        std::array<FF, Flavor::NUM_ALL_ENTITIES> result;
        size_t result_idx = 0; // TODO(#391) zip
        for (auto& univariate : univariates) {
            result[result_idx] = univariate.value_at(i);
            ++result_idx;
        }
        return result;
    };

    /**
     * @brief Compute the evaluation of a `relation` in different ways, comparing it to the provided `expected_evals`
     *
     * @details Check both `add_full_relation_value_contribution` and `add_edge_contribution` by comparing the result to
     * the `expected_evals` computed by the caller.
     * Ensures that the relations compute the same result as the expression given in the tests.
     *
     * @param expected_evals Relation evaluation computed by the caller.
     * @param relation being tested
     * @param extended_edges
     * @param relation_parameters
     */
    template <size_t FULL_RELATION_LENGTH>
    static void validate_evaluations(const auto& expected_full_length_univariates, /* array of Univariates*/
                                     const auto relation,
                                     const ExtendedEdges<FULL_RELATION_LENGTH>& extended_edges,
                                     const RelationParameters<FF>& relation_parameters)
    {
        // First check that the verifier's computation on individual evaluations is correct.
        // Note: since add_full_relation_value_contribution computes the identities at a single evaluation of the
        // multivariates, we need only pass in one evaluation point from the extended edges. Which one we choose is
        // arbitrary so we choose the 0th.

        // Extract the RelationValues type for the given relation
        using RelationValues = typename decltype(relation)::RelationValues;
        RelationValues relation_evals;
        RelationValues expected_relation_evals;

        ASSERT_EQ(expected_relation_evals.size(), expected_full_length_univariates.size());
        // Initialize expected_evals to 0th coefficient of expected full length univariates
        for (size_t idx = 0; idx < relation_evals.size(); ++idx) {
            relation_evals[idx] = FF(0); // initialize to 0
            expected_relation_evals[idx] = expected_full_length_univariates[idx].value_at(0);
        }

        // Extract 0th evaluation from extended edges
        ClaimedEvaluations edge_evaluations = transposed_univariate_array_at(extended_edges, 0);

        // Evaluate the relation using the verifier functionality
        relation.add_full_relation_value_contribution(relation_evals, edge_evaluations, relation_parameters);

        EXPECT_EQ(relation_evals, expected_relation_evals);

        // Next, check that the prover's computation on Univariates is correct

        using RelationUnivariates = typename decltype(relation)::RelationUnivariates;
        RelationUnivariates relation_univariates;
        zero_univariates<>(relation_univariates);

        constexpr std::size_t num_univariates = std::tuple_size<RelationUnivariates>::value;

        // Compute the relatiion univariates via the sumcheck prover functionality, then extend
        // them to full length for easy comparison with the expected result.
        relation.add_edge_contribution(relation_univariates, extended_edges, relation_parameters, 1);

        auto full_length_univariates = std::array<Univariate<FF, FULL_RELATION_LENGTH>, num_univariates>();
        extend_tuple_of_arrays<FULL_RELATION_LENGTH>(relation_univariates, full_length_univariates);

        EXPECT_EQ(full_length_univariates, expected_full_length_univariates);
    };

    template <size_t idx = 0, typename... Ts> static void zero_univariates(std::tuple<Ts...>& tuple)
    {
        auto& element = std::get<idx>(tuple);
        std::fill(element.evaluations.begin(), element.evaluations.end(), FF(0));

        if constexpr (idx + 1 < sizeof...(Ts)) {
            zero_univariates<idx + 1>(tuple);
        }
    }

    template <size_t extended_size, size_t idx = 0, typename... Ts>
    static void extend_tuple_of_arrays(std::tuple<Ts...>& tuple, auto& result_univariates)
    {
        auto& element = std::get<idx>(tuple);
        using Element = std::remove_reference_t<decltype(element)>;
        BarycentricData<FF, Element::LENGTH, extended_size> barycentric_utils;
        result_univariates[idx] = barycentric_utils.extend(element);

        if constexpr (idx + 1 < sizeof...(Ts)) {
            extend_tuple_of_arrays<extended_size, idx + 1>(tuple, result_univariates);
        }
    }
};

/**
 * @brief Test fo the GoblinTranslator Permutation Relation, which is one of the components used to prove values are
 * range constrained
 *
 */
TEST_F(GoblinTranslatorRelationConsistency, PermutationRelation)
{
    using Flavor = honk::flavor::GoblinTranslatorBasic;
    using FF = typename Flavor::FF;
    static constexpr size_t FULL_RELATION_LENGTH = 7;
    using ExtendedEdges = typename Flavor::template ExtendedEdges<FULL_RELATION_LENGTH>;
    static const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    const auto relation_parameters = compute_mock_relation_parameters();
    auto run_test = [&relation_parameters](bool is_random_input) {
        ExtendedEdges extended_edges;
        std::array<Univariate<FF, INPUT_UNIVARIATE_LENGTH>, NUM_POLYNOMIALS> input_polynomials;
        if (!is_random_input) {
            // evaluation form, i.e. input_univariate(0) = 1, input_univariate(1) = 2,.. The polynomial is x+1.
            for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
                input_polynomials[i] = Univariate<FF, INPUT_UNIVARIATE_LENGTH>({ 1, 2 });
            }
            compute_mock_extended_edges<FULL_RELATION_LENGTH>(extended_edges, input_polynomials);
        } else {
            // input_univariates are random polynomials of degree one
            for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
                input_polynomials[i] =
                    Univariate<FF, INPUT_UNIVARIATE_LENGTH>({ FF::random_element(), FF::random_element() });
            }
            compute_mock_extended_edges<FULL_RELATION_LENGTH>(extended_edges, input_polynomials);
        };

        auto relation = GoblinTranslatorPermutationRelation<FF>();

        // We only use γ in the relation, because we don't care about ordering of the permutations. We only need to make
        // sure that the set of values in concatenated range contraints + the extra numerator is identical to the sum
        // set of ordered range constraints
        const auto& gamma = relation_parameters.gamma;

        // Manually compute the expected edge contribution
        const auto& concatenated_range_constraints_0 = extended_edges.concatenated_range_constraints_0;
        const auto& concatenated_range_constraints_1 = extended_edges.concatenated_range_constraints_1;
        const auto& concatenated_range_constraints_2 = extended_edges.concatenated_range_constraints_2;
        const auto& concatenated_range_constraints_3 = extended_edges.concatenated_range_constraints_3;
        const auto& ordered_range_constraints_0 = extended_edges.ordered_range_constraints_0;
        const auto& ordered_range_constraints_1 = extended_edges.ordered_range_constraints_1;
        const auto& ordered_range_constraints_2 = extended_edges.ordered_range_constraints_2;
        const auto& ordered_range_constraints_3 = extended_edges.ordered_range_constraints_3;
        const auto& ordered_range_constraints_4 = extended_edges.ordered_range_constraints_4;
        const auto& ordered_extra_range_constraints_numerator =
            extended_edges.ordered_extra_range_constraints_numerator;
        const auto& z_perm = extended_edges.z_perm;
        const auto& z_perm_shift = extended_edges.z_perm_shift;
        const auto& lagrange_first = extended_edges.lagrange_first;
        const auto& lagrange_last = extended_edges.lagrange_last;

        // Compute expected full length Univariates using straight forward expressions
        constexpr std::size_t NUM_SUBRELATIONS = std::tuple_size_v<decltype(relation)::RelationUnivariates>;
        auto expected_full_length_univariates = std::array<Univariate<FF, FULL_RELATION_LENGTH>, NUM_SUBRELATIONS>();

        expected_full_length_univariates[0] =
            (z_perm + lagrange_first) * (concatenated_range_constraints_0 + gamma) *
                (concatenated_range_constraints_1 + gamma) * (concatenated_range_constraints_2 + gamma) *
                (concatenated_range_constraints_3 + gamma) * (ordered_extra_range_constraints_numerator + gamma) -
            (z_perm_shift + lagrange_last) * (ordered_range_constraints_0 + gamma) *
                (ordered_range_constraints_1 + gamma) * (ordered_range_constraints_2 + gamma) *
                (ordered_range_constraints_3 + gamma) * (ordered_range_constraints_4 + gamma);
        expected_full_length_univariates[1] = z_perm_shift * lagrange_last;

        validate_evaluations(expected_full_length_univariates, relation, extended_edges, relation_parameters);
    };
    run_test(/* is_random_input=*/true);
    run_test(/* is_random_input=*/false);
};

/**
 * @brief Check the consistency of GoblinTranslator General Permutation Sort Relation
 *
 * @details The relation is used to ensure that all the values in a ordered_range_constraints polynomials form a
 * sequence from 0 to MAX_VALUE in each of the polynomials
 *
 */
TEST_F(GoblinTranslatorRelationConsistency, GenPermSortRelation)
{
    using Flavor = honk::flavor::GoblinTranslatorBasic;
    using FF = typename Flavor::FF;
    static constexpr size_t FULL_RELATION_LENGTH = 7;
    using ExtendedEdges = typename Flavor::template ExtendedEdges<FULL_RELATION_LENGTH>;
    static const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    const auto relation_parameters = compute_mock_relation_parameters();
    auto run_test = [&relation_parameters](bool is_random_input) {
        ExtendedEdges extended_edges;
        std::array<Univariate<FF, INPUT_UNIVARIATE_LENGTH>, NUM_POLYNOMIALS> input_polynomials;
        if (!is_random_input) {
            // evaluation form, i.e. input_univariate(0) = 1, input_univariate(1) = 2,.. The polynomial is x+1.
            for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
                input_polynomials[i] = Univariate<FF, INPUT_UNIVARIATE_LENGTH>({ 1, 2 });
            }
            compute_mock_extended_edges<FULL_RELATION_LENGTH>(extended_edges, input_polynomials);
        } else {
            // input_univariates are random polynomials of degree one
            for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
                input_polynomials[i] =
                    Univariate<FF, INPUT_UNIVARIATE_LENGTH>({ FF::random_element(), FF::random_element() });
            }
            compute_mock_extended_edges<FULL_RELATION_LENGTH>(extended_edges, input_polynomials);
        };
        auto relation = GoblinTranslatorGenPermSortRelation<FF>();

        const auto& w_ordered_range_constraints_0 = extended_edges.ordered_range_constraints_0;
        const auto& w_ordered_range_constraints_1 = extended_edges.ordered_range_constraints_1;
        const auto& w_ordered_range_constraints_2 = extended_edges.ordered_range_constraints_2;
        const auto& w_ordered_range_constraints_3 = extended_edges.ordered_range_constraints_3;
        const auto& w_ordered_range_constraints_4 = extended_edges.ordered_range_constraints_4;
        const auto& w_ordered_range_constraints_0_shift = extended_edges.ordered_range_constraints_0_shift;
        const auto& w_ordered_range_constraints_1_shift = extended_edges.ordered_range_constraints_1_shift;
        const auto& w_ordered_range_constraints_2_shift = extended_edges.ordered_range_constraints_2_shift;
        const auto& w_ordered_range_constraints_3_shift = extended_edges.ordered_range_constraints_3_shift;
        const auto& w_ordered_range_constraints_4_shift = extended_edges.ordered_range_constraints_4_shift;
        const auto& lagrange_last = extended_edges.lagrange_last;

        // Compute expected full length Univariates using straight forward expressions
        constexpr std::size_t NUM_SUBRELATIONS = std::tuple_size_v<decltype(relation)::RelationUnivariates>;
        auto expected_full_length_univariates = std::array<Univariate<FF, FULL_RELATION_LENGTH>, NUM_SUBRELATIONS>();

        const auto minus_one = FF(-1);
        const auto minus_two = FF(-2);
        const auto minus_three = FF(-3);
        const auto maximum_value = -FF((1 << Flavor::MICRO_LIMB_BITS) - 1);

        // First compute individual deltas
        const auto delta_1 = w_ordered_range_constraints_0_shift - w_ordered_range_constraints_0;
        const auto delta_2 = w_ordered_range_constraints_1_shift - w_ordered_range_constraints_1;
        const auto delta_3 = w_ordered_range_constraints_2_shift - w_ordered_range_constraints_2;
        const auto delta_4 = w_ordered_range_constraints_3_shift - w_ordered_range_constraints_3;
        const auto delta_5 = w_ordered_range_constraints_4_shift - w_ordered_range_constraints_4;

        const auto not_last = lagrange_last + minus_one;

        // Check the delta is {0,1,2,3}
        auto delta_in_range = [not_last, minus_one, minus_two, minus_three](auto delta) {
            return not_last * delta * (delta + minus_one) * (delta + minus_two) * (delta + minus_three);
        };
        // Check delta correctness
        expected_full_length_univariates[0] = delta_in_range(delta_1);
        expected_full_length_univariates[1] = delta_in_range(delta_2);
        expected_full_length_univariates[2] = delta_in_range(delta_3);
        expected_full_length_univariates[3] = delta_in_range(delta_4);
        expected_full_length_univariates[4] = delta_in_range(delta_5);
        // Check that the last value is MAXIMUM
        expected_full_length_univariates[5] = lagrange_last * (w_ordered_range_constraints_0 + maximum_value);
        expected_full_length_univariates[6] = lagrange_last * (w_ordered_range_constraints_1 + maximum_value);
        expected_full_length_univariates[7] = lagrange_last * (w_ordered_range_constraints_2 + maximum_value);
        expected_full_length_univariates[8] = lagrange_last * (w_ordered_range_constraints_3 + maximum_value);
        expected_full_length_univariates[9] = lagrange_last * (w_ordered_range_constraints_4 + maximum_value);
        // We don't check that the first value is zero, because the shift mechanism already ensures it

        validate_evaluations(expected_full_length_univariates, relation, extended_edges, relation_parameters);
    };
    run_test(/* is_random_input=*/true);
    run_test(/* is_random_input=*/false);
};

} // namespace proof_system::honk_relation_tests
