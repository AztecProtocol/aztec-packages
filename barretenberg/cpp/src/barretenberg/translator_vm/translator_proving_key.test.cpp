#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/plonk_honk_shared/library/grand_product_library.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"

#include <gtest/gtest.h>
using namespace bb;

namespace {
using CircuitBuilder = TranslatorFlavor::CircuitBuilder;
using Transcript = TranslatorFlavor::Transcript;
using OpQueue = ECCOpQueue;
using FF = TranslatorFlavor::Curve::ScalarField;
auto& engine = numeric::get_debug_randomness();

class TranslatorProvingKeyTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }
};
} // namespace

template <typename Flavor, typename Relation> void check_relation(auto circuit_size, auto& polynomials, auto params)
{
    for (size_t i = 0; i < circuit_size; i++) {
        // Define the appropriate SumcheckArrayOfValuesOverSubrelations type for this relation and initialize to zero
        using SumcheckArrayOfValuesOverSubrelations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
        SumcheckArrayOfValuesOverSubrelations result;
        for (auto& element : result) {
            element = 0;
        }

        // Evaluate each constraint in the relation and check that each is satisfied
        Relation::accumulate(result, polynomials.get_row(i), params, 1);
        for (auto& element : result) {
            ASSERT_EQ(element, 0);
        }
    }
}

/**
 * @brief Simple test to check the interleaving method produces the expected results.
 *
 */
TEST_F(TranslatorProvingKeyTests, InterleaveBasic)
{
    std::vector<FF> values = { FF{ 1 }, FF{ 2 }, FF{ 3 } };
    std::vector<Polynomial<FF>> group = { Polynomial<FF>(std::span<FF>(values)),
                                          Polynomial<FF>(std::span<FF>(values)),
                                          Polynomial<FF>(std::span<FF>(values)) };
    Polynomial<FF> result(group.size() * group[0].size());
    TranslatorProvingKey::interleave(RefVector(group), result);
    std::vector<FF> vec = { FF{ 1 }, FF{ 1 }, FF{ 1 }, FF{ 2 }, FF{ 2 }, FF{ 2 }, FF{ 3 }, FF{ 3 }, FF{ 3 } };
    Polynomial<FF> expected_result{ std::span<FF>(vec) };
    EXPECT_EQ(result, expected_result);
}

/**
 * @brief Ensures the concatenation by interleaving function still preserves the correctness of relations.
 *
 */
TEST_F(TranslatorProvingKeyTests, InterleaveFull)
{
    const size_t mini_circuit_size = 2048;
    auto full_circuit_size = mini_circuit_size * TranslatorFlavor::CONCATENATION_GROUP_SIZE;

    // We only need gamma, because permutationr elation only uses gamma
    FF gamma = FF::random_element();

    // Fill relation parameters
    RelationParameters<FF> params;
    params.gamma = gamma;

    // Create storage for polynomials
    auto proving_key = std::make_shared<TranslatorFlavor::ProvingKey>(full_circuit_size);
    TranslatorProvingKey key{ proving_key, mini_circuit_size };
    TranslatorFlavor::ProverPolynomials& prover_polynomials = proving_key->polynomials;

    // Fill in lagrange polynomials used in the permutation relation
    prover_polynomials.lagrange_first.at(0) = 1;
    prover_polynomials.lagrange_last.at(full_circuit_size - 1) = 1;

    // Put random values in all the non-concatenated constraint polynomials used to range constrain the values
    auto fill_polynomial_with_random_14_bit_values = [&](auto& polynomial) {
        for (size_t i = polynomial.start_index(); i < mini_circuit_size; i++) {
            polynomial.at(i) = engine.get_random_uint16() & ((1 << TranslatorFlavor::MICRO_LIMB_BITS) - 1);
        }
    };

    for (const auto& group : prover_polynomials.get_groups_to_be_concatenated()) {
        for (auto& poly : group) {
            fill_polynomial_with_random_14_bit_values(poly);
        }
    }

    key.compute_concatenated_polynomials_by_interleaving();
    // Compute ordered range constraint polynomials that go in the denominator of the grand product polynomial
    key.compute_translator_range_constraint_ordered_polynomials();

    // Compute the fixed numerator (part of verification key)
    key.compute_extra_range_constraint_numerator();

    // Compute the grand product polynomial
    compute_grand_product<TranslatorFlavor, bb::TranslatorPermutationRelation<FF>>(prover_polynomials, params);
    prover_polynomials.z_perm_shift = prover_polynomials.z_perm.shifted();

    // Check that permutation relation is satisfied across each row of the prover polynomials
    check_relation<TranslatorFlavor, TranslatorPermutationRelation<FF>>(full_circuit_size, prover_polynomials, params);
}
