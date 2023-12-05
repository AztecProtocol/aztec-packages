#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"

#include <gtest/gtest.h>

using namespace proof_system::honk;
using CircuitBuilder = flavor::GoblinTranslator::CircuitBuilder;
using Transcript = flavor::GoblinTranslator::Transcript;
using OpQueue = proof_system::ECCOpQueue;

namespace test_goblin_translator_composer {

namespace {
auto& engine = numeric::random::get_debug_engine();
}

std::vector<uint32_t> add_variables(auto& circuit_constructor, std::vector<barretenberg::fr> variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(circuit_constructor.add_variable(variables[i]));
    }
    return res;
}

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
TEST_F(GoblinTranslatorComposerTests, Basic)
{
    using point = barretenberg::g1::affine_element;
    using scalar = barretenberg::fr;
    using Fq = barretenberg::fq;

    auto P1 = point::random_element();
    auto P2 = point::random_element();
    auto z = scalar::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<proof_system::ECCOpQueue>();
    for (size_t i = 0; i < 500; i++) {
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
    }

    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq(1377));
    Fq translation_batching_challenge = prover_transcript->get_challenge("Translation:batching_challenge");
    Fq translation_evaluation_challenge = Fq::random_element();
    auto circuit_builder = CircuitBuilder(translation_batching_challenge, translation_evaluation_challenge, op_queue);
    circuit_builder.feed_ecc_op_queue_into_circuit(op_queue);
    EXPECT_TRUE(circuit_builder.check_circuit());

    auto composer = GoblinTranslatorComposer();
    auto prover = composer.create_prover(circuit_builder, prover_transcript);
    info("PROVER TRANSCRIPT: ");
    auto proof = prover.construct_proof();
    // prover_transcript->print();

    auto verifier_transcript = std::make_shared<Transcript>();
    verifier_transcript->send_to_verifier("init", Fq(1377));
    auto verifier = composer.create_verifier(circuit_builder, verifier_transcript);
    info("VERIFIER TRANSCRIPT: ");
    bool verified = verifier.verify_proof(proof);
    // verifier_transcript->print();
    EXPECT_TRUE(verified);
}

} // namespace test_goblin_translator_composer
