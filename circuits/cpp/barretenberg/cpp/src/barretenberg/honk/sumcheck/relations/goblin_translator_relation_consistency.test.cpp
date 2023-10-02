#include "../polynomials/barycentric_data.hpp"
#include "../polynomials/univariate.hpp"
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/sumcheck/relations/goblin_translator_decomposition_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/goblin_translator_gen_perm_sort_relation.hpp"
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

/**
 * @brief Check the consistency of GoblinTranslator Decomposition Relation
 *
 * @details The relation is used to decompose ECCOpQueue values into 68-bit limbs and then those 68-bit limbs into
 * 14-bit range constrained limbs
 */
TEST_F(GoblinTranslatorRelationConsistency, DecompositionRelation)
{
    using Flavor = honk::flavor::GoblinTranslatorBasic;
    using FF = typename Flavor::FF;
    static constexpr size_t FULL_RELATION_LENGTH = 4;
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
        auto relation = GoblinTranslatorDecompositionRelation<FF>();
        const auto MICRO_LIMB_SHIFT = GoblinTranslatorDecompositionRelationBase<FF>::MICRO_LIMB_SHIFT;
        const auto MICRO_LIMB_SHIFTx2 = GoblinTranslatorDecompositionRelationBase<FF>::MICRO_LIMB_SHIFTx2;
        const auto MICRO_LIMB_SHIFTx3 = GoblinTranslatorDecompositionRelationBase<FF>::MICRO_LIMB_SHIFTx3;
        const auto MICRO_LIMB_SHIFTx4 = GoblinTranslatorDecompositionRelationBase<FF>::MICRO_LIMB_SHIFTx4;
        const auto MICRO_LIMB_SHIFTx5 = GoblinTranslatorDecompositionRelationBase<FF>::MICRO_LIMB_SHIFTx5;
        const auto SHIFT_10_TO_14 = GoblinTranslatorDecompositionRelation<FF>::SHIFT_10_TO_14;
        const auto SHIFT_12_TO_14 = GoblinTranslatorDecompositionRelation<FF>::SHIFT_12_TO_14;
        const auto SHIFT_4_TO_14 = GoblinTranslatorDecompositionRelation<FF>::SHIFT_4_TO_14;
        const auto SHIFT_8_TO_14 = GoblinTranslatorDecompositionRelation<FF>::SHIFT_8_TO_14;
        const auto LIMB_SHIFT = GoblinTranslatorDecompositionRelationBase<FF>::LIMB_SHIFT;

        // Compute expected full length Univariates using straight forward expressions
        constexpr std::size_t NUM_SUBRELATIONS = std::tuple_size_v<decltype(relation)::RelationUnivariates>;
        auto expected_full_length_univariates = std::array<Univariate<FF, FULL_RELATION_LENGTH>, NUM_SUBRELATIONS>();

        // Get all the wires
        const auto& p_x_low_limbs_range_constraint_0 = extended_edges.p_x_low_limbs_range_constraint_0;
        const auto& p_x_low_limbs_range_constraint_1 = extended_edges.p_x_low_limbs_range_constraint_1;
        const auto& p_x_low_limbs_range_constraint_2 = extended_edges.p_x_low_limbs_range_constraint_2;
        const auto& p_x_low_limbs_range_constraint_3 = extended_edges.p_x_low_limbs_range_constraint_3;
        const auto& p_x_low_limbs_range_constraint_4 = extended_edges.p_x_low_limbs_range_constraint_4;
        const auto& p_x_low_limbs_range_constraint_tail = extended_edges.p_x_low_limbs_range_constraint_tail;
        const auto& p_x_low_limbs = extended_edges.p_x_low_limbs;
        const auto& p_x_high_limbs_range_constraint_0 = extended_edges.p_x_high_limbs_range_constraint_0;
        const auto& p_x_high_limbs_range_constraint_1 = extended_edges.p_x_high_limbs_range_constraint_1;
        const auto& p_x_high_limbs_range_constraint_2 = extended_edges.p_x_high_limbs_range_constraint_2;
        const auto& p_x_high_limbs_range_constraint_3 = extended_edges.p_x_high_limbs_range_constraint_3;
        const auto& p_x_high_limbs_range_constraint_4 = extended_edges.p_x_high_limbs_range_constraint_4;
        const auto& p_x_high_limbs_range_constraint_tail = extended_edges.p_x_high_limbs_range_constraint_tail;
        const auto& p_x_high_limbs = extended_edges.p_x_high_limbs;
        const auto& p_x_low_limbs_range_constraint_0_shift = extended_edges.p_x_low_limbs_range_constraint_0_shift;
        const auto& p_x_low_limbs_range_constraint_1_shift = extended_edges.p_x_low_limbs_range_constraint_1_shift;
        const auto& p_x_low_limbs_range_constraint_2_shift = extended_edges.p_x_low_limbs_range_constraint_2_shift;
        const auto& p_x_low_limbs_range_constraint_3_shift = extended_edges.p_x_low_limbs_range_constraint_3_shift;
        const auto& p_x_low_limbs_range_constraint_4_shift = extended_edges.p_x_low_limbs_range_constraint_4_shift;
        const auto& p_x_low_limbs_range_constraint_tail_shift =
            extended_edges.p_x_low_limbs_range_constraint_tail_shift;
        const auto& p_x_low_limbs_shift = extended_edges.p_x_low_limbs_shift;
        const auto& p_x_high_limbs_range_constraint_0_shift = extended_edges.p_x_high_limbs_range_constraint_0_shift;
        const auto& p_x_high_limbs_range_constraint_1_shift = extended_edges.p_x_high_limbs_range_constraint_1_shift;
        const auto& p_x_high_limbs_range_constraint_2_shift = extended_edges.p_x_high_limbs_range_constraint_2_shift;
        const auto& p_x_high_limbs_range_constraint_3_shift = extended_edges.p_x_high_limbs_range_constraint_3_shift;
        const auto& p_x_high_limbs_range_constraint_4_shift = extended_edges.p_x_high_limbs_range_constraint_4_shift;
        const auto& p_x_high_limbs_range_constraint_tail_shift =
            extended_edges.p_x_high_limbs_range_constraint_tail_shift;
        const auto& p_x_high_limbs_shift = extended_edges.p_x_high_limbs_shift;
        const auto& p_y_low_limbs_range_constraint_0 = extended_edges.p_y_low_limbs_range_constraint_0;
        const auto& p_y_low_limbs_range_constraint_1 = extended_edges.p_y_low_limbs_range_constraint_1;
        const auto& p_y_low_limbs_range_constraint_2 = extended_edges.p_y_low_limbs_range_constraint_2;
        const auto& p_y_low_limbs_range_constraint_3 = extended_edges.p_y_low_limbs_range_constraint_3;
        const auto& p_y_low_limbs_range_constraint_4 = extended_edges.p_y_low_limbs_range_constraint_4;
        const auto& p_y_low_limbs_range_constraint_tail = extended_edges.p_y_low_limbs_range_constraint_tail;
        const auto& p_y_low_limbs = extended_edges.p_y_low_limbs;
        const auto& p_y_high_limbs_range_constraint_0 = extended_edges.p_y_high_limbs_range_constraint_0;
        const auto& p_y_high_limbs_range_constraint_1 = extended_edges.p_y_high_limbs_range_constraint_1;
        const auto& p_y_high_limbs_range_constraint_2 = extended_edges.p_y_high_limbs_range_constraint_2;
        const auto& p_y_high_limbs_range_constraint_3 = extended_edges.p_y_high_limbs_range_constraint_3;
        const auto& p_y_high_limbs_range_constraint_4 = extended_edges.p_y_high_limbs_range_constraint_4;
        const auto& p_y_high_limbs_range_constraint_tail = extended_edges.p_y_high_limbs_range_constraint_tail;
        const auto& p_y_high_limbs = extended_edges.p_y_high_limbs;
        const auto& p_y_low_limbs_range_constraint_0_shift = extended_edges.p_y_low_limbs_range_constraint_0_shift;
        const auto& p_y_low_limbs_range_constraint_1_shift = extended_edges.p_y_low_limbs_range_constraint_1_shift;
        const auto& p_y_low_limbs_range_constraint_2_shift = extended_edges.p_y_low_limbs_range_constraint_2_shift;
        const auto& p_y_low_limbs_range_constraint_3_shift = extended_edges.p_y_low_limbs_range_constraint_3_shift;
        const auto& p_y_low_limbs_range_constraint_4_shift = extended_edges.p_y_low_limbs_range_constraint_4_shift;
        const auto& p_y_low_limbs_range_constraint_tail_shift =
            extended_edges.p_y_low_limbs_range_constraint_tail_shift;
        const auto& p_y_low_limbs_shift = extended_edges.p_y_low_limbs_shift;
        const auto& p_y_high_limbs_range_constraint_0_shift = extended_edges.p_y_high_limbs_range_constraint_0_shift;
        const auto& p_y_high_limbs_range_constraint_1_shift = extended_edges.p_y_high_limbs_range_constraint_1_shift;
        const auto& p_y_high_limbs_range_constraint_2_shift = extended_edges.p_y_high_limbs_range_constraint_2_shift;
        const auto& p_y_high_limbs_range_constraint_3_shift = extended_edges.p_y_high_limbs_range_constraint_3_shift;
        const auto& p_y_high_limbs_range_constraint_4_shift = extended_edges.p_y_high_limbs_range_constraint_4_shift;
        const auto& p_y_high_limbs_range_constraint_tail_shift =
            extended_edges.p_y_high_limbs_range_constraint_tail_shift;
        const auto& p_y_high_limbs_shift = extended_edges.p_y_high_limbs_shift;
        const auto& z_lo_limbs_range_constraint_0 = extended_edges.z_lo_limbs_range_constraint_0;
        const auto& z_lo_limbs_range_constraint_1 = extended_edges.z_lo_limbs_range_constraint_1;
        const auto& z_lo_limbs_range_constraint_2 = extended_edges.z_lo_limbs_range_constraint_2;
        const auto& z_lo_limbs_range_constraint_3 = extended_edges.z_lo_limbs_range_constraint_3;
        const auto& z_lo_limbs_range_constraint_4 = extended_edges.z_lo_limbs_range_constraint_4;
        const auto& z_lo_limbs_range_constraint_tail = extended_edges.z_lo_limbs_range_constraint_tail;
        const auto& z_lo_limbs = extended_edges.z_lo_limbs;
        const auto& z_lo_limbs_range_constraint_0_shift = extended_edges.z_lo_limbs_range_constraint_0_shift;
        const auto& z_lo_limbs_range_constraint_1_shift = extended_edges.z_lo_limbs_range_constraint_1_shift;
        const auto& z_lo_limbs_range_constraint_2_shift = extended_edges.z_lo_limbs_range_constraint_2_shift;
        const auto& z_lo_limbs_range_constraint_3_shift = extended_edges.z_lo_limbs_range_constraint_3_shift;
        const auto& z_lo_limbs_range_constraint_4_shift = extended_edges.z_lo_limbs_range_constraint_4_shift;
        const auto& z_lo_limbs_range_constraint_tail_shift = extended_edges.z_lo_limbs_range_constraint_tail_shift;
        const auto& z_lo_limbs_shift = extended_edges.z_lo_limbs_shift;
        const auto& z_hi_limbs_range_constraint_0 = extended_edges.z_hi_limbs_range_constraint_0;
        const auto& z_hi_limbs_range_constraint_1 = extended_edges.z_hi_limbs_range_constraint_1;
        const auto& z_hi_limbs_range_constraint_2 = extended_edges.z_hi_limbs_range_constraint_2;
        const auto& z_hi_limbs_range_constraint_3 = extended_edges.z_hi_limbs_range_constraint_3;
        const auto& z_hi_limbs_range_constraint_4 = extended_edges.z_hi_limbs_range_constraint_4;
        const auto& z_hi_limbs_range_constraint_tail = extended_edges.z_hi_limbs_range_constraint_tail;
        const auto& z_hi_limbs = extended_edges.z_hi_limbs;
        const auto& z_hi_limbs_range_constraint_0_shift = extended_edges.z_hi_limbs_range_constraint_0_shift;
        const auto& z_hi_limbs_range_constraint_1_shift = extended_edges.z_hi_limbs_range_constraint_1_shift;
        const auto& z_hi_limbs_range_constraint_2_shift = extended_edges.z_hi_limbs_range_constraint_2_shift;
        const auto& z_hi_limbs_range_constraint_3_shift = extended_edges.z_hi_limbs_range_constraint_3_shift;
        const auto& z_hi_limbs_range_constraint_4_shift = extended_edges.z_hi_limbs_range_constraint_4_shift;
        const auto& z_hi_limbs_range_constraint_tail_shift = extended_edges.z_hi_limbs_range_constraint_tail_shift;
        const auto& z_hi_limbs_shift = extended_edges.z_hi_limbs_shift;
        const auto& accumulator_lo_limbs_range_constraint_0 = extended_edges.accumulator_lo_limbs_range_constraint_0;
        const auto& accumulator_lo_limbs_range_constraint_1 = extended_edges.accumulator_lo_limbs_range_constraint_1;
        const auto& accumulator_lo_limbs_range_constraint_2 = extended_edges.accumulator_lo_limbs_range_constraint_2;
        const auto& accumulator_lo_limbs_range_constraint_3 = extended_edges.accumulator_lo_limbs_range_constraint_3;
        const auto& accumulator_lo_limbs_range_constraint_4 = extended_edges.accumulator_lo_limbs_range_constraint_4;
        const auto& accumulator_lo_limbs_range_constraint_tail =
            extended_edges.accumulator_lo_limbs_range_constraint_tail;
        const auto& accumulator_lo_limbs_range_constraint_0_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_0_shift;
        const auto& accumulator_lo_limbs_range_constraint_1_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_1_shift;
        const auto& accumulator_lo_limbs_range_constraint_2_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_2_shift;
        const auto& accumulator_lo_limbs_range_constraint_3_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_3_shift;
        const auto& accumulator_lo_limbs_range_constraint_4_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_4_shift;
        const auto& accumulator_lo_limbs_range_constraint_tail_shift =
            extended_edges.accumulator_lo_limbs_range_constraint_tail_shift;
        const auto& accumulator_hi_limbs_range_constraint_0 = extended_edges.accumulator_hi_limbs_range_constraint_0;
        const auto& accumulator_hi_limbs_range_constraint_1 = extended_edges.accumulator_hi_limbs_range_constraint_1;
        const auto& accumulator_hi_limbs_range_constraint_2 = extended_edges.accumulator_hi_limbs_range_constraint_2;
        const auto& accumulator_hi_limbs_range_constraint_3 = extended_edges.accumulator_hi_limbs_range_constraint_3;
        const auto& accumulator_hi_limbs_range_constraint_4 = extended_edges.accumulator_hi_limbs_range_constraint_4;
        const auto& accumulator_hi_limbs_range_constraint_tail =
            extended_edges.accumulator_hi_limbs_range_constraint_tail;
        const auto& accumulator_hi_limbs_range_constraint_0_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_0_shift;
        const auto& accumulator_hi_limbs_range_constraint_1_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_1_shift;
        const auto& accumulator_hi_limbs_range_constraint_2_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_2_shift;
        const auto& accumulator_hi_limbs_range_constraint_3_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_3_shift;
        const auto& accumulator_hi_limbs_range_constraint_4_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_4_shift;
        const auto& accumulator_hi_limbs_range_constraint_tail_shift =
            extended_edges.accumulator_hi_limbs_range_constraint_tail_shift;
        const auto& accumulators_binary_limbs_0 = extended_edges.accumulators_binary_limbs_0;
        const auto& accumulators_binary_limbs_1 = extended_edges.accumulators_binary_limbs_1;
        const auto& accumulators_binary_limbs_2 = extended_edges.accumulators_binary_limbs_2;
        const auto& accumulators_binary_limbs_3 = extended_edges.accumulators_binary_limbs_3;
        const auto& quotient_lo_limbs_range_constraint_0 = extended_edges.quotient_lo_limbs_range_constraint_0;
        const auto& quotient_lo_limbs_range_constraint_1 = extended_edges.quotient_lo_limbs_range_constraint_1;
        const auto& quotient_lo_limbs_range_constraint_2 = extended_edges.quotient_lo_limbs_range_constraint_2;
        const auto& quotient_lo_limbs_range_constraint_3 = extended_edges.quotient_lo_limbs_range_constraint_3;
        const auto& quotient_lo_limbs_range_constraint_4 = extended_edges.quotient_lo_limbs_range_constraint_4;
        const auto& quotient_lo_limbs_range_constraint_tail = extended_edges.quotient_lo_limbs_range_constraint_tail;
        const auto& quotient_lo_limbs_range_constraint_0_shift =
            extended_edges.quotient_lo_limbs_range_constraint_0_shift;
        const auto& quotient_lo_limbs_range_constraint_1_shift =
            extended_edges.quotient_lo_limbs_range_constraint_1_shift;
        const auto& quotient_lo_limbs_range_constraint_2_shift =
            extended_edges.quotient_lo_limbs_range_constraint_2_shift;
        const auto& quotient_lo_limbs_range_constraint_3_shift =
            extended_edges.quotient_lo_limbs_range_constraint_3_shift;
        const auto& quotient_lo_limbs_range_constraint_4_shift =
            extended_edges.quotient_lo_limbs_range_constraint_4_shift;
        const auto& quotient_lo_limbs_range_constraint_tail_shift =
            extended_edges.quotient_lo_limbs_range_constraint_tail_shift;
        const auto& quotient_hi_limbs_range_constraint_0 = extended_edges.quotient_hi_limbs_range_constraint_0;
        const auto& quotient_hi_limbs_range_constraint_1 = extended_edges.quotient_hi_limbs_range_constraint_1;
        const auto& quotient_hi_limbs_range_constraint_2 = extended_edges.quotient_hi_limbs_range_constraint_2;
        const auto& quotient_hi_limbs_range_constraint_3 = extended_edges.quotient_hi_limbs_range_constraint_3;
        const auto& quotient_hi_limbs_range_constraint_4 = extended_edges.quotient_hi_limbs_range_constraint_4;
        const auto& quotient_hi_limbs_range_constraint_tail = extended_edges.quotient_hi_limbs_range_constraint_tail;
        const auto& quotient_hi_limbs_range_constraint_0_shift =
            extended_edges.quotient_hi_limbs_range_constraint_0_shift;
        const auto& quotient_hi_limbs_range_constraint_1_shift =
            extended_edges.quotient_hi_limbs_range_constraint_1_shift;
        const auto& quotient_hi_limbs_range_constraint_2_shift =
            extended_edges.quotient_hi_limbs_range_constraint_2_shift;
        const auto& quotient_hi_limbs_range_constraint_3_shift =
            extended_edges.quotient_hi_limbs_range_constraint_3_shift;
        const auto& quotient_hi_limbs_range_constraint_4_shift =
            extended_edges.quotient_hi_limbs_range_constraint_4_shift;
        const auto& quotient_hi_limbs_range_constraint_tail_shift =
            extended_edges.quotient_hi_limbs_range_constraint_tail_shift;
        const auto& quotient_lo_binary_limbs = extended_edges.quotient_lo_binary_limbs;
        const auto& quotient_lo_binary_limbs_shift = extended_edges.quotient_lo_binary_limbs_shift;
        const auto& quotient_hi_binary_limbs = extended_edges.quotient_hi_binary_limbs;
        const auto& quotient_hi_binary_limbs_shift = extended_edges.quotient_hi_binary_limbs_shift;
        const auto& relation_wide_limbs_range_constraint_0 = extended_edges.relation_wide_limbs_range_constraint_0;
        const auto& relation_wide_limbs_range_constraint_1 = extended_edges.relation_wide_limbs_range_constraint_1;
        const auto& relation_wide_limbs_range_constraint_2 = extended_edges.relation_wide_limbs_range_constraint_2;
        const auto& relation_wide_limbs_range_constraint_3 = extended_edges.relation_wide_limbs_range_constraint_3;
        const auto& relation_wide_limbs_range_constraint_0_shift =
            extended_edges.relation_wide_limbs_range_constraint_0_shift;
        const auto& relation_wide_limbs_range_constraint_1_shift =
            extended_edges.relation_wide_limbs_range_constraint_1_shift;
        const auto& relation_wide_limbs_range_constraint_2_shift =
            extended_edges.relation_wide_limbs_range_constraint_2_shift;
        const auto& relation_wide_limbs_range_constraint_3_shift =
            extended_edges.relation_wide_limbs_range_constraint_3_shift;
        const auto& relation_wide_limbs = extended_edges.relation_wide_limbs;
        const auto& relation_wide_limbs_shift = extended_edges.relation_wide_limbs_shift;

        const auto& x_lo_y_hi = extended_edges.x_lo_y_hi;
        const auto& x_hi_z_1 = extended_edges.x_hi_z_1;
        const auto& y_lo_z_2 = extended_edges.y_lo_z_2;
        const auto& x_lo_y_hi_shift = extended_edges.x_lo_y_hi_shift;
        const auto& x_hi_z_1_shift = extended_edges.x_hi_z_1_shift;
        const auto& y_lo_z_2_shift = extended_edges.y_lo_z_2_shift;

        const auto& lagrange_odd = extended_edges.lagrange_odd;

        /**
         * @brief Check decomposition of a relation limb. Relation limbs are 72 bits, so the decompositon takes 6 14-bit
         * microlimbs
         *
         */
        auto check_relation_limb_decomposition = [MICRO_LIMB_SHIFT,
                                                  MICRO_LIMB_SHIFTx2,
                                                  MICRO_LIMB_SHIFTx3,
                                                  MICRO_LIMB_SHIFTx4,
                                                  MICRO_LIMB_SHIFTx5,
                                                  lagrange_odd](auto& micro_limb_0,
                                                                auto& micro_limb_1,
                                                                auto& micro_limb_2,
                                                                auto& micro_limb_3,
                                                                auto& micro_limb_4,
                                                                auto& micro_limb_5,
                                                                auto& decomposed_limb) {
            return (micro_limb_0 + micro_limb_1 * MICRO_LIMB_SHIFT + micro_limb_2 * MICRO_LIMB_SHIFTx2 +
                    micro_limb_3 * MICRO_LIMB_SHIFTx3 + micro_limb_4 * MICRO_LIMB_SHIFTx4 +
                    micro_limb_5 * MICRO_LIMB_SHIFTx5 - decomposed_limb) *
                   lagrange_odd;
        };

        /**
         * @brief Check the decomposition of a standard limb. Standard limbs are 68 bits, so we decompose them into 5
         * 14-bit microlimbs
         *
         */
        auto check_standard_limb_decomposition =
            [MICRO_LIMB_SHIFT, MICRO_LIMB_SHIFTx2, MICRO_LIMB_SHIFTx3, MICRO_LIMB_SHIFTx4, lagrange_odd](
                auto& micro_limb_0,
                auto& micro_limb_1,
                auto& micro_limb_2,
                auto& micro_limb_3,
                auto& micro_limb_4,
                auto& decomposed_limb) {
                return (micro_limb_0 + micro_limb_1 * MICRO_LIMB_SHIFT + micro_limb_2 * MICRO_LIMB_SHIFTx2 +
                        micro_limb_3 * MICRO_LIMB_SHIFTx3 + micro_limb_4 * MICRO_LIMB_SHIFTx4 - decomposed_limb) *
                       lagrange_odd;
            };

        /**
         * @brief Check the decomposition of a standard top limb. Standard top limb is 50 bits (254 = 68 * 3 + 50)
         *
         */
        auto check_standard_top_limb_decomposition =
            [MICRO_LIMB_SHIFT, MICRO_LIMB_SHIFTx2, MICRO_LIMB_SHIFTx3, lagrange_odd](
                auto& micro_limb_0, auto& micro_limb_1, auto& micro_limb_2, auto& micro_limb_3, auto& decomposed_limb) {
                return (micro_limb_0 + micro_limb_1 * MICRO_LIMB_SHIFT + micro_limb_2 * MICRO_LIMB_SHIFTx2 +
                        micro_limb_3 * MICRO_LIMB_SHIFTx3 - decomposed_limb) *
                       lagrange_odd;
            };

        /**
         * @brief Ensure that the last microlimb of a standard limb decomposition is 12 bits by checking a shifted
         * version.
         *
         */
        auto check_standard_tail_micro_limb_correctness = [SHIFT_12_TO_14, lagrange_odd](auto& nonshifted_micro_limb,
                                                                                         auto shifted_micro_limb) {
            return (nonshifted_micro_limb * SHIFT_12_TO_14 - shifted_micro_limb) * lagrange_odd;
        };

        /**
         * @brief Ensure that the last microlimb of a standard top limb decomposition is 8 bits by checking a shifted
         * version.
         *
         */
        auto check_top_tail_micro_limb_correctness = [SHIFT_8_TO_14, lagrange_odd](auto& nonshifted_micro_limb,
                                                                                   auto shifted_micro_limb) {
            return (nonshifted_micro_limb * SHIFT_8_TO_14 - shifted_micro_limb) * lagrange_odd;
        };

        /**
         * @brief Ensure that the last microlimb of z top limb decomposition is 4 bits by checking a shifted
         * version.
         *
         */
        auto check_z_top_tail_micro_limb_correctness = [SHIFT_4_TO_14, lagrange_odd](auto& nonshifted_micro_limb,
                                                                                     auto shifted_micro_limb) {
            return (nonshifted_micro_limb * SHIFT_4_TO_14 - shifted_micro_limb) * lagrange_odd;
        };

        /**
         * @brief Ensure that the last microlimb of quotient top limb decomposition is 10 bits by checking a shifted
         * version.
         *
         */
        auto check_quotient_top_tail_micro_limb_correctness =
            [SHIFT_10_TO_14, lagrange_odd](auto& nonshifted_micro_limb, auto shifted_micro_limb) {
                return (nonshifted_micro_limb * SHIFT_10_TO_14 - shifted_micro_limb) * lagrange_odd;
            };

        /**
         * @brief Check decomposition of wide 128-bit limbs into two 68-bit limbs.
         *
         */
        auto check_wide_limb_into_regular_limb_correctness =
            [LIMB_SHIFT, lagrange_odd](auto& low_limb, auto& high_limb, auto& wide_limb) {
                return (low_limb + high_limb * LIMB_SHIFT - wide_limb) * lagrange_odd;
            };
        // Check decomposition 50-72 bit limbs into microlimbs
        expected_full_length_univariates[0] = check_standard_limb_decomposition(p_x_low_limbs_range_constraint_0,
                                                                                p_x_low_limbs_range_constraint_1,
                                                                                p_x_low_limbs_range_constraint_2,
                                                                                p_x_low_limbs_range_constraint_3,
                                                                                p_x_low_limbs_range_constraint_4,
                                                                                p_x_low_limbs);
        expected_full_length_univariates[1] = check_standard_limb_decomposition(p_x_low_limbs_range_constraint_0_shift,
                                                                                p_x_low_limbs_range_constraint_1_shift,
                                                                                p_x_low_limbs_range_constraint_2_shift,
                                                                                p_x_low_limbs_range_constraint_3_shift,
                                                                                p_x_low_limbs_range_constraint_4_shift,
                                                                                p_x_low_limbs_shift);
        expected_full_length_univariates[2] = check_standard_limb_decomposition(p_x_high_limbs_range_constraint_0,
                                                                                p_x_high_limbs_range_constraint_1,
                                                                                p_x_high_limbs_range_constraint_2,
                                                                                p_x_high_limbs_range_constraint_3,
                                                                                p_x_high_limbs_range_constraint_4,
                                                                                p_x_high_limbs);
        expected_full_length_univariates[3] =
            check_standard_top_limb_decomposition(p_x_high_limbs_range_constraint_0_shift,
                                                  p_x_high_limbs_range_constraint_1_shift,
                                                  p_x_high_limbs_range_constraint_2_shift,
                                                  p_x_high_limbs_range_constraint_3_shift,
                                                  p_x_high_limbs_shift);

        expected_full_length_univariates[4] = check_standard_limb_decomposition(p_y_low_limbs_range_constraint_0,
                                                                                p_y_low_limbs_range_constraint_1,
                                                                                p_y_low_limbs_range_constraint_2,
                                                                                p_y_low_limbs_range_constraint_3,
                                                                                p_y_low_limbs_range_constraint_4,
                                                                                p_y_low_limbs);
        expected_full_length_univariates[5] = check_standard_limb_decomposition(p_y_low_limbs_range_constraint_0_shift,
                                                                                p_y_low_limbs_range_constraint_1_shift,
                                                                                p_y_low_limbs_range_constraint_2_shift,
                                                                                p_y_low_limbs_range_constraint_3_shift,
                                                                                p_y_low_limbs_range_constraint_4_shift,
                                                                                p_y_low_limbs_shift);
        expected_full_length_univariates[6] = check_standard_limb_decomposition(p_y_high_limbs_range_constraint_0,
                                                                                p_y_high_limbs_range_constraint_1,
                                                                                p_y_high_limbs_range_constraint_2,
                                                                                p_y_high_limbs_range_constraint_3,
                                                                                p_y_high_limbs_range_constraint_4,
                                                                                p_y_high_limbs);
        expected_full_length_univariates[7] =
            check_standard_top_limb_decomposition(p_y_high_limbs_range_constraint_0_shift,
                                                  p_y_high_limbs_range_constraint_1_shift,
                                                  p_y_high_limbs_range_constraint_2_shift,
                                                  p_y_high_limbs_range_constraint_3_shift,
                                                  p_y_high_limbs_shift);
        expected_full_length_univariates[8] = check_standard_limb_decomposition(z_lo_limbs_range_constraint_0,
                                                                                z_lo_limbs_range_constraint_1,
                                                                                z_lo_limbs_range_constraint_2,
                                                                                z_lo_limbs_range_constraint_3,
                                                                                z_lo_limbs_range_constraint_4,
                                                                                z_lo_limbs);
        expected_full_length_univariates[9] = check_standard_limb_decomposition(z_lo_limbs_range_constraint_0_shift,
                                                                                z_lo_limbs_range_constraint_1_shift,
                                                                                z_lo_limbs_range_constraint_2_shift,
                                                                                z_lo_limbs_range_constraint_3_shift,
                                                                                z_lo_limbs_range_constraint_4_shift,
                                                                                z_lo_limbs_shift);
        expected_full_length_univariates[10] = check_standard_limb_decomposition(z_hi_limbs_range_constraint_0,
                                                                                 z_hi_limbs_range_constraint_1,
                                                                                 z_hi_limbs_range_constraint_2,
                                                                                 z_hi_limbs_range_constraint_3,
                                                                                 z_hi_limbs_range_constraint_4,
                                                                                 z_hi_limbs);
        expected_full_length_univariates[11] = check_standard_limb_decomposition(z_hi_limbs_range_constraint_0_shift,
                                                                                 z_hi_limbs_range_constraint_1_shift,
                                                                                 z_hi_limbs_range_constraint_2_shift,
                                                                                 z_hi_limbs_range_constraint_3_shift,
                                                                                 z_hi_limbs_range_constraint_4_shift,
                                                                                 z_hi_limbs_shift);
        expected_full_length_univariates[12] =
            check_standard_limb_decomposition(accumulator_lo_limbs_range_constraint_0,
                                              accumulator_lo_limbs_range_constraint_1,
                                              accumulator_lo_limbs_range_constraint_2,
                                              accumulator_lo_limbs_range_constraint_3,
                                              accumulator_lo_limbs_range_constraint_4,
                                              accumulators_binary_limbs_0);
        expected_full_length_univariates[13] =
            check_standard_limb_decomposition(accumulator_lo_limbs_range_constraint_0_shift,
                                              accumulator_lo_limbs_range_constraint_1_shift,
                                              accumulator_lo_limbs_range_constraint_2_shift,
                                              accumulator_lo_limbs_range_constraint_3_shift,
                                              accumulator_lo_limbs_range_constraint_4_shift,
                                              accumulators_binary_limbs_1);
        expected_full_length_univariates[14] =
            check_standard_limb_decomposition(accumulator_hi_limbs_range_constraint_0,
                                              accumulator_hi_limbs_range_constraint_1,
                                              accumulator_hi_limbs_range_constraint_2,
                                              accumulator_hi_limbs_range_constraint_3,
                                              accumulator_hi_limbs_range_constraint_4,
                                              accumulators_binary_limbs_2);
        expected_full_length_univariates[15] =
            check_standard_top_limb_decomposition(accumulator_hi_limbs_range_constraint_0_shift,
                                                  accumulator_hi_limbs_range_constraint_1_shift,
                                                  accumulator_hi_limbs_range_constraint_2_shift,
                                                  accumulator_hi_limbs_range_constraint_3_shift,
                                                  accumulators_binary_limbs_3);
        expected_full_length_univariates[16] = check_standard_limb_decomposition(quotient_lo_limbs_range_constraint_0,
                                                                                 quotient_lo_limbs_range_constraint_1,
                                                                                 quotient_lo_limbs_range_constraint_2,
                                                                                 quotient_lo_limbs_range_constraint_3,
                                                                                 quotient_lo_limbs_range_constraint_4,
                                                                                 quotient_lo_binary_limbs);
        expected_full_length_univariates[17] =
            check_standard_limb_decomposition(quotient_lo_limbs_range_constraint_0_shift,
                                              quotient_lo_limbs_range_constraint_1_shift,
                                              quotient_lo_limbs_range_constraint_2_shift,
                                              quotient_lo_limbs_range_constraint_3_shift,
                                              quotient_lo_limbs_range_constraint_4_shift,
                                              quotient_lo_binary_limbs_shift);
        expected_full_length_univariates[18] = check_standard_limb_decomposition(quotient_hi_limbs_range_constraint_0,
                                                                                 quotient_hi_limbs_range_constraint_1,
                                                                                 quotient_hi_limbs_range_constraint_2,
                                                                                 quotient_hi_limbs_range_constraint_3,
                                                                                 quotient_hi_limbs_range_constraint_4,
                                                                                 quotient_hi_binary_limbs);
        expected_full_length_univariates[19] =
            check_standard_top_limb_decomposition(quotient_hi_limbs_range_constraint_0_shift,
                                                  quotient_hi_limbs_range_constraint_1_shift,
                                                  quotient_hi_limbs_range_constraint_2_shift,
                                                  quotient_hi_limbs_range_constraint_3_shift,
                                                  quotient_hi_binary_limbs_shift);

        expected_full_length_univariates[20] =
            check_relation_limb_decomposition(relation_wide_limbs_range_constraint_0,
                                              relation_wide_limbs_range_constraint_1,
                                              relation_wide_limbs_range_constraint_2,
                                              relation_wide_limbs_range_constraint_3,
                                              p_x_high_limbs_range_constraint_tail_shift,
                                              accumulator_hi_limbs_range_constraint_tail_shift,
                                              relation_wide_limbs);
        expected_full_length_univariates[21] =
            check_relation_limb_decomposition(relation_wide_limbs_range_constraint_0_shift,
                                              relation_wide_limbs_range_constraint_1_shift,
                                              relation_wide_limbs_range_constraint_2_shift,
                                              relation_wide_limbs_range_constraint_3_shift,
                                              p_y_high_limbs_range_constraint_tail_shift,
                                              quotient_hi_limbs_range_constraint_tail_shift,
                                              relation_wide_limbs_shift);

        // Contributions enforcing tail range constraints
        expected_full_length_univariates[22] = check_standard_tail_micro_limb_correctness(
            p_x_low_limbs_range_constraint_4, p_x_low_limbs_range_constraint_tail);

        expected_full_length_univariates[23] = check_standard_tail_micro_limb_correctness(
            p_x_low_limbs_range_constraint_4_shift, p_x_low_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[24] = check_standard_tail_micro_limb_correctness(
            p_x_high_limbs_range_constraint_4, p_x_high_limbs_range_constraint_tail);

        expected_full_length_univariates[25] = check_top_tail_micro_limb_correctness(
            p_x_high_limbs_range_constraint_3_shift, p_x_high_limbs_range_constraint_4_shift);

        expected_full_length_univariates[26] = check_standard_tail_micro_limb_correctness(
            p_y_low_limbs_range_constraint_4, p_y_low_limbs_range_constraint_tail);

        expected_full_length_univariates[27] = check_standard_tail_micro_limb_correctness(
            p_y_low_limbs_range_constraint_4_shift, p_y_low_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[28] = check_standard_tail_micro_limb_correctness(
            p_y_high_limbs_range_constraint_4, p_y_high_limbs_range_constraint_tail);

        expected_full_length_univariates[29] = check_top_tail_micro_limb_correctness(
            p_y_high_limbs_range_constraint_3_shift, p_y_high_limbs_range_constraint_4_shift);

        expected_full_length_univariates[30] =
            check_standard_tail_micro_limb_correctness(z_lo_limbs_range_constraint_4, z_lo_limbs_range_constraint_tail);

        expected_full_length_univariates[31] = check_standard_tail_micro_limb_correctness(
            z_lo_limbs_range_constraint_4_shift, z_lo_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[32] =
            check_z_top_tail_micro_limb_correctness(z_hi_limbs_range_constraint_4, z_hi_limbs_range_constraint_tail);

        expected_full_length_univariates[33] = check_z_top_tail_micro_limb_correctness(
            z_hi_limbs_range_constraint_4_shift, z_hi_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[34] = check_standard_tail_micro_limb_correctness(
            accumulator_lo_limbs_range_constraint_4, accumulator_lo_limbs_range_constraint_tail);
        expected_full_length_univariates[35] = check_standard_tail_micro_limb_correctness(
            accumulator_lo_limbs_range_constraint_4_shift, accumulator_lo_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[36] = check_standard_tail_micro_limb_correctness(
            accumulator_hi_limbs_range_constraint_4, accumulator_hi_limbs_range_constraint_tail);

        expected_full_length_univariates[37] = check_top_tail_micro_limb_correctness(
            accumulator_hi_limbs_range_constraint_3_shift, accumulator_hi_limbs_range_constraint_4_shift);

        expected_full_length_univariates[38] = check_standard_tail_micro_limb_correctness(
            quotient_lo_limbs_range_constraint_4, quotient_lo_limbs_range_constraint_tail);

        expected_full_length_univariates[39] = check_standard_tail_micro_limb_correctness(
            quotient_lo_limbs_range_constraint_4_shift, quotient_lo_limbs_range_constraint_tail_shift);

        expected_full_length_univariates[40] = check_standard_tail_micro_limb_correctness(
            quotient_hi_limbs_range_constraint_4, quotient_hi_limbs_range_constraint_tail);

        expected_full_length_univariates[41] = check_quotient_top_tail_micro_limb_correctness(
            quotient_hi_limbs_range_constraint_3_shift, quotient_hi_limbs_range_constraint_4_shift);

        // Constraints for decomposition of EccOpQueue values

        expected_full_length_univariates[42] =
            check_wide_limb_into_regular_limb_correctness(p_x_low_limbs, p_x_low_limbs_shift, x_lo_y_hi);

        expected_full_length_univariates[43] =
            check_wide_limb_into_regular_limb_correctness(p_x_high_limbs, p_x_high_limbs_shift, x_hi_z_1);

        expected_full_length_univariates[44] =
            check_wide_limb_into_regular_limb_correctness(p_y_low_limbs, p_y_low_limbs_shift, y_lo_z_2);

        expected_full_length_univariates[45] =
            check_wide_limb_into_regular_limb_correctness(p_y_high_limbs, p_y_high_limbs_shift, x_lo_y_hi_shift);

        expected_full_length_univariates[46] =
            check_wide_limb_into_regular_limb_correctness(z_lo_limbs, z_hi_limbs, x_hi_z_1_shift);

        expected_full_length_univariates[47] =
            check_wide_limb_into_regular_limb_correctness(z_lo_limbs_shift, z_hi_limbs_shift, y_lo_z_2_shift);

        validate_evaluations(expected_full_length_univariates, relation, extended_edges, relation_parameters);
    };
    run_test(/* is_random_input=*/true);
    run_test(/* is_random_input=*/false);
};
} // namespace proof_system::honk_relation_tests
