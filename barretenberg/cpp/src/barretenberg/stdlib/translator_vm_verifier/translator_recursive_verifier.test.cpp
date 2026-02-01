#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
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
    using OuterVerifier = UltraVerifier_<OuterFlavor, bb::DefaultIO>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using TranslatorBF = TranslatorRecursiveFlavor::BF;

    using Transcript = InnerFlavor::Transcript;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper function to add no-ops
    static void add_random_ops(std::shared_ptr<bb::ECCOpQueue>& op_queue, size_t count)
    {
        for (size_t i = 0; i < count; i++) {
            op_queue->random_op_ultra_only();
        }
    }

    // Helper function to create an MSM
    static void add_mixed_ops(std::shared_ptr<bb::ECCOpQueue>& op_queue, size_t count = 100)
    {
        auto P1 = InnerG1::random_element();
        auto P2 = InnerG1::random_element();
        auto z = InnerFF::random_element();
        for (size_t i = 0; i < count; i++) {
            op_queue->add_accumulate(P1);
            op_queue->mul_accumulate(P2, z);
        }
        op_queue->eq_and_reset();
    }

    // Construct a test circuit based on some random operations
    static InnerBuilder generate_test_circuit(const InnerBF& batching_challenge_v,
                                              const InnerBF& evaluation_challenge_x,
                                              const size_t circuit_size_parameter = 500)
    {

        // Add the same operations to the ECC op queue; the native computation is performed under the hood.
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        op_queue->no_op_ultra_only();
        add_random_ops(op_queue, InnerBuilder::NUM_RANDOM_OPS_START);
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        op_queue->merge();
        add_mixed_ops(op_queue, circuit_size_parameter / 2);
        add_random_ops(op_queue, InnerBuilder::NUM_RANDOM_OPS_END);
        op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

        return InnerBuilder{ batching_challenge_v, evaluation_challenge_x, op_queue };
    }

    // Helper to create native op queue commitments from proving key
    static std::array<InnerFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> create_native_op_queue_commitments(
        const std::shared_ptr<TranslatorProvingKey>& proving_key)
    {
        std::array<InnerFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        op_queue_commitments[0] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.op);
        op_queue_commitments[1] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_lo_y_hi);
        op_queue_commitments[2] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.x_hi_z_1);
        op_queue_commitments[3] =
            proving_key->proving_key->commitment_key.commit(proving_key->proving_key->polynomials.y_lo_z_2);
        return op_queue_commitments;
    }

    // Helper to convert native op queue commitments to stdlib commitments
    static std::array<RecursiveFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> create_stdlib_op_queue_commitments(
        OuterBuilder* builder, const std::array<InnerFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES>& native_comms)
    {
        std::array<RecursiveFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> stdlib_comms;
        for (size_t i = 0; i < InnerFlavor::NUM_OP_QUEUE_WIRES; i++) {
            stdlib_comms[i] = RecursiveFlavor::Commitment::from_witness(builder, native_comms[i]);
            // Set empty origin tags for commitments (they're free witnesses from merge protocol)
            stdlib_comms[i].set_origin_tag(OriginTag::constant());
        }
        return stdlib_comms;
    }

    // Helper struct to hold translator verification inputs as stdlib witnesses
    struct RecursiveVerifierInputs {
        TranslatorBF accumulated_result;
        TranslatorBF evaluation_challenge_x;
        TranslatorBF batching_challenge_v;
        std::array<RecursiveFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> op_queue_commitments;
        // Native values for native verifier
        bb::fq accumulated_result_native;
        std::array<InnerFlavor::Commitment, InnerFlavor::NUM_OP_QUEUE_WIRES> native_op_queue_commitments;
    };

    // Helper to create recursive verifier inputs from native values
    static RecursiveVerifierInputs create_recursive_verifier_inputs(OuterBuilder* builder,
                                                                    const InnerProver& prover,
                                                                    const InnerBF& evaluation_challenge_x,
                                                                    const InnerBF& batching_challenge_v)
    {
        // Get accumulated_result from the prover
        bb::fq accumulated_result_native = prover.get_accumulated_result();
        auto accumulated_result = TranslatorBF::from_witness(builder, accumulated_result_native);
        accumulated_result.set_origin_tag(OriginTag::constant());

        // Convert challenges to circuit witnesses
        auto stdlib_evaluation_challenge_x = TranslatorBF::from_witness(builder, evaluation_challenge_x);
        auto stdlib_batching_challenge_v = TranslatorBF::from_witness(builder, batching_challenge_v);
        stdlib_evaluation_challenge_x.set_origin_tag(OriginTag::constant());
        stdlib_batching_challenge_v.set_origin_tag(OriginTag::constant());

        // Create op queue commitments (normally provided by merge protocol)
        auto native_op_queue_commitments = create_native_op_queue_commitments(prover.key);
        auto op_queue_commitments = create_stdlib_op_queue_commitments(builder, native_op_queue_commitments);

        return { accumulated_result,   stdlib_evaluation_challenge_x, stdlib_batching_challenge_v,
                 op_queue_commitments, accumulated_result_native,     native_op_queue_commitments };
    }

    // Shared helper to create and verify a translator proof recursively
    // Includes native verification and consistency checks
    static std::tuple<OuterBuilder, std::shared_ptr<OuterFlavor::VerificationKey>> create_recursive_verifier_circuit(
        size_t circuit_size_parameter = 500)
    {
        using NativeVerifierCommitmentKey = InnerFlavor::VerifierCommitmentKey;

        // Create fake ECCVM proof
        auto prover_transcript = std::make_shared<Transcript>();

        // Generate challenges
        InnerBF batching_challenge_v = InnerBF::random_element();
        InnerBF evaluation_challenge_x = InnerBF::random_element();

        // Create inner translator circuit and generate proof
        InnerBuilder circuit_builder =
            generate_test_circuit(batching_challenge_v, evaluation_challenge_x, circuit_size_parameter);
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        InnerProver prover{ proving_key, prover_transcript };
        auto proof = prover.construct_proof();

        // Set up outer recursive circuit
        OuterBuilder outer_circuit;
        stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, proof);
        auto transcript = std::make_shared<RecursiveFlavor::Transcript>(stdlib_proof);

        // Create recursive verifier inputs
        auto recursive_inputs =
            create_recursive_verifier_inputs(&outer_circuit, prover, evaluation_challenge_x, batching_challenge_v);

        // Verify proof recursively
        stdlib::Proof<OuterBuilder> stdlib_proof_for_verifier(outer_circuit, proof);
        RecursiveVerifier verifier{ transcript,
                                    stdlib_proof_for_verifier,
                                    recursive_inputs.evaluation_challenge_x,
                                    recursive_inputs.batching_challenge_v,
                                    recursive_inputs.accumulated_result,
                                    recursive_inputs.op_queue_commitments };
        auto recursive_result = verifier.reduce_to_pairing_check();

        stdlib::recursion::honk::DefaultIO<OuterBuilder> inputs;
        inputs.pairing_inputs = recursive_result.pairing_points;
        inputs.set_public();

        // Verify with native verifier and compare results
        auto native_verifier_transcript = std::make_shared<Transcript>(proof);
        InnerVerifier native_verifier(native_verifier_transcript,
                                      proof,
                                      evaluation_challenge_x,
                                      batching_challenge_v,
                                      recursive_inputs.accumulated_result_native,
                                      recursive_inputs.native_op_queue_commitments);
        auto native_result = native_verifier.reduce_to_pairing_check();
        bool native_verified = native_result.pairing_points.check() && native_result.reduction_succeeded;

        auto recursive_verified = recursive_result.pairing_points.check();
        EXPECT_EQ(recursive_verified, native_verified);

        // Verify VK commitments consistency between recursive and native verifiers
        auto recursive_vk = verifier.get_verification_key();
        auto native_vk = native_verifier.get_verification_key();
        for (auto [vk_poly, native_vk_poly] : zip_view(recursive_vk->get_all(), native_vk->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }

        auto outer_proving_key = std::make_shared<OuterProverInstance>(outer_circuit);
        auto outer_verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(outer_proving_key->get_precomputed());

        return { std::move(outer_circuit), outer_verification_key };
    }

    static void test_recursive_verification()
    {
        // Use the shared helper to create and verify the recursive circuit
        auto [outer_circuit, outer_verification_key] = create_recursive_verifier_circuit();

        info("Recursive Verifier: num gates = ", outer_circuit.num_gates());
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        // Prove and verify the outer recursive circuit
        auto prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
        auto vk_and_hash = std::make_shared<OuterFlavor::VKAndHash>(outer_verification_key);
        OuterProver prover(prover_instance, outer_verification_key);
        OuterVerifier verifier(vk_and_hash);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof).result;

        ASSERT_TRUE(verified);
    }

    static void test_independent_vk_hash()
    {
        auto [outer_circuit_256, verification_key_256] = create_recursive_verifier_circuit(256);
        auto [outer_circuit_512, verification_key_512] = create_recursive_verifier_circuit(512);

        compare_ultra_blocks_and_verification_keys<OuterFlavor>({ outer_circuit_256.blocks, outer_circuit_512.blocks },
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
