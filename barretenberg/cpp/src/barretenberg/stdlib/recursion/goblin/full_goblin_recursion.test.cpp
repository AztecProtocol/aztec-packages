#include "barretenberg/eccvm/eccvm_composer.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

#include <gtest/gtest.h>

#pragma GCC diagnostic ignored "-Wunused-variable"

// using namespace proof_system::honk;

namespace goblin_recursion_tests {

class GoblinRecursionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        barretenberg::srs::init_crs_factory("../srs_db/ignition");
        barretenberg::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Fbase = Curve::BaseField;
    using Point = Curve::AffineElement;
    using CommitmentKey = proof_system::honk::pcs::CommitmentKey<Curve>;
    using OpQueue = proof_system::ECCOpQueue;
    using GoblinUltraBuilder = proof_system::GoblinUltraCircuitBuilder;
    using ECCVMFlavor = proof_system::honk::flavor::ECCVM;
    using ECCVMBuilder = proof_system::ECCVMCircuitBuilder<ECCVMFlavor>;
    using ECCVMComposer = proof_system::honk::ECCVMComposer_<ECCVMFlavor>;
    using TranslatorFlavor = proof_system::honk::flavor::GoblinTranslator;
    using TranslatorBuilder = proof_system::GoblinTranslatorCircuitBuilder;
    using TranslatorComposer = proof_system::honk::GoblinTranslatorComposer;
    using TranslatorConsistencyData = barretenberg::TranslationEvaluations;
    using Proof = proof_system::plonk::proof;
    using NativeVerificationKey = proof_system::honk::flavor::GoblinUltra::VerificationKey;
    using GoblinUltraComposer = proof_system::honk::GoblinUltraComposer;

    using RecursiveFlavor = ::proof_system::honk::flavor::GoblinUltraRecursive_<GoblinUltraBuilder>;
    using RecursiveVerifier = ::proof_system::plonk::stdlib::recursion::honk::UltraRecursiveVerifier_<RecursiveFlavor>;

    struct VerifierInput {
        Proof proof;
        std::shared_ptr<NativeVerificationKey> verification_key;
    };

    static constexpr size_t NUM_OP_QUEUE_COLUMNS = proof_system::honk::flavor::GoblinUltra::NUM_WIRES;

    /**
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void generate_test_circuit(GoblinUltraBuilder& builder, [[maybe_unused]] const Proof& previous_proof = {})
    {
        // Add some arbitrary ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Point::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_add_accum(point);
            builder.queue_ecc_mul_accum(point, scalar);
        }
        // queues the result of the preceding ECC
        builder.queue_ecc_eq(); // should be eq and reset

        // Add some conventional gates that utilize public inputs
        for (size_t i = 0; i < 10; ++i) {
            FF a = FF::random_element();
            FF b = FF::random_element();
            FF c = FF::random_element();
            FF d = a + b + c;
            uint32_t a_idx = builder.add_public_variable(a);
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, FF(1), FF(1), FF(1), FF(-1), FF(0) });
        }
    }

    /**
     * @brief Mock the interactions of a simple curcuit with the op_queue
     * @details The transcript aggregation protocol in the Goblin proof system can not yet support an empty "previous
     * transcript" (see issue #723). This function mocks the interactions with the op queue of a fictional "first"
     * circuit. This way, when we go to generate a proof over our first "real" circuit, the transcript aggregation
     * protocol can proceed nominally. The mock data is valid in the sense that it can be processed by all stages of
     * Goblin as if it came from a genuine circuit.
     *
     * @todo WOKTODO: this is a zero commitments issue
     *
     * @param op_queue
     */
    static void perform_op_queue_interactions_for_mock_first_circuit(
        std::shared_ptr<proof_system::ECCOpQueue>& op_queue)
    {
        proof_system::GoblinUltraCircuitBuilder builder{ op_queue };

        // Add a mul accum op and an equality op
        auto point = Point::one() * FF::random_element();
        auto scalar = FF::random_element();
        builder.queue_ecc_mul_accum(point, scalar);
        builder.queue_ecc_eq();

        op_queue->set_size_data();

        // Manually compute the op queue transcript commitments (which would normally be done by the prover)
        auto crs_factory_ = barretenberg::srs::get_crs_factory();
        auto commitment_key = CommitmentKey(op_queue->get_current_size(), crs_factory_);
        std::array<Point, NUM_OP_QUEUE_COLUMNS> op_queue_commitments;
        size_t idx = 0;
        for (auto& entry : op_queue->get_aggregate_transcript()) {
            op_queue_commitments[idx++] = commitment_key.commit(entry);
        }
        // Store the commitment data for use by the prover of the next circuit
        op_queue->set_commitment_data(op_queue_commitments);
    }
};

/**
 * @brief A full Goblin test that mimicks the basic aztec client architecture
 *
 */
TEST_F(GoblinRecursionTests, Pseudo)
{
    barretenberg::Goblin goblin;

    // WORKTODO: In theory we could use the ops from the first circuit instead of these fake ops but then we'd still
    // have to manually compute and call set_commitments (normally performed in the merge prover) since we can call
    // merge prove with an previous empty aggregate transcript.
    perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    info("Generating initial circuit.");

    // Construct an initial goblin ultra circuit
    GoblinUltraBuilder initial_circuit_builder{ goblin.op_queue };
    generate_test_circuit(initial_circuit_builder);

    info("Proving initial circuit.");

    // Construct a proof of the initial circuit to be recursively verified
    auto composer = GoblinUltraComposer();
    auto instance = composer.create_instance(initial_circuit_builder);
    auto prover = composer.create_prover(instance);
    auto proof = prover.construct_proof();
    auto verification_key = instance->compute_verification_key();

    VerifierInput verifier_input = { proof, verification_key };

    { // Natively verify proof for testing purposes only
        info("Verifying initial circuit.");
        auto verifier = composer.create_verifier(instance);
        bool honk_verified = verifier.verify_proof(proof);
        EXPECT_TRUE(honk_verified);
    }

    info("Constructing merge proof.");

    // Construct a merge proof to be recursively verified
    auto merge_prover = composer.create_merge_prover(goblin.op_queue);
    auto merge_proof = merge_prover.construct_proof();

    { // Natively verify merge for testing purposes only
        info("Verifying merge proof.");
        auto merge_verifier = composer.create_merge_verifier(/*srs_size=*/10); // WORKTODO set this
        bool merge_verified = merge_verifier.verify_proof(merge_proof);
        EXPECT_TRUE(merge_verified);
    }

    // const auto folding_verifier = [](GoblinUltraBuilder& builder) { generate_test_circuit(builder); };

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = 2;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        GoblinUltraBuilder circuit_builder{ goblin.op_queue };

        info();

        // Construct a circuit with logic resembling that of the "kernel circuit"
        {
            info("Kernel circuit ", circuit_idx);
            info("Adding general logic.");
            // generic operations e.g. state updates (just arith gates for now)
            generate_test_circuit(circuit_builder);

            info("Adding recursive aggregation logic.");
            // execute recursive aggregation of previous kernel
            RecursiveVerifier verifier{ &circuit_builder, verifier_input.verification_key };
            auto pairing_points = verifier.verify_proof(verifier_input.proof);
            (void)pairing_points; // WORKTODO: aggregate
        }

        info("Constructing proof of Kernel circuit ", circuit_idx);

        // Construct proof of the "kernel" circuit
        // WORKTODO: Eventually the below block should be the contents of a method like
        // "goblin.accumulate(circuit_builder)". Should the return be a VerifierInput?
        {
            GoblinUltraComposer composer;
            auto instance = composer.create_instance(circuit_builder);
            auto prover = composer.create_prover(instance);
            auto honk_proof = prover.construct_proof();
            // WORKTODO: for now, do a native verification here for good measure.
            info("Verifying proof of Kernel circuit ", circuit_idx);
            auto verifier = composer.create_verifier(instance);
            bool honk_verified = verifier.verify_proof(honk_proof);
            ASSERT(honk_verified);

            verifier_input.proof = honk_proof;
            verifier_input.verification_key = instance->compute_verification_key();
        }
    }

    // auto vms_verified = goblin.prove();
    // bool verified = goblin.verified && vms_verified;
    // // bool verified = goblin.verify(proof)
    // EXPECT_TRUE(verified);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/787) Expand these tests.
} // namespace goblin_recursion_tests
