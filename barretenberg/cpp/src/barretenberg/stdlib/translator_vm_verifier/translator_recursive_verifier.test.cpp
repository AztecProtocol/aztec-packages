#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <gtest/gtest.h>
namespace bb {

/**
 * @brief Test suite for standalone recursive verification of translation proofs.
 * @details `Inner*` types describe the type of circuits (and everything else required to generate a proof) that we aim
 * to recursively verify. `Outer*` describes the arithmetisation of the recursive verifier circuit and the types
 * required to ensure the recursive verifier circuit is correct (i.e. by producing a proof and verifying it).
 */

// TODO(https://github.com/AztecProtocol/barretenberg/issues/980): Add failing tests after we have a proper shared
// transcript interface between ECCVM and Translator and we are able to deserialise and serialise the transcript
// correctly.
class TranslatorRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = TranslatorRecursiveFlavor;
    using InnerFlavor = RecursiveFlavor::NativeFlavor;
    using InnerBuilder = InnerFlavor::CircuitBuilder;
    using InnerProvingKey = TranslatorProvingKey;
    using InnerProver = TranslatorProver;
    using InnerVerifier = TranslatorVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;

    using RecursiveVerifier = TranslatorRecursiveVerifier;

    using OuterBuilder = RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using TranslatorBF = TranslatorRecursiveFlavor::BF;

    using Transcript = InnerFlavor::Transcript;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static std::shared_ptr<bb::ECCOpQueue> create_op_queue(const size_t num_ops)
    {
        auto P1 = InnerG1::random_element();
        auto P2 = InnerG1::random_element();
        auto z = InnerFF::random_element();

        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        op_queue->no_op_ultra_only();

        for (size_t i = 0; i < num_ops; i++) {
            op_queue->add_accumulate(P1);
            op_queue->mul_accumulate(P2, z);
        }
        return op_queue;
    }

    static void test_recursive_verification()
    {
        using NativeVerifierCommitmentKey = InnerFlavor::VerifierCommitmentKey;
        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
        auto op_queue = create_op_queue(500);

        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", InnerBF::random_element());
        // normally this would be the eccvm proof
        auto fake_inital_proof = prover_transcript->export_proof();

        InnerBF batching_challenge_v = InnerBF::random_element();
        InnerBF evaluation_challenge_x = InnerBF::random_element();

        auto circuit_builder = InnerBuilder(batching_challenge_v, evaluation_challenge_x, op_queue);
        EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        InnerProver prover{ proving_key, prover_transcript };
        auto proof = prover.construct_proof();

        OuterBuilder outer_circuit;

        // Mock a previous verifier that would in reality be the ECCVM recursive verifier
        stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, fake_inital_proof);
        auto transcript = std::make_shared<RecursiveFlavor::Transcript>();
        transcript->load_proof(stdlib_proof);
        [[maybe_unused]] auto _ = transcript->template receive_from_prover<RecursiveFlavor::BF>("init");

        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key->proving_key);
        RecursiveVerifier verifier{ &outer_circuit, verification_key, transcript };
        typename RecursiveVerifier::PairingPoints pairing_points =
            verifier.verify_proof(proof, evaluation_challenge_x, batching_challenge_v);
        pairing_points.set_public();
        info("Recursive Verifier: num gates = ", outer_circuit.num_gates);

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        auto native_verifier_transcript = std::make_shared<Transcript>();
        native_verifier_transcript->load_proof(fake_inital_proof);
        native_verifier_transcript->template receive_from_prover<InnerBF>("init");
        InnerVerifier native_verifier(verification_key, native_verifier_transcript);
        bool native_result = native_verifier.verify_proof(proof, evaluation_challenge_x, batching_challenge_v);
        NativeVerifierCommitmentKey pcs_vkey{};
        auto recursive_result = pcs_vkey.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value());
        EXPECT_EQ(recursive_result, native_result);

        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        EXPECT_EQ(static_cast<uint64_t>(verifier.key->log_circuit_size.get_value()),
                  verification_key->log_circuit_size);
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->num_public_inputs.get_value()),
                  verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            auto verification_key = std::make_shared<OuterFlavor::VerificationKey>(proving_key->get_precomputed());
            OuterProver prover(proving_key, verification_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        }
    }

    static void test_independent_vk_hash()
    {

        // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
        auto get_blocks = [](size_t num_ops)
            -> std::tuple<OuterBuilder::ExecutionTrace, std::shared_ptr<OuterFlavor::VerificationKey>> {
            auto op_queue = create_op_queue(num_ops);

            auto prover_transcript = std::make_shared<Transcript>();
            prover_transcript->send_to_verifier("init", InnerBF::random_element());

            // normally this would be the eccvm proof
            auto fake_inital_proof = prover_transcript->export_proof();
            InnerBF batching_challenge_v = InnerBF::random_element();
            InnerBF evaluation_challenge_x = InnerBF::random_element();

            auto inner_circuit = InnerBuilder(batching_challenge_v, evaluation_challenge_x, op_queue);

            // Generate a proof over the inner circuit
            auto inner_proving_key = std::make_shared<TranslatorProvingKey>(inner_circuit);
            InnerProver inner_prover(inner_proving_key, prover_transcript);
            info("test circuit size: ", inner_proving_key->proving_key->circuit_size);
            auto verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(inner_prover.key->proving_key);
            auto inner_proof = inner_prover.construct_proof();

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;

            // Mock a previous verifier that would in reality be the ECCVM recursive verifier
            stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, fake_inital_proof);
            auto transcript = std::make_shared<typename RecursiveFlavor::Transcript>();
            transcript->load_proof(stdlib_proof);
            [[maybe_unused]] auto _ = transcript->template receive_from_prover<typename RecursiveFlavor::BF>("init");

            RecursiveVerifier verifier{ &outer_circuit, verification_key, transcript };
            typename RecursiveVerifier::PairingPoints pairing_points =
                verifier.verify_proof(inner_proof,
                                      TranslatorBF::from_witness(&outer_circuit, evaluation_challenge_x),
                                      TranslatorBF::from_witness(&outer_circuit, batching_challenge_v));
            pairing_points.set_public();

            auto outer_proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            auto outer_verification_key =
                std::make_shared<typename OuterFlavor::VerificationKey>(outer_proving_key->get_precomputed());

            return { outer_circuit.blocks, outer_verification_key };
        };

        auto [blocks_256, verification_key_256] = get_blocks(256);
        auto [blocks_512, verification_key_512] = get_blocks(512);

        compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_256, blocks_512 },
                                                                { verification_key_256, verification_key_512 });
    };
};

TEST_F(TranslatorRecursiveTests, SingleRecursiveVerification)
{
    TranslatorRecursiveTests::test_recursive_verification();
};

TEST_F(TranslatorRecursiveTests, IndependentVKHash)
{
    TranslatorRecursiveTests::test_independent_vk_hash();
};
} // namespace bb
