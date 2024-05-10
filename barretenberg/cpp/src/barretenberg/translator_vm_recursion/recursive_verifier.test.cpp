#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/goblin_translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"
#include "barretenberg/translator_vm/goblin_translator_verifier.hpp"
#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_verifier.hpp"
#include <gtest/gtest.h>
namespace bb {

class GoblinTranslatorTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(GoblinTranslatorTests, Recursive)
{
    using G1 = g1::affine_element;
    using Fr = fr;
    using Fq = fq;
    using CircuitBuilder = GoblinTranslatorFlavor::CircuitBuilder;
    using Flavor = bb::GoblinTranslatorFlavor;
    using Transcript = GoblinTranslatorFlavor::Transcript;
    using RecursiveVerifer =
        GoblinTranslatorRecursiveVerifier_<GoblinTranslatorRecursiveFlavor_<bb::UltraCircuitBuilder>>;

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
    auto fake_inital_proof = prover_transcript->export_proof();
    Fq translation_batching_challenge = prover_transcript->template get_challenge<Fq>("Translation:batching_challenge");
    Fq translation_evaluation_challenge = Fq::random_element();

    auto circuit_builder = CircuitBuilder(translation_batching_challenge, translation_evaluation_challenge, op_queue);
    EXPECT_TRUE(circuit_builder.check_circuit());

    GoblinTranslatorProver prover{ circuit_builder, prover_transcript };
    auto proof = prover.construct_proof();

    proof.insert(proof.begin(), fake_inital_proof.begin(), fake_inital_proof.end());

    auto verification_key = std::make_shared<Flavor::VerificationKey>(prover.key);
    UltraCircuitBuilder verifier_circuit;
    RecursiveVerifer verifier{ &verifier_circuit, verification_key };
    verifier.verify_proof(proof);
    info("Recursive Verifier: num gates = ", verifier_circuit.num_gates);

    // Check for a failure flag in the recursive verifier circuit
    EXPECT_EQ(verifier_circuit.failed(), false) << verifier_circuit.err();

    auto native_verifier_transcript = std::make_shared<Transcript>(prover_transcript->proof_data);
    native_verifier_transcript->template receive_from_prover<Fq>("init");
    GoblinTranslatorVerifier native_verifier(prover.key, native_verifier_transcript);
    bool verified = native_verifier.verify_proof(proof);
    EXPECT_TRUE(verified);

    auto recursive_manifest = verifier.transcript->get_manifest();
    auto native_manifest = native_verifier.transcript->get_manifest();
    for (size_t i = 0; i < recursive_manifest.size(); ++i) {
        EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
    }
}
} // namespace bb