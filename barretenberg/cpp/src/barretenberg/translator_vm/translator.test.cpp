#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
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
auto& engine = numeric::get_debug_randomness();

class TranslatorTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path()); }
};
} // namespace

/**
 * @brief Test simple circuit with public inputs
 *
 */
TEST_F(TranslatorTests, Basic)
{
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;

    auto P1 = G1::random_element();
    auto P2 = G1::random_element();
    auto z = Fr::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    op_queue->append_nonzero_ops();

    for (size_t i = 0; i < 500; i++) {
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
    }

    auto prover_transcript = std::make_shared<Transcript>();
    prover_transcript->send_to_verifier("init", Fq::random_element());
    prover_transcript->export_proof();
    Fq translation_batching_challenge = Fq::random_element();
    Fq translation_evaluation_challenge = Fq::random_element();

    auto circuit_builder = CircuitBuilder(translation_batching_challenge, translation_evaluation_challenge, op_queue);
    EXPECT_TRUE(circuit_builder.check_circuit());
    auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
    TranslatorProver prover{ proving_key, prover_transcript };
    auto proof = prover.construct_proof();

    auto verifier_transcript = std::make_shared<Transcript>(prover_transcript->proof_data);
    verifier_transcript->template receive_from_prover<Fq>("init");
    auto verification_key = std::make_shared<TranslatorFlavor::VerificationKey>(proving_key->proving_key);
    TranslatorVerifier verifier(verification_key, verifier_transcript);
    bool verified = verifier.verify_proof(proof);
    EXPECT_TRUE(verified);
}
