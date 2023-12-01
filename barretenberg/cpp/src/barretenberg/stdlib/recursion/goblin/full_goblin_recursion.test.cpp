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

    using KernelInput = Goblin::AccumulationOutput;

    static constexpr size_t NUM_OP_QUEUE_COLUMNS = proof_system::honk::flavor::GoblinUltra::NUM_WIRES;

    static void construct_arithmetic_circuit(GoblinUltraBuilder& builder)
    {
        // Add some arithmetic gates that utilize public inputs
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
     * @brief Generate a simple test circuit with some ECC op gates and conventional arithmetic gates
     *
     * @param builder
     */
    static void construct_simple_initial_circuit(GoblinUltraBuilder& builder)
    {
        // WORKTODO: In theory we could use the ops from the first circuit instead of these fake ops but then we'd still
        // have to manually compute and call set_commitments (normally performed in the merge prover) since we can call
        // merge prove with an previous empty aggregate transcript.
        perform_op_queue_interactions_for_mock_first_circuit(builder.op_queue);

        // Add some arbitrary ecc op gates
        for (size_t i = 0; i < 3; ++i) {
            auto point = Point::random_element();
            auto scalar = FF::random_element();
            builder.queue_ecc_add_accum(point);
            builder.queue_ecc_mul_accum(point, scalar);
        }
        // queues the result of the preceding ECC
        builder.queue_ecc_eq(); // should be eq and reset

        construct_arithmetic_circuit(builder);
    }

    /**
     * @brief Mock the interactions of a simple curcuit with the op_queue
     * @todo The transcript aggregation protocol in the Goblin proof system can not yet support an empty "previous
     * transcript" (see issue #723) because the corresponding commitments are zero / the point at infinity. This
     * function mocks the interactions with the op queue of a fictional "first" circuit. This way, when we go to
     * generate a proof over our first "real" circuit, the transcript aggregation protocol can proceed nominally. The
     * mock data is valid in the sense that it can be processed by all stages of Goblin as if it came from a genuine
     * circuit.
     *
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

        // Manually compute the op queue transcript commitments (which would normally be done by the merge prover)
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

    /**
     * @brief Construct a mock kernel circuit
     * @details This circuit contains (1) some basic/arbitrary arithmetic gates, (2) a genuine recursive verification of
     * the proof provided as input. It does not contain any other real kernel logic.
     *
     * @param builder
     * @param kernel_input A proof to be recursively verified and the corresponding native verification key
     */
    static void construct_mock_kernel_circuit(GoblinUltraBuilder& builder, KernelInput& kernel_input)
    {
        // Generic operations e.g. state updates (just arith gates for now)
        info("Kernel: Adding general logic.");
        construct_arithmetic_circuit(builder);

        // Execute recursive aggregation of previous kernel proof
        info("Kernel: Adding recursive aggregation logic.");
        RecursiveVerifier verifier{ &builder, kernel_input.verification_key };
        auto pairing_points = verifier.verify_proof(kernel_input.proof);
        (void)pairing_points; // WORKTODO: aggregate
    }
};

/**
 * @brief A full Goblin test that mimicks the basic aztec client architecture
 *
 */
TEST_F(GoblinRecursionTests, Pseudo)
{
    barretenberg::Goblin goblin;

    // Construct an initial circuit; its proof will be recursively verified by the first kernel
    info("Initial circuit.");
    GoblinUltraBuilder initial_circuit{ goblin.op_queue };
    construct_simple_initial_circuit(initial_circuit);
    KernelInput kernel_input = goblin.accumulate(initial_circuit);

    // Construct a series of simple Goblin circuits; generate and verify their proofs
    size_t NUM_CIRCUITS = 2;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

        // Construct a circuit with logic resembling that of the "kernel circuit"
        info("\nKernel circuit ", circuit_idx);
        GoblinUltraBuilder circuit_builder{ goblin.op_queue };
        construct_mock_kernel_circuit(circuit_builder, kernel_input);

        // Construct proof of the current kernel circuit to be recursively verified by the next one
        kernel_input = goblin.accumulate(circuit_builder);
    }

    // WORKTODO: verify the final kernel proof as part of verifying Goblin at large

    auto vms_verified = goblin.prove();
    // bool verified = goblin.verified && vms_verified;
    // // bool verified = goblin.verify(proof)
    EXPECT_TRUE(vms_verified);
    // EXPECT_TRUE(verified);
}

// TODO(https://github.com/AztecProtocol/barretenberg/issues/787) Expand these tests.
} // namespace goblin_recursion_tests
