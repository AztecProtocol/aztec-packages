#include <array>
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
#include <string>
#include <unordered_set>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/honk/composer/goblin_translator_composer.hpp"
#include "barretenberg/honk/proof_system/goblin_translator_prover.hpp"
#include "barretenberg/honk/proof_system/prover.hpp"
#include "barretenberg/honk/sumcheck/relations/permutation_relation.hpp"
#include "barretenberg/honk/sumcheck/relations/relation_parameters.hpp"
#include "barretenberg/honk/sumcheck/sumcheck_round.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"

using namespace proof_system::honk;

namespace test_goblin_translator_composer {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

std::vector<uint32_t> add_variables(auto& circuit_constructor, std::vector<fr> variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(circuit_constructor.add_variable(variables[i]));
    }
    return res;
}

void prove_and_verify(auto& circuit_constructor, auto& composer, bool expected_result)
{
    auto prover = composer.create_prover(circuit_constructor);
    auto verifier = composer.create_verifier(circuit_constructor);
    auto proof = prover.construct_proof();
    bool verified = verifier.verify_proof(proof);
    EXPECT_EQ(verified, expected_result);
};

void ensure_non_zero(auto& polynomial)
{
    bool has_non_zero_coefficient = false;
    for (auto& coeff : polynomial) {
        has_non_zero_coefficient |= !coeff.is_zero();
    }
    ASSERT_TRUE(has_non_zero_coefficient);
}

class GoblinTranslatorComposerTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { barretenberg::srs::init_crs_factory("../srs_db/ignition"); }
};

/**
 * @brief Test simple circuit with public inputs
 *
 */
TEST_F(GoblinTranslatorComposerTests, Start)
{
    using point = barretenberg::g1::affine_element;
    using scalar = barretenberg::fr;
    using Fq = barretenberg::fq;

    auto P1 = point::random_element();
    auto P2 = point::random_element();
    auto z = scalar::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    ECCOpQueue op_queue;
    for (size_t i = 0; i < 500; i++) {
        op_queue.add_accumulate(P1);
        op_queue.mul_accumulate(P2, z);
    }
    Fq batching_challenge = fq::random_element();
    Fq x = Fq::random_element();
    auto circuit_builder = GoblinTranslatorCircuitBuilder(batching_challenge, x);
    circuit_builder.feed_ecc_op_queue_into_circuit(op_queue, batching_challenge, x);
    EXPECT_TRUE(circuit_builder.check_circuit());

    auto composer = GoblinTranslatorComposer();
    prove_and_verify(circuit_builder, composer, /*expected_result=*/true);
}

} // namespace test_goblin_translator_composer
