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

    static FoldingOutput construct_fold_proof_and_update_accumulator(std::shared_ptr<Instance>& accumulator,
                                                                     Builder& circuit_to_fold)
    {
        Composer composer;
        auto instance = composer.create_instance(circuit_to_fold);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        FoldingOutput output = folding_prover.fold_instances();
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
                                              FoldProof& fctn_fold_proof,
                                              FoldProof& kernel_fold_proof)
    {
        FoldingRecursiveVerifier verifier_1{ &builder };
        verifier_1.verify_folding_proof(fctn_fold_proof);

        FoldingRecursiveVerifier verifier_2{ &builder };
        verifier_2.verify_folding_proof(kernel_fold_proof);
    }

    // DEBUG only: perform native fold verification and run decider prover/verifier
    static void EXEPCT_FOLDING_AND_DECIDING_VERIFIED(FoldingOutput& folding_output)
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
TEST_F(GoblinFoldingTests, Full)
{
    Goblin goblin;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    // "Round 0"
    // Initialize accumulator with function instance
    Builder function_circuit{ goblin.op_queue };
    create_mock_function_circuit(function_circuit);
    FoldingOutput function_folding_output;
    Composer composer;
    function_folding_output.accumulator = composer.create_instance(function_circuit);
    info("function circuit num_gates = ", function_folding_output.accumulator->proving_key->circuit_size);

    // Fold kernel circuit into function instance
    Builder kernel_circuit{ goblin.op_queue };
    create_mock_function_circuit(kernel_circuit);
    FoldingOutput kernel_folding_output =
        construct_fold_proof_and_update_accumulator(function_folding_output.accumulator, kernel_circuit);
    info("kernel circuit num_gates = ", kernel_folding_output.accumulator->proving_key->circuit_size);
    EXEPCT_FOLDING_AND_DECIDING_VERIFIED(kernel_folding_output);

    // "Round i"
    size_t NUM_CIRCUITS = 1;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        // Construct and accumulate a mock function circuit
        Builder function_circuit{ goblin.op_queue };
        create_mock_function_circuit(function_circuit);
        goblin.merge(function_circuit); // must be called prior to folding
        function_folding_output =
            construct_fold_proof_and_update_accumulator(kernel_folding_output.accumulator, function_circuit);
        EXEPCT_FOLDING_AND_DECIDING_VERIFIED(function_folding_output);

        // Construct and accumulate the mock kernel circuit
        Builder kernel_circuit{ goblin.op_queue };
        construct_mock_folding_kernel(
            kernel_circuit, function_folding_output.folding_data, kernel_folding_output.folding_data);
        goblin.merge(kernel_circuit); // must be called prior to folding
        kernel_folding_output =
            construct_fold_proof_and_update_accumulator(function_folding_output.accumulator, kernel_circuit);
        EXEPCT_FOLDING_AND_DECIDING_VERIFIED(kernel_folding_output);
    }

    // Verify the goblin proof (eccvm, translator, merge)
    Goblin::Proof proof = goblin.prove();
    bool goblin_verified = goblin.verify(proof);
    EXPECT_TRUE(goblin_verified);
}