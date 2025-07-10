#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/test_utils/tamper_proof.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_debug_randomness();
}
namespace bb {
class ECCVMRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = ECCVMRecursiveFlavor;
    using InnerFlavor = RecursiveFlavor::NativeFlavor;
    using InnerBuilder = InnerFlavor::CircuitBuilder;
    using InnerProver = ECCVMProver;
    using InnerVerifier = ECCVMVerifier;
    using InnerG1 = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerBF = InnerFlavor::BF;
    using InnerPK = InnerFlavor::ProvingKey;
    using InnerVK = InnerFlavor::VerificationKey;

    using Transcript = InnerFlavor::Transcript;
    using StdlibTranscript = RecursiveFlavor::Transcript;

    using RecursiveVerifier = ECCVMRecursiveVerifier;

    using OuterBuilder = RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    /**
     * @brief Adds operations in BN254 to the op_queue and then constructs and ECCVM circuit from the op_queue.
     *
     * @param engine
     * @return ECCVMCircuitBuilder
     */
    static InnerBuilder generate_circuit(numeric::RNG* engine = nullptr, const size_t num_iterations = 1)
    {
        using Curve = curve::BN254;
        using G1 = Curve::Element;
        using Fr = Curve::ScalarField;

        std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
        G1 a = G1::random_element(engine);
        G1 b = G1::random_element(engine);
        G1 c = G1::random_element(engine);
        Fr x = Fr::random_element(engine);
        Fr y = Fr::random_element(engine);
        for (size_t idx = 0; idx < num_iterations; idx++) {
            op_queue->add_accumulate(a);
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->mul_accumulate(b, y);
            op_queue->add_accumulate(a);
            op_queue->mul_accumulate(b, x);
            op_queue->eq_and_reset();
            op_queue->add_accumulate(c);
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->eq_and_reset();
            op_queue->mul_accumulate(a, x);
            op_queue->mul_accumulate(b, x);
            op_queue->mul_accumulate(c, x);
        }
        InnerBuilder builder{ op_queue };
        return builder;
    }

    static void test_recursive_verification()
    {
        InnerBuilder builder = generate_circuit(&engine);
        std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
        InnerProver prover(builder, prover_transcript);
        ECCVMProof proof = prover.construct_proof();
        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(prover.key);

        info("ECCVM Recursive Verifier");
        OuterBuilder outer_circuit;
        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ &outer_circuit, verification_key, stdlib_verifier_transcript };
        verifier.transcript->enable_manifest();
        auto [opening_claim, ipa_transcript] = verifier.verify_proof(proof);
        stdlib::recursion::PairingPoints<OuterBuilder>::add_default_to_public_inputs(outer_circuit);

