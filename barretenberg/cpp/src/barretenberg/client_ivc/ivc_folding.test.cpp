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
    using Builder = ClientIVC::ClientCircuit;
    using Composer = GoblinUltraComposer;
    using Instance = ProverInstance_<GoblinUltraFlavor>;

    using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstances = ::bb::VerifierInstances_<GURecursiveFlavor, 2>;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

    // WORKTODO: temporary stuff to be eventiually handled internally by ivc

    using FoldingOutput = FoldingResult<GoblinUltraFlavor>;
    using Accumulator = std::shared_ptr<ProverInstance_<Flavor>>;
    using FoldProof = std::vector<FF>;

    // Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of 2)
    static Builder create_mock_circuit(ClientIVC& ivc, size_t num_gates = 1 << 15)
    {
        Builder circuit{ ivc.goblin.op_queue }; // WORKTODO: write constructor
        GoblinMockCircuits::construct_arithmetic_circuit(circuit, num_gates);
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    // Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of 2)
    static void create_mock_function_circuit(Builder& builder, size_t num_gates = 1 << 15)
    {
        GoblinMockCircuits::construct_arithmetic_circuit(builder, num_gates);
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(builder);
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
    static void EXEPECT_FOLDING_AND_DECIDING_VERIFIED(const Accumulator& accumulator, const FoldProof& fold_proof)
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

// /**
//  * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
//  * @details
//  */
// TEST_F(ClientIVCTests, Full)
// {
//     // WORKTODO move these up
//     const auto EXPECT_ACCUMULATION_VERIFIED = [](AccumulatorWithProof& folding_output) {
//         EXPECT_TRUE(ivc.verify_accumulation(folding_output));
//     };

//     const auto EXPECT_ACCUMULATOR_VERIFIED = [](AccumulatorWithProof& folding_output) {
//         EXPECT_TRUE(ivc.verify_accumulator(folding_output));
//     };

//     ClientIVC ivc; // mock opqueue  happens inside
//     Builder function_circuit = create_mock_circuit(ivc);
//     ivc.initialize(function_circuit);

//     Builder kernel_circuit = create_mock_circuit(ivc);
//     AccumulatorWithProof kernel_acc_with_proof = ivc.accumulate(kernel_circuit); // handles merge base case
//     EXPECT_ACCUMULATION_VERIFIED(kernel_acc_with_proof);

//     size_t NUM_KERNEL_ITERATIONS_MINUS_1 = 1;
//     for (size_t circuit_idx = 0; circuit_idx < NUM_KERNEL_ITERATIONS_MINUS_1; ++circuit_idx) {
//         // Construct and accumulate a mock function circuit
//         Builder function_circuit = create_mock_circuit(ivc);
//         function_folding_output = ivc.accumulate(function_circuit);
//         EXEPECT_FOLDING_AND_DECIDING_VERIFIED(function_folding_output);

//         // Construct and accumulate the mock kernel circuit
//         // WORKNOTE: this is the reason to track two
//         Builder kernel_circuit =
//             construct_mock_folding_kernel(function_folding_output.folding_data, kernel_acc_with_proof.folding_data);
//         kernel_acc_with_proof = ivc.accumulate(kernel_circuit);
//         EXEPECT_FOLDING_AND_DECIDING_VERIFIED(kernel_acc_with_proof);
//     }

//     EXPECT_ACCUMULATOR_VERIFIED(kernel_accumulation_output);
// }

/**
 * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
 * @details
 */
TEST_F(ClientIVCTests, Working)
{
    ClientIVC ivc;

    // "Round 0"
    // Initialize accumulator with function instance
    Builder function_circuit = create_mock_circuit(ivc);
    ivc.initialize(function_circuit);
    info("function circuit num_gates = ", ivc.accumulator->proving_key->circuit_size);

    // Fold kernel circuit into function instance
    Builder kernel_circuit = create_mock_circuit(ivc);
    FoldProof kernel_fold_proof = ivc.accumulate(kernel_circuit);
    info("kernel circuit num_gates = ", ivc.accumulator->instance_size);
    EXEPECT_FOLDING_AND_DECIDING_VERIFIED(ivc.accumulator, kernel_fold_proof);

    // "Round i"
    size_t NUM_CIRCUITS = 1;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        // Construct and accumulate a mock function circuit
        Builder function_circuit = create_mock_circuit(ivc);
        FoldProof function_fold_proof = ivc.accumulate(function_circuit);
        EXEPECT_FOLDING_AND_DECIDING_VERIFIED(ivc.accumulator, function_fold_proof);

        // Construct and accumulate the mock kernel circuit
        Builder kernel_circuit{ ivc.goblin.op_queue };
        construct_mock_folding_kernel(kernel_circuit, function_fold_proof, kernel_fold_proof);
        FoldProof kernel_fold_proof = ivc.accumulate(kernel_circuit);
        EXEPECT_FOLDING_AND_DECIDING_VERIFIED(ivc.accumulator, kernel_fold_proof);
    }

    // Verify the goblin proof (eccvm, translator, merge)
    Goblin::Proof proof = ivc.goblin.prove();
    bool goblin_verified = ivc.goblin.verify(proof);
    EXPECT_TRUE(goblin_verified);
}

// /**
//  * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
//  * @details
//  */
// TEST_F(ClientIVCTests, WorkingOriginl)
// {
//     Goblin goblin;

//     // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
//     GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

//     // "Round 0"
//     // Initialize accumulator with function instance
//     Builder function_circuit{ goblin.op_queue };
//     create_mock_function_circuit(function_circuit);
//     FoldingOutput function_folding_output;
//     Composer composer;
//     function_folding_output.accumulator = composer.create_instance(function_circuit);
//     info("function circuit num_gates = ", function_folding_output.accumulator->proving_key->circuit_size);

//     // Fold kernel circuit into function instance
//     Builder kernel_circuit{ goblin.op_queue };
//     create_mock_function_circuit(kernel_circuit);
//     FoldingOutput kernel_folding_output =
//         construct_fold_proof_and_update_accumulator(function_folding_output.accumulator, kernel_circuit);
//     info("kernel circuit num_gates = ", kernel_folding_output.accumulator->instance_size);
//     EXEPECT_FOLDING_AND_DECIDING_VERIFIED(kernel_folding_output);

//     // "Round i"
//     size_t NUM_CIRCUITS = 1;
//     for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
//         // Construct and accumulate a mock function circuit
//         Builder function_circuit{ goblin.op_queue };
//         create_mock_function_circuit(function_circuit);
//         goblin.merge(function_circuit); // must be called prior to folding
//         function_folding_output =
//             construct_fold_proof_and_update_accumulator(kernel_folding_output.accumulator, function_circuit);
//         EXEPECT_FOLDING_AND_DECIDING_VERIFIED(function_folding_output);

//         // Construct and accumulate the mock kernel circuit
//         Builder kernel_circuit{ goblin.op_queue };
//         construct_mock_folding_kernel(
//             kernel_circuit, function_folding_output.folding_data, kernel_folding_output.folding_data);
//         goblin.merge(kernel_circuit); // must be called prior to folding
//         kernel_folding_output =
//             construct_fold_proof_and_update_accumulator(function_folding_output.accumulator, kernel_circuit);
//         EXEPECT_FOLDING_AND_DECIDING_VERIFIED(kernel_folding_output);
//     }

//     // Verify the goblin proof (eccvm, translator, merge)
//     Goblin::Proof proof = goblin.prove();
//     bool goblin_verified = goblin.verify(proof);
//     EXPECT_TRUE(goblin_verified);
// }