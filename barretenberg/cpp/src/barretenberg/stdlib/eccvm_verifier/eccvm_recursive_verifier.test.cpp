#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/commitment_key.test.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
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
    using OuterProverInstance = ProverInstance_<OuterFlavor>;
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
        using Fq = curve::Grumpkin::ScalarField;

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
            op_queue->merge();
        }
        // Set hiding op for ECCVM ZK (required before ECCVMCircuitBuilder construction)
        op_queue->append_hiding_op(Fq::random_element(engine), Fq::random_element(engine));
        InnerBuilder builder{ op_queue };
        return builder;
    }

    static void test_recursive_verification()
    {
        InnerBuilder builder = generate_circuit(&engine);
        std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
        InnerProver prover(builder, prover_transcript);
        auto [proof, opening_claim] = prover.construct_proof();

        // Compute IPA proof
        auto ipa_transcript = std::make_shared<Transcript>();
        ECCVMFlavor::PCS::compute_opening_proof(prover.key->commitment_key, opening_claim, ipa_transcript);
        HonkProof ipa_proof = ipa_transcript->export_proof();

        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(prover.key);

        info("ECCVM Recursive Verifier");
        OuterBuilder outer_circuit;
        auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);
        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
        verifier.transcript->enable_manifest();
        [[maybe_unused]] auto recursive_opening_claim = verifier.verify_proof();
        stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);

        info("Recursive Verifier: num gates = ", outer_circuit.get_num_finalized_gates_inefficient());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
        InnerVerifier native_verifier(verifier_transcript, proof);
        native_verifier.transcript->enable_manifest();
        auto native_opening_claim = native_verifier.verify_proof();

        // Verify IPA
        auto ipa_verify_transcript = std::make_shared<Transcript>();
        ipa_verify_transcript->load_proof(ipa_proof);
        bool ipa_verified = ECCVMFlavor::PCS::reduce_verify(
            native_verifier.key->pcs_verification_key, native_opening_claim, ipa_verify_transcript);
        bool native_result = ipa_verified && native_verifier.sumcheck_verified && native_verifier.consistency_checked &&
                             native_verifier.translation_masking_consistency_checked;
        EXPECT_TRUE(native_result);
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();

        ASSERT_GT(recursive_manifest.size(), 0);
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key is the same
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->log_circuit_size.get_value()),
                  verification_key->log_circuit_size);
        EXPECT_EQ(static_cast<uint64_t>(verifier.key->num_public_inputs.get_value()),
                  verification_key->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
        {
            auto prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
            auto verification_key = std::make_shared<OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
            OuterProver prover(prover_instance, verification_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

            ASSERT_TRUE(verified);
        }

        // Check that the size of the recursive verifier is consistent with historical expectation
        uint32_t NUM_GATES_EXPECTED = 215193;
        ASSERT_EQ(static_cast<uint32_t>(outer_circuit.get_num_finalized_gates()), NUM_GATES_EXPECTED)
            << "Ultra-arithmetized ECCVM Recursive verifier gate count changed! Update this value if you are sure this "
               "is expected.";
    }

    static void test_recursive_verification_failure()
    {
        InnerBuilder builder = generate_circuit(&engine);
        builder.op_queue->add_erroneous_equality_op_for_testing();
        builder.op_queue->merge();
        std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
        InnerProver prover(builder, prover_transcript);
        auto [proof, opening_claim] = prover.construct_proof();

        // Compute IPA proof
        auto ipa_transcript = std::make_shared<Transcript>();
        ECCVMFlavor::PCS::compute_opening_proof(prover.key->commitment_key, opening_claim, ipa_transcript);
        HonkProof ipa_proof = ipa_transcript->export_proof();

        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>(prover.key);

        OuterBuilder outer_circuit;
        auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);

        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
        [[maybe_unused]] auto output = verifier.verify_proof();
        stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);
        info("Recursive Verifier: estimated num finalized gates = ",
             outer_circuit.get_num_finalized_gates_inefficient());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_FALSE(CircuitChecker::check(outer_circuit));
    }

    static void test_recursive_verification_failure_tampered_proof()
    {
        for (size_t idx = 0; idx < 2; idx++) {
            InnerBuilder builder = generate_circuit(&engine);
            std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
            InnerProver prover(builder, prover_transcript);
            auto [proof, opening_claim] = prover.construct_proof();

            // Compute IPA proof
            auto ipa_transcript_prover = std::make_shared<Transcript>();
            ECCVMFlavor::PCS::compute_opening_proof(prover.key->commitment_key, opening_claim, ipa_transcript_prover);
            HonkProof ipa_proof_native = ipa_transcript_prover->export_proof();

            // Tamper with the proof to be verified
            tamper_with_proof<InnerProver, InnerFlavor>(proof, static_cast<bool>(idx));

            OuterBuilder outer_circuit;
            auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);
            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
            auto recursive_opening_claim = verifier.verify_proof();
            stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);

            if (idx == 0) {
                // In this case, we changed the first non-zero value in the proof. It leads to a circuit check failure.
                EXPECT_FALSE(CircuitChecker::check(outer_circuit));
            } else {
                // Changing the last commitment in the `proof_data` would not result in a circuit check failure at
                // this stage.
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));

                // However, IPA recursive verifier must fail, as one of the commitments is incorrect.
                VerifierCommitmentKey<InnerFlavor::Curve> native_pcs_vk(1UL << CONST_ECCVM_LOG_N);
                VerifierCommitmentKey<stdlib::grumpkin<OuterBuilder>> stdlib_pcs_vkey(
                    &outer_circuit, 1UL << CONST_ECCVM_LOG_N, native_pcs_vk);

                // Construct ipa_transcript from proof
                auto stdlib_ipa_proof = stdlib::Proof<OuterBuilder>(outer_circuit, ipa_proof_native);
                std::shared_ptr<StdlibTranscript> ipa_transcript = std::make_shared<StdlibTranscript>(stdlib_ipa_proof);
                EXPECT_FALSE(IPA<RecursiveFlavor::Curve>::full_verify_recursive(
                    stdlib_pcs_vkey, recursive_opening_claim, ipa_transcript));
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

            auto [proof, opening_claim] = inner_prover.construct_proof();

            // Compute IPA proof
            auto ipa_transcript = std::make_shared<Transcript>();
            ECCVMFlavor::PCS::compute_opening_proof(inner_prover.key->commitment_key, opening_claim, ipa_transcript);
            HonkProof ipa_proof = ipa_transcript->export_proof();

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);

            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };

            [[maybe_unused]] auto recursive_opening_claim = verifier.verify_proof();
            stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);

            auto outer_proving_key = std::make_shared<OuterProverInstance>(outer_circuit);
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
    BB_DISABLE_ASSERTS(); // Avoid on_curve assertion failure in cycle_group constructor
    ECCVMRecursiveTests::test_recursive_verification_failure_tampered_proof();
};

TEST_F(ECCVMRecursiveTests, IndependentVKHash)
{
    ECCVMRecursiveTests::test_independent_vk_hash();
};
} // namespace bb