        info("Recursive Verifier: num gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
        InnerVerifier native_verifier(verifier_transcript);
        native_verifier.transcript->enable_manifest();
        bool native_result = native_verifier.verify_proof(proof);
        EXPECT_TRUE(native_result);
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();

        ASSERT(recursive_manifest.size() > 0);
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key is the same
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->circuit_size.get_value()), verification_key->circuit_size);
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->log_circuit_size.get_value()),
                  verification_key->log_circuit_size);
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->num_public_inputs.get_value()),
                  verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
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

    static void test_recursive_verification_failure()
    {
        InnerBuilder builder = generate_circuit(&engine);
        builder.op_queue->add_erroneous_equality_op_for_testing();
        std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
        InnerProver prover(builder, prover_transcript);
        ECCVMProof proof = prover.construct_proof();
        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(prover.key);

        OuterBuilder outer_circuit;

        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ &outer_circuit, verification_key, stdlib_verifier_transcript };
        [[maybe_unused]] auto output = verifier.verify_proof(proof);
        stdlib::recursion::PairingPoints<OuterBuilder>::add_default_to_public_inputs(outer_circuit);
        info("Recursive Verifier: estimated num finalized gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_FALSE(CircuitChecker::check(outer_circuit));
    }

    static void test_recursive_verification_failure_tampered_proof()
    {
        for (size_t idx = 0; idx < 2; idx++) {
            InnerBuilder builder = generate_circuit(&engine);
            std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
            InnerProver prover(builder, prover_transcript);
            ECCVMProof proof = prover.construct_proof();

            // Tamper with the proof to be verified
            tamper_with_proof<InnerProver, InnerFlavor>(proof.pre_ipa_proof, static_cast<bool>(idx));

            auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(prover.key);

            OuterBuilder outer_circuit;
            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ &outer_circuit, verification_key, stdlib_verifier_transcript };
            auto [opening_claim, ipa_proof] = verifier.verify_proof(proof);
            stdlib::recursion::PairingPoints<OuterBuilder>::add_default_to_public_inputs(outer_circuit);

            if (idx == 0) {
                // In this case, we changed the first non-zero value in the proof. It leads to a circuit check failure.
                EXPECT_FALSE(CircuitChecker::check(outer_circuit));
            } else {
                // Changing the last commitment in the `pre_ipa_proof` would not result in a circuit check failure at
                // this stage.
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));

                // However, IPA recursive verifier must fail, as one of the commitments is incorrect.
                VerifierCommitmentKey<InnerFlavor::Curve> native_pcs_vk(1UL << CONST_ECCVM_LOG_N);
                VerifierCommitmentKey<stdlib::grumpkin<OuterBuilder>> stdlib_pcs_vkey(
                    &outer_circuit, 1UL << CONST_ECCVM_LOG_N, native_pcs_vk);

                // Construct ipa_transcript from proof
                std::shared_ptr<StdlibTranscript> ipa_transcript = std::make_shared<StdlibTranscript>();
                ipa_transcript->load_proof(ipa_proof);
                EXPECT_FALSE(
                    IPA<RecursiveFlavor::Curve>::full_verify_recursive(stdlib_pcs_vkey, opening_claim, ipa_transcript));
            }
        }
    }

    static void test_independent_vk_hash()
    {

        // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
        auto get_blocks = [](size_t inner_size)
            -> std::tuple<OuterBuilder::ExecutionTrace, std::shared_ptr<OuterFlavor::VerificationKey>> {
            auto inner_circuit = generate_circuit(&engine, inner_size);
            std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
            InnerProver inner_prover(inner_circuit, prover_transcript);

            ECCVMProof inner_proof = inner_prover.construct_proof();
            auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(inner_prover.key);

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;

            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ &outer_circuit, verification_key, stdlib_verifier_transcript };

            auto [opening_claim, ipa_transcript] = verifier.verify_proof(inner_proof);
            stdlib::recursion::PairingPoints<OuterBuilder>::add_default_to_public_inputs(outer_circuit);

            auto outer_proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            auto outer_verification_key =
                std::make_shared<OuterFlavor::VerificationKey>(outer_proving_key->get_precomputed());

            return { outer_circuit.blocks, outer_verification_key };
        };

        auto [blocks_20, verification_key_20] = get_blocks(20);
        auto [blocks_40, verification_key_40] = get_blocks(40);

        compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_20, blocks_40 },
                                                                { verification_key_20, verification_key_40 });
    };
};

TEST_F(ECCVMRecursiveTests, SingleRecursiveVerification)
{
    ECCVMRecursiveTests::test_recursive_verification();
};

TEST_F(ECCVMRecursiveTests, SingleRecursiveVerificationFailure)
{
    ECCVMRecursiveTests::test_recursive_verification_failure();
};

TEST_F(ECCVMRecursiveTests, SingleRecursiveVerificationFailureTamperedProof)
{
    ECCVMRecursiveTests::test_recursive_verification_failure_tampered_proof();
};

TEST_F(ECCVMRecursiveTests, IndependentVKHash)
{
    ECCVMRecursiveTests::test_independent_vk_hash();
};
} // namespace bb
