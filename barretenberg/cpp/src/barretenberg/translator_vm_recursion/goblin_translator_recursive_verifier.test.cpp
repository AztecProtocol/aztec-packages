#include "barretenberg/translator_vm_recursion/goblin_translator_recursive_verifier.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/goblin_translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/goblin_translator_prover.hpp"
#include "barretenberg/translator_vm/goblin_translator_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>
namespace bb {

template <typename RecursiveFlavor> class GoblinTranslatorRecursiveTests : public ::testing::Test {
  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProver = GoblinTranslatorProver;
    using InnerVerifier = GoblinTranslatorVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;

    using RecursiveVerifier = GoblinTranslatorRecursiveVerifier_<RecursiveFlavor>;

    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsGoblinUltraBuilder<OuterBuilder>, GoblinUltraFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using Transcript = InnerFlavor::Transcript;

    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

    static void test_recursive_verification()
    {
        auto P1 = InnerG1::random_element();
        auto P2 = InnerG1::random_element();
        auto z = InnerFF::random_element();

        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        op_queue->append_nonzero_ops();

        for (size_t i = 0; i < 500; i++) {
            op_queue->add_accumulate(P1);
            op_queue->mul_accumulate(P2, z);
        }

        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", InnerBF::random_element());
        // normally this would be the eccvm proof
        auto fake_inital_proof = prover_transcript->export_proof();
        InnerBF translation_batching_challenge =
            prover_transcript->template get_challenge<InnerBF>("Translation:batching_challenge");
        InnerBF translation_evaluation_challenge = InnerBF::random_element();

        auto circuit_builder = InnerBuilder(translation_batching_challenge, translation_evaluation_challenge, op_queue);
        EXPECT_TRUE(circuit_builder.check_circuit());

        InnerProver prover{ circuit_builder, prover_transcript };
        auto proof = prover.construct_proof();

        proof.insert(proof.begin(), fake_inital_proof.begin(), fake_inital_proof.end());

        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key);
        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };
        auto pairing_points = verifier.verify_proof(proof);
        info("Recursive Verifier: num gates = ", outer_circuit.num_gates);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        auto native_verifier_transcript = std::make_shared<Transcript>(prover_transcript->proof_data);
        native_verifier_transcript->template receive_from_prover<InnerBF>("init");
        InnerVerifier native_verifier(prover.key, native_verifier_transcript);
        bool native_result = native_verifier.verify_proof(proof);
        auto recursive_result = native_verifier.key->pcs_verification_key->pairing_check(pairing_points[0].get_value(),
                                                                                         pairing_points[1].get_value());
        EXPECT_EQ(recursive_result, native_result);

        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        EXPECT_EQ(verifier.key->circuit_size, verification_key->circuit_size);
        EXPECT_EQ(verifier.key->log_circuit_size, verification_key->log_circuit_size);
        EXPECT_EQ(verifier.key->num_public_inputs, verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        if constexpr (!IsSimulator<OuterBuilder>) {
            auto instance = std::make_shared<OuterProverInstance>(outer_circuit);
            OuterProver prover(instance);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(instance->proving_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    }
};

using FlavorTypes = testing::Types<GoblinTranslatorRecursiveFlavor_<UltraCircuitBuilder>,
                                   GoblinTranslatorRecursiveFlavor_<GoblinUltraCircuitBuilder>,
                                   GoblinTranslatorRecursiveFlavor_<CircuitSimulatorBN254>>;

TYPED_TEST_SUITE(GoblinTranslatorRecursiveTests, FlavorTypes);

TYPED_TEST(GoblinTranslatorRecursiveTests, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};
} // namespace bb