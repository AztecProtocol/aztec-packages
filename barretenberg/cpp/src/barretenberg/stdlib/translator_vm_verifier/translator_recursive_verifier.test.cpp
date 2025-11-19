#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_verifier.hpp"
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
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
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
            stdlib_comms[i].set_origin_tag(OriginTag());
        }
        return stdlib_comms;
    }

    static void test_recursive_verification()
    {
        using NativeVerifierCommitmentKey = InnerFlavor::VerifierCommitmentKey;
        // Add the same operations to the ECC op queue; the native computation is performed under the hood.

        auto prover_transcript = std::make_shared<Transcript>();
        prover_transcript->send_to_verifier("init", InnerBF::random_element());
        // normally this would be the eccvm proof
        auto fake_inital_proof = prover_transcript->export_proof();

        InnerBF batching_challenge_v = InnerBF::random_element();
        InnerBF evaluation_challenge_x = InnerBF::random_element();

        InnerBuilder circuit_builder = generate_test_circuit(batching_challenge_v, evaluation_challenge_x);
        EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        InnerProver prover{ proving_key, prover_transcript };
        auto proof = prover.construct_proof();

        OuterBuilder outer_circuit;

        // Mock a previous verifier that would in reality be the ECCVM recursive verifier
        stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, fake_inital_proof);
        auto transcript = std::make_shared<RecursiveFlavor::Transcript>(stdlib_proof);
        [[maybe_unused]] auto _ = transcript->template receive_from_prover<RecursiveFlavor::BF>("init");

        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(prover.key->proving_key);
        RecursiveVerifier verifier{ &outer_circuit, verification_key, transcript };

        // Get accumulated_result from the prover
        bb::fq accumulated_result_native = prover.get_accumulated_result();
        auto accumulated_result = TranslatorBF::from_witness(&outer_circuit, accumulated_result_native);
        // Set empty origin tag (it's a free witness from ECCVM verifier)
        accumulated_result.set_origin_tag(OriginTag());

        // Convert challenges to circuit witnesses
        auto stdlib_evaluation_challenge_x = TranslatorBF::from_witness(&outer_circuit, evaluation_challenge_x);
        auto stdlib_batching_challenge_v = TranslatorBF::from_witness(&outer_circuit, batching_challenge_v);
        stdlib_evaluation_challenge_x.set_origin_tag(OriginTag());
        stdlib_batching_challenge_v.set_origin_tag(OriginTag());

        // Create op queue commitments (normally provided by merge protocol)
        auto native_op_queue_commitments = create_native_op_queue_commitments(proving_key);
        auto op_queue_commitments = create_stdlib_op_queue_commitments(&outer_circuit, native_op_queue_commitments);

        // Convert native proof to stdlib proof
        stdlib::Proof<OuterBuilder> stdlib_proof_for_verifier(outer_circuit, proof);
        typename RecursiveVerifier::PairingPoints pairing_points = verifier.verify_proof(stdlib_proof_for_verifier,
                                                                                         stdlib_evaluation_challenge_x,
                                                                                         stdlib_batching_challenge_v,
                                                                                         accumulated_result,
                                                                                         op_queue_commitments);

        stdlib::recursion::honk::DefaultIO<OuterBuilder> inputs;
        inputs.pairing_inputs = pairing_points;
        inputs.set_public();
        info("Recursive Verifier: num gates = ", outer_circuit.num_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        auto native_verifier_transcript = std::make_shared<Transcript>(fake_inital_proof);
        native_verifier_transcript->template receive_from_prover<InnerBF>("init");
        InnerVerifier native_verifier(verification_key, native_verifier_transcript);

        // Native verifier uses the same op queue commitments we created earlier
        bool native_result = native_verifier.verify_proof(proof,
                                                          evaluation_challenge_x,
                                                          batching_challenge_v,
                                                          accumulated_result_native,
                                                          native_op_queue_commitments);
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
            auto prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
            auto verification_key = std::make_shared<OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
            OuterProver prover(prover_instance, verification_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.template verify_proof<DefaultIO>(proof).result;

            ASSERT_TRUE(verified);
        }
    }

    static void test_independent_vk_hash()
    {

        // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
        auto get_blocks = [](size_t num_ops)
            -> std::tuple<OuterBuilder::ExecutionTrace, std::shared_ptr<OuterFlavor::VerificationKey>> {
            auto prover_transcript = std::make_shared<Transcript>();
            prover_transcript->send_to_verifier("init", InnerBF::random_element());

            // normally this would be the eccvm proof
            auto fake_inital_proof = prover_transcript->export_proof();
            InnerBF batching_challenge_v = InnerBF::random_element();
            InnerBF evaluation_challenge_x = InnerBF::random_element();

            InnerBuilder inner_circuit = generate_test_circuit(batching_challenge_v, evaluation_challenge_x, num_ops);

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
            auto transcript = std::make_shared<typename RecursiveFlavor::Transcript>(stdlib_proof);
            [[maybe_unused]] auto _ = transcript->template receive_from_prover<typename RecursiveFlavor::BF>("init");

            RecursiveVerifier verifier{ &outer_circuit, verification_key, transcript };

            // Get accumulated_result from the prover
            bb::fq accumulated_result_native = inner_prover.get_accumulated_result();
            auto stdlib_accumulated_result = TranslatorBF::from_witness(&outer_circuit, accumulated_result_native);
            // Set empty origin tag (it's a free witness from ECCVM verifier)
            stdlib_accumulated_result.set_origin_tag(OriginTag());

            // Convert challenges to circuit witnesses
            auto stdlib_evaluation_challenge_x = TranslatorBF::from_witness(&outer_circuit, evaluation_challenge_x);
            auto stdlib_batching_challenge_v = TranslatorBF::from_witness(&outer_circuit, batching_challenge_v);
            stdlib_evaluation_challenge_x.set_origin_tag(OriginTag());
            stdlib_batching_challenge_v.set_origin_tag(OriginTag());

            // Create op queue commitments (normally provided by merge protocol)
            auto native_op_queue_commitments = create_native_op_queue_commitments(inner_proving_key);
            auto op_queue_commitments = create_stdlib_op_queue_commitments(&outer_circuit, native_op_queue_commitments);

            // Convert native proof to stdlib proof
            stdlib::Proof<OuterBuilder> stdlib_inner_proof(outer_circuit, inner_proof);
            typename RecursiveVerifier::PairingPoints pairing_points =
                verifier.verify_proof(stdlib_inner_proof,
                                      stdlib_evaluation_challenge_x,
                                      stdlib_batching_challenge_v,
                                      stdlib_accumulated_result,
                                      op_queue_commitments);

            stdlib::recursion::honk::DefaultIO<OuterBuilder> inputs;
            inputs.pairing_inputs = pairing_points;
            inputs.set_public();

            auto outer_proving_key = std::make_shared<OuterProverInstance>(outer_circuit);
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
