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

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using Builder = ClientIVC::ClientCircuit;
    using Composer = GoblinUltraComposer;
    using ProverAccumulator = ClientIVC::ProverAccumulator;
    using VerifierAccumulator = ClientIVC::VerifierAccumulator;
    using VerifierInstance = std::shared_ptr<ClientIVC::VerifierInstance>;
    using FoldProof = ClientIVC::FoldProof;

    using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstance = ::bb::stdlib::recursion::honk::RecursiveVerifierInstance_<GURecursiveFlavor>;
    using RecursiveVerifierAccumulator = std::shared_ptr<RecursiveVerifierInstance>;
    using RecursiveVerifierInstances = ::bb::stdlib::recursion::honk::RecursiveVerifierInstances_<GURecursiveFlavor, 2>;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using FoldOutput = GoblinMockCircuits::FoldOutput;

    /**
     * @brief Construct mock kernel consisting of two recursive folding verifiers
     *
     * @param builder
     * @param fctn_fold_proof
     * @param kernel_fold_proof
     */

    /**
     * @brief Perform native fold verification and run decider prover/verifier
     *
     */
    // static VerifierAccumulator native_folding(const ProverAccumulator& prover_accumulator,
    //                                           const std::vector<std::shared_ptr<VerifierInstance>>&
    //                                           verifier_instances, const FoldProof& fold_proof)
    // {
    //     // Verify fold proof
    //     Composer composer;
    //     auto folding_verifier = composer.create_folding_verifier(verifier_instances);
    //     auto verifier_accumulator = folding_verifier.verify_folding_proof(fold_proof);

    //     // Run decider
    //     auto decider_prover = composer.create_decider_prover(prover_accumulator);
    //     auto decider_verifier = composer.create_decider_verifier(verifier_accumulator);
    //     auto decider_proof = decider_prover.construct_proof();
    //     bool decision = decider_verifier.verify_proof(decider_proof);
    //     EXPECT_TRUE(decision);
    // }
};

/**
 * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
 *
 */
TEST_F(ClientIVCTests, Full)
{
    // using FoldOutput = GoblinMockCircuits::FoldOutput;
    ClientIVC ivc;

    auto vks = ivc.precompute_folding_verification_keys();
    // Initialize IVC with function circuit
    GoblinUltraCircuitBuilder circuit_1{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_1);
    ivc.initialize(circuit_1);
    auto verifier_acc = std::make_shared<ClientIVC::VerifierInstance>();
    verifier_acc->verification_key = vks[0];

    GoblinUltraCircuitBuilder circuit_2{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_2);
    FoldProof function_fold_proof = ivc.accumulate(circuit_2);
    FoldOutput function_fold_output = { function_fold_proof, vks[1] };

    Builder kernel_circuit{ ivc.goblin.op_queue };
    auto kernel_acc =
        GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit, function_fold_output, {}, verifier_acc);
    FoldProof kernel_fold_proof = ivc.accumulate(kernel_circuit);
    FoldOutput kernel_fold_output = { kernel_fold_proof, vks[2] };

    size_t NUM_CIRCUITS = 2;
    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        // Accumulate function circuit
        Builder function_circuit{ ivc.goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
        FoldProof function_fold_proof = ivc.accumulate(function_circuit);
        function_fold_output = { function_fold_proof, vks[1] };

        // Accumulate kernel circuit
        Builder kernel_circuit{ ivc.goblin.op_queue };
        kernel_acc = GoblinMockCircuits::construct_mock_folding_kernel(
            kernel_circuit, function_fold_output, kernel_fold_output, kernel_acc);
        kernel_fold_proof = ivc.accumulate(kernel_circuit);
        kernel_fold_output = { kernel_fold_proof, vks[3] };
    }

    // // Constuct four proofs: merge, eccvm, translator, decider, last folding proof
    auto proof = ivc.prove();
    auto kernel_inst = std::make_shared<ClientIVC::VerifierInstance>();
    kernel_inst->verification_key = vks[3];
    // // Verify all four proofs
    auto verifier_instances = std::vector<VerifierInstance>{ kernel_acc, kernel_inst };
    auto res = ivc.verify(proof, verifier_instances);

    EXPECT_TRUE(res);
};