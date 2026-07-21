#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
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
    using OuterVerifier = UltraVerifier_<OuterFlavor, bb::DefaultIO>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using NativeTripleIPA = InnerVerifier::TripleIPA;
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
        auto proof = prover.construct_proof();

        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>();

        info("ECCVM Recursive Verifier");
        OuterBuilder outer_circuit;
        auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);
        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
        verifier.get_transcript()->enable_manifest();
        [[maybe_unused]] auto recursive_result = verifier.reduce_to_triple_ipa_claim();
        stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);

        info("Recursive Verifier: num gates = ", outer_circuit.get_num_finalized_gates_inefficient());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        bool result = CircuitChecker::check(outer_circuit);
        EXPECT_TRUE(result);

        std::shared_ptr<Transcript> verifier_transcript = std::make_shared<Transcript>();
        InnerVerifier native_verifier(verifier_transcript, proof);
        verifier_transcript->enable_manifest();
        auto native_result = native_verifier.reduce_to_triple_ipa_claim();

        // Verify the TripleIPA proof against the claim emitted by the native verifier
        auto ipa_verify_transcript = std::make_shared<Transcript>(prover.ipa_proof);
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        auto accumulator =
            NativeTripleIPA::reduce_to_accumulator(native_result.triple_ipa_claim, ipa_verify_transcript);
        bool ipa_verified = NativeTripleIPA::verify_accumulator(ipa_vk, accumulator);
        EXPECT_TRUE(ipa_verified && native_result.reduction_succeeded);
        auto recursive_manifest = verifier.get_transcript()->get_manifest();
        auto native_manifest = native_verifier.get_transcript()->get_manifest();

        ASSERT_GT(recursive_manifest.size(), 0);
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i])
                << "Recursive Verifier/Verifier manifest discrepency in round " << i;
        }

        // Ensure verification key commitments are the same
        for (auto [vk_poly, native_vk_poly] :
             zip_view(verifier.get_verification_key()->get_all(), verification_key->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        // Construct a full proof from the recursive verifier circuit
        {
            auto prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
            auto verification_key = std::make_shared<OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
            auto vk_and_hash = std::make_shared<OuterFlavor::VKAndHash>(verification_key);
            OuterProver prover(prover_instance, verification_key);
            OuterVerifier verifier(vk_and_hash);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof).result;

            ASSERT_TRUE(verified);
        }

        // Check that the size of the recursive verifier is consistent with historical expectation
        ASSERT_EQ(outer_circuit.get_num_finalized_gates(), acir_format::ECCVM_RECURSIVE_VERIFIER_GATE_COUNT)
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
        auto proof = prover.construct_proof();

        auto verification_key = std::make_shared<InnerFlavor::VerificationKey>();

        OuterBuilder outer_circuit;
        auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);

        std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
        RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
        [[maybe_unused]] auto output = verifier.reduce_to_triple_ipa_claim();
        stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);
        info("Recursive Verifier: estimated num finalized gates = ",
             outer_circuit.get_num_finalized_gates_inefficient());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_FALSE(CircuitChecker::check(outer_circuit));
    }

    /**
     * @brief Verify that StructuredProof<ECCVMFlavor> can round-trip serialize/deserialize a proof.
     * @details Validates the field layout matches the actual ECCVM proof structure. This is the foundation
     * for targeted proof tampering in TargetedProofTampering.
     */
    static void test_structured_proof_round_trip()
    {
        InnerBuilder builder = generate_circuit(&engine);
        std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
        InnerProver prover(builder, prover_transcript);
        auto proof = prover.construct_proof();

        ASSERT_EQ(proof.size(), InnerFlavor::PROOF_LENGTH);

        StructuredProof<InnerFlavor> structured_proof;
        auto proof_data = prover.transcript->test_get_proof_data();
        structured_proof.deserialize(proof_data, /*num_public_inputs=*/0, CONST_ECCVM_LOG_N);
        structured_proof.serialize(proof_data, CONST_ECCVM_LOG_N);

        auto original_data = prover.transcript->test_get_proof_data();
        ASSERT_EQ(proof_data.size(), original_data.size());
        EXPECT_EQ(proof_data, original_data);
    }

    enum class TamperType {
        MODIFY_SUMCHECK_UNIVARIATE, // Tests committed sumcheck first-round sum constraint (circuit FAIL)
        MODIFY_SUMCHECK_EVAL,       // Tests Gemini consistency constraint (circuit FAIL)
        MODIFY_TRIPLE_IPA_CLAIM,    // Tests TripleIPA opening (circuit PASS, TripleIPA FAIL)
        MODIFY_TRANSLATION_EVAL,    // Tests translation masking consistency constraint (circuit FAIL)
        MODIFY_LIBRA_EVAL,          // Tests Libra SmallSubgroupIPA consistency constraint (circuit FAIL)
        END
    };

    static void tamper_eccvm_proof(InnerProver& prover,
                                   typename InnerFlavor::Transcript::Proof& proof,
                                   TamperType tamper_type)
    {
        using FF = InnerFF;
        static constexpr size_t FIRST_WITNESS_INDEX = InnerFlavor::NUM_PRECOMPUTED_ENTITIES;

        StructuredProof<InnerFlavor> structured_proof;
        structured_proof.deserialize(
            prover.transcript->test_get_proof_data(), /*num_public_inputs=*/0, CONST_ECCVM_LOG_N);

        switch (tamper_type) {
        case TamperType::MODIFY_SUMCHECK_UNIVARIATE:
            // Committed sumcheck: break the first-round sum by modifying eval_0 without compensating eval_1.
            // Preserving the sum would only break TripleIPA opening (external), not any in-circuit constraint.
            structured_proof.sumcheck_round_eval_0s[0] += FF::random_element();
            break;
        case TamperType::MODIFY_SUMCHECK_EVAL:
            structured_proof.sumcheck_evaluations[FIRST_WITNESS_INDEX] = FF::random_element();
            break;
        case TamperType::MODIFY_TRIPLE_IPA_CLAIM:
            // Modify the final Shplonk Q commitment — bypasses circuit constraints but corrupts TripleIPA opening
            // claim.
            structured_proof.final_shplonk_q_comm = structured_proof.final_shplonk_q_comm * FF(2);
            break;
        case TamperType::MODIFY_TRANSLATION_EVAL:
            structured_proof.translation_op_eval = FF::random_element();
            break;
        case TamperType::MODIFY_LIBRA_EVAL:
            structured_proof.libra_quotient_eval = FF::random_element();
            break;
        case TamperType::END:
            break;
        }

        structured_proof.serialize(prover.transcript->test_get_proof_data(), CONST_ECCVM_LOG_N);
        prover.transcript->test_set_proof_parsing_state(0, InnerFlavor::PROOF_LENGTH);
        proof = prover.export_proof();
    }

    static void test_recursive_verification_fails()
    {
        for (size_t idx = 0; idx < static_cast<size_t>(TamperType::END); idx++) {
            TamperType tamper_type = static_cast<TamperType>(idx);

            InnerBuilder builder = generate_circuit(&engine);
            std::shared_ptr<Transcript> prover_transcript = std::make_shared<Transcript>();
            InnerProver prover(builder, prover_transcript);
            auto proof = prover.construct_proof();

            // The genuine TripleIPA proof (needed for MODIFY_TRIPLE_IPA_CLAIM case)
            HonkProof ipa_proof = prover.ipa_proof;

            // Tamper with the proof
            tamper_eccvm_proof(prover, proof, tamper_type);

            OuterBuilder outer_circuit;
            auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);
            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };
            [[maybe_unused]] auto recursive_result = verifier.reduce_to_triple_ipa_claim();
            stdlib::recursion::honk::DefaultIO<OuterBuilder>::add_default(outer_circuit);

            if (tamper_type == TamperType::MODIFY_TRIPLE_IPA_CLAIM) {
                // Modifying the final Shplonk Q bypasses circuit constraints but causes IPA failure
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));

                // Verify that the TripleIPA fails: the tampered Shplonk Q corrupts the univariate claim, so the
                // claim emitted by the verifier no longer matches the genuine TripleIPA proof
                std::shared_ptr<Transcript> native_transcript = std::make_shared<Transcript>();
                InnerVerifier native_verifier(native_transcript, proof);
                auto native_result = native_verifier.reduce_to_triple_ipa_claim();
                auto ipa_verify_transcript = std::make_shared<Transcript>(ipa_proof);
                auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
                auto accumulator =
                    NativeTripleIPA::reduce_to_accumulator(native_result.triple_ipa_claim, ipa_verify_transcript);
                EXPECT_FALSE(NativeTripleIPA::verify_accumulator(ipa_vk, accumulator));
            } else {
                // All other tamper types should cause a circuit constraint violation
                EXPECT_FALSE(CircuitChecker::check(outer_circuit)) << "Expected circuit failure for TamperType " << idx;
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

            auto proof = inner_prover.construct_proof();

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            auto stdlib_proof = stdlib::Proof<OuterBuilder>(outer_circuit, proof);

            std::shared_ptr<StdlibTranscript> stdlib_verifier_transcript = std::make_shared<StdlibTranscript>();
            RecursiveVerifier verifier{ stdlib_verifier_transcript, stdlib_proof };

            [[maybe_unused]] auto recursive_triple_ipa_claim = verifier.reduce_to_triple_ipa_claim();
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

TEST_F(ECCVMRecursiveTests, StructureTest)
{
    ECCVMRecursiveTests::test_structured_proof_round_trip();
};

TEST_F(ECCVMRecursiveTests, TargetedProofTampering)
{
    ECCVMRecursiveTests::test_recursive_verification_fails();
};

TEST_F(ECCVMRecursiveTests, IndependentVKHash)
{
    ECCVMRecursiveTests::test_independent_vk_hash();
};

} // namespace bb
