#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/protogalaxy_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

#include <gtest/gtest.h>
using namespace bb;

class GoblinFoldingTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using Builder = GoblinUltraCircuitBuilder;
    using Composer = GoblinUltraComposer;
    using KernelInput = Goblin::AccumulationOutput;
    using Instance = ProverInstance_<GoblinUltraFlavor>;
    using FoldingOutput = FoldingResult<GoblinUltraFlavor>;
    using FoldProof = HonkProof;

    using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstances = ::bb::VerifierInstances_<GURecursiveFlavor, 2>;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

    // Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of 2)
    static void create_mock_function_circuit(Builder& builder, size_t num_gates = 1 << 15)
    {
        GoblinMockCircuits::construct_arithmetic_circuit(builder, num_gates);
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(builder);
    }

    static HonkProof construct_fold_proof_and_update_accumulator(std::shared_ptr<Instance>& accumulator,
                                                                 Builder& circuit_to_fold)
    {
        Composer composer;
        auto instance = composer.create_instance(circuit_to_fold);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        auto output = folding_prover.fold_instances();
        accumulator = output.accumulator;
        auto fold_proof = output.folding_data;
        return fold_proof;
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
                                              FoldProof& fctn_fold_proof,
                                              FoldProof& kernel_fold_proof)
    {
        FoldingRecursiveVerifier verifier_1{ &builder };
        verifier_1.verify_folding_proof(fctn_fold_proof);

        FoldingRecursiveVerifier verifier_2{ &builder };
        verifier_2.verify_folding_proof(kernel_fold_proof);

        Composer composer;
        auto instance = composer.create_instance(builder);
        info("kernel size = ", instance->proving_key->circuit_size);
        info("kernel num ecc op gates = ", instance->proving_key->num_ecc_op_gates);
    }

    // DEBUG only: perform native fold verification and run decider prover/verifier
    static void verify_fold_and_decide(FoldProof& fold_proof, std::shared_ptr<Instance>& accumulator)
    {
        // Verify fold proof
        Composer composer;
        auto folding_verifier = composer.create_folding_verifier();
        bool folding_verified = folding_verifier.verify_folding_proof(fold_proof);
        EXPECT_TRUE(folding_verified);

        // Run decider
        auto decider_prover = composer.create_decider_prover(accumulator);
        auto decider_verifier = composer.create_decider_verifier(accumulator);
        auto decider_proof = decider_prover.construct_proof();
        bool decision = decider_verifier.verify_proof(decider_proof);
        EXPECT_TRUE(decision);
    }
};

/**
 * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
 * @details
 */
TEST_F(GoblinFoldingTests, Full)
{
    Goblin goblin;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    // Perform "Round 0"
    Builder function_circuit{ goblin.op_queue };
    create_mock_function_circuit(function_circuit);
    Composer composer; // This is annoying
    auto accum_instance = composer.create_instance(function_circuit);
    info("function circuit num_gates = ", accum_instance->proving_key->circuit_size);

    Builder kernel_circuit{ goblin.op_queue };
    create_mock_function_circuit(kernel_circuit);
    auto kernel_fold_proof = construct_fold_proof_and_update_accumulator(accum_instance, kernel_circuit);

    // DEBUG only
    verify_fold_and_decide(kernel_fold_proof, accum_instance);

    // "Round i"
    size_t NUM_CIRCUITS = 1;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

        // Construct and accumulate a mock function circuit
        Builder function_circuit{ goblin.op_queue };
        create_mock_function_circuit(function_circuit);
        goblin.merge(function_circuit); // must be called prior to folding
        auto fctn_fold_proof = construct_fold_proof_and_update_accumulator(accum_instance, function_circuit);

        // DEBUG only
        verify_fold_and_decide(fctn_fold_proof, accum_instance);

        // Construct and accumulate the mock kernel circuit (no kernel accum in first round)
        Builder kernel_circuit{ goblin.op_queue };
        construct_mock_folding_kernel(kernel_circuit, fctn_fold_proof, kernel_fold_proof);
        goblin.merge(kernel_circuit); // must be called prior to folding
        // WORKTODO: Getting an issue in the fold prover here; making standalone test to debug
        // auto kernel_fold_proof = construct_fold_proof_and_update_accumulator(accum_instance, kernel_circuit);

        // // DEBUG only
        // verify_fold_and_decide(kernel_fold_proof, accum_instance);
    }

    // // WORKTODO: execute the decider prover here?

    // info("goblin prove");
    // Goblin::Proof proof = goblin.prove();
    // // WORKTODO: Execute the decider verifier
    // // Verify the goblin proof (eccvm, translator, merge)
    // info("goblin verify");
    // bool verified = goblin.verify(proof);
    // EXPECT_TRUE(verified);
    // // WORKTODO: check decider result as well
    // // EXPECT_TRUE(ultra_verified && verified);
}

/**
 * @brief Check that we can fold a recursive folding verifier circuit
 * @details This has not been checked elsewhere and seems to be the failure point of the full test above
 */
TEST_F(GoblinFoldingTests, FoldRecursiveFoldingVerifier)
{
    Goblin goblin;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    // Construct two arbirary circuits (sized to match size of single recursive verifier = 2^15)
    Builder circuit1{ goblin.op_queue };
    Builder circuit2{ goblin.op_queue };
    create_mock_function_circuit(circuit1, 1 << 14); // 2^14 here results in 2^15
    create_mock_function_circuit(circuit2, 1 << 14); // 2^14 here results in 2^15
    Composer composer;
    auto instance1 = composer.create_instance(circuit1);
    auto instance2 = composer.create_instance(circuit2);
    std::vector<std::shared_ptr<Instance>> instances{ instance1, instance2 };
    info("function circuit num_gates = ", instance1->proving_key->circuit_size);

    // Fold the first two arbitrary circuits
    auto folding_prover = composer.create_folding_prover(instances);
    auto output = folding_prover.fold_instances();
    auto accumulator = output.accumulator;
    auto fold_proof = output.folding_data;

    // DEBUG only: check the folding all the way through decider
    verify_fold_and_decide(fold_proof, accumulator);

    // Construct a recursive folding verifier circuit
    Builder rec_verifier_circuit{ goblin.op_queue };
    FoldingRecursiveVerifier verifier{ &rec_verifier_circuit };
    verifier.verify_folding_proof(fold_proof);
    // WORKTODO: DEBUG: try adding a public input via the mock function circuit; Without this we don't get through fold
    // proving; with it we get through but decider fails
    create_mock_function_circuit(rec_verifier_circuit, 2);

    // Check size of recursive verifier circuit
    Composer composer2;
    auto ver_instance = composer.create_instance(rec_verifier_circuit);
    info("rec verifier size = ", ver_instance->proving_key->circuit_size);

    // Fold recursive verifier circuit into the accumulator instance
    auto verifier_fold_proof = construct_fold_proof_and_update_accumulator(accumulator, rec_verifier_circuit);

    // DEBUG only
    verify_fold_and_decide(verifier_fold_proof, accumulator);
}