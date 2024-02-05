#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

#include <gtest/gtest.h>
using namespace bb;

class ClientIVCTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Flavor = GoblinUltraFlavor;
    using Curve = typename Flavor::Curve;
    using FF = typename Flavor::FF;
    using Builder = GoblinUltraCircuitBuilder;
    using Composer = GoblinUltraComposer;
    using Instance = ProverInstance_<GoblinUltraFlavor>;
    using AccumulationProof = HonkProof;
    using AccumulatorWithProof = FoldingResult<GoblinUltraFlavor>;

    using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstances = ::bb::VerifierInstances_<GURecursiveFlavor, 2>;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

    using ClientCircuit = typename ClientIVC::Circuit;

    // Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of 2)
    static Builder create_mock_circuit(ClientIVC& ivc, size_t num_gates = 1 << 15)
    {
        ClientCircuit circuit; // WORKTODO: write constructor
        GoblinMockCircuits::construct_arithmetic_circuit(circuit, num_gates);
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    // WORKTODO: this moves in
    static AccumulatorWithProof fold(std::shared_ptr<Instance>& accumulator, Builder& circuit_to_fold)
    {
        Composer composer;
        auto instance = composer.create_instance(circuit_to_fold);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        AccumulatorWithProof output = folding_prover.fold_instances();
        return output;
    }

    static bool decide_and_verify(std::shared_ptr<Instance>& accumulator)
    {
        Composer composer;
        auto decider_prover = composer.create_decider_prover(accumulator);
        auto decider_verifier = composer.create_decider_verifier(accumulator);
        auto decider_proof = decider_prover.construct_proof();
        auto verified = decider_verifier.verify_proof(decider_proof);
        return verified;
    }

    static void construct_mock_folding_kernel(Builder& builder,
                                              AccumulationProof& fctn_fold_proof,
                                              AccumulationProof& kernel_fold_proof)
    {
        FoldingRecursiveVerifier verifier_1{ &builder };
        verifier_1.verify_folding_proof(fctn_fold_proof);

        FoldingRecursiveVerifier verifier_2{ &builder };
        verifier_2.verify_folding_proof(kernel_fold_proof);
    }

    // DEBUG only: perform native fold verification and run decider prover/verifier
    static void EXEPECT_FOLDING_AND_DECIDING_VERIFIED(AccumulatorWithProof& folding_output)
    {
        // Verify fold proof
        Composer composer;
        auto folding_verifier = composer.create_folding_verifier();
        bool folding_verified = folding_verifier.verify_folding_proof(folding_output.folding_data);
        EXPECT_TRUE(folding_verified);

        // Run decider
        auto decider_prover = composer.create_decider_prover(folding_output.accumulator);
        auto decider_verifier = composer.create_decider_verifier(folding_output.accumulator);
        auto decider_proof = decider_prover.construct_proof();
        bool decision = decider_verifier.verify_proof(decider_proof);
        EXPECT_TRUE(decision);
    }
};

/**
 * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
 * @details
 */
TEST_F(ClientIVCTests, Full)
{
    // WORKTODO move these up
    const auto EXPECT_ACCUMULATION_VERIFIED = [](AccumulatorWithProof& folding_output) {
        EXPECT_TRUE(ivc.verify_accumulation(folding_output));
    };

    const auto EXPECT_ACCUMULATOR_VERIFIED = [](AccumulatorWithProof& folding_output) {
        EXPECT_TRUE(ivc.verify_accumulator(folding_output));
    };

    ClientIVC ivc; // mock opqueue  happens inside
    Builder function_circuit = create_mock_circuit(ivc);
    ivc.initialize(function_circuit);

    Builder kernel_circuit = create_mock_circuit(ivc);
    AccumulatorWithProof kernel_acc_with_proof = ivc.accumulate(kernel_circuit); // handles merge base case
    EXPECT_ACCUMULATION_VERIFIED(kernel_acc_with_proof);

    size_t NUM_KERNEL_ITERATIONS_MINUS_1 = 1;
    for (size_t circuit_idx = 0; circuit_idx < NUM_KERNEL_ITERATIONS_MINUS_1; ++circuit_idx) {
        // Construct and accumulate a mock function circuit
        Builder function_circuit = create_mock_circuit(ivc);
        function_folding_output = ivc.accumulate(function_circuit);
        EXEPECT_FOLDING_AND_DECIDING_VERIFIED(function_folding_output);

        // Construct and accumulate the mock kernel circuit
        // WORKNOTE: this is the reason to track two
        Builder kernel_circuit =
            construct_mock_folding_kernel(function_folding_output.folding_data, kernel_acc_with_proof.folding_data);
        kernel_acc_with_proof = ivc.accumulate(kernel_circuit);
        EXEPECT_FOLDING_AND_DECIDING_VERIFIED(kernel_acc_with_proof);
    }

    EXPECT_ACCUMULATOR_VERIFIED(kernel_accumulation_output);
}