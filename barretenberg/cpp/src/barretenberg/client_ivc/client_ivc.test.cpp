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
    //   protected:
    //     static void SetUpTestSuite()
    //     {
    //         srs::init_crs_factory("../srs_db/ignition");
    //         srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    //     }

    //     using Flavor = ClientIVC::Flavor;
    //     using FF = typename Flavor::FF;
    //     using Builder = ClientIVC::ClientCircuit;
    //     using Composer = GoblinUltraComposer;
    //     using ProverAccumulator = ClientIVC::ProverAccumulator;
    //     using VerifierAccumulator = ClientIVC::VerifierAccumulator;
    //     using VerifierInstance = std::shared_ptr<ClientIVC::VerifierInstance>;
    //     using FoldProof = ClientIVC::FoldProof;

    //     using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    //     using RecursiveVerifierInstance =
    //     ::bb::stdlib::recursion::honk::RecursiveVerifierInstance_<GURecursiveFlavor>; using
    //     RecursiveVerifierAccumulator = std::shared_ptr<RecursiveVerifierInstance>; using RecursiveVerifierInstances =
    //     ::bb::stdlib::recursion::honk::RecursiveVerifierInstances_<GURecursiveFlavor, 2>; using
    //     FoldingRecursiveVerifier =
    //         bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;

    //     /**
    //      * @brief Construct mock circuit with arithmetic gates and goblin ops
    //      * @details Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of
    //      2)
    //      *
    //      */
    //     static Builder create_mock_circuit(ClientIVC& ivc, size_t num_gates = 1 << 15)
    //     {
    //         Builder circuit{ ivc.goblin.op_queue };
    //         GoblinMockCircuits::construct_arithmetic_circuit(circuit, num_gates);
    //         GoblinMockCircuits::construct_goblin_ecc_op_circuit(circuit);
    //         return circuit;
    //     }

    //     /**
    //      * @brief Construct mock kernel consisting of two recursive folding verifiers
    //      *
    //      * @param builder
    //      * @param fctn_fold_proof
    //      * @param kernel_fold_proof
    //      */
    //     template <typename RecursiveOrNativeAcc>
    //     static RecursiveVerifierAccumulator construct_mock_folding_kernel(Builder& builder,
    //                                                                       FoldProof& fold_proof_1,
    //                                                                       FoldProof& fold_proof_2,
    //                                                                       VerifierInstance& verifier_inst_1,
    //                                                                       VerifierInstance& verifier_inst_2,
    //                                                                       RecursiveOrNativeAcc& prev_kernel_accum)
    //     {

    //         FoldingRecursiveVerifier verifier_1{ &builder, prev_kernel_accum, { verifier_inst_1->verification_key }
    //         }; auto fctn_verifier_accum = verifier_1.verify_folding_proof(fold_proof_1);

    //         FoldingRecursiveVerifier verifier_2{ &builder, fctn_verifier_accum, { verifier_inst_2->verification_key }
    //         }; auto kernel_verifier_accum = verifier_2.verify_folding_proof(fold_proof_2); return
    //         kernel_verifier_accum;
    //     }

    //     /**
    //      * @brief Construct mock kernel consisting of two recursive folding verifiers
    //      *
    //      * @param builder
    //      * @param fctn_fold_proof
    //      * @param kernel_fold_proof
    //      */

    //     /**
    //      * @brief Perform native fold verification and run decider prover/verifier
    //      *
    //      */
    //     // static VerifierAccumulator native_folding(const ProverAccumulator& prover_accumulator,
    //     //                                           const std::vector<std::shared_ptr<VerifierInstance>>&
    //     //                                           verifier_instances, const FoldProof& fold_proof)
    //     // {
    //     //     // Verify fold proof
    //     //     Composer composer;
    //     //     auto folding_verifier = composer.create_folding_verifier(verifier_instances);
    //     //     auto verifier_accumulator = folding_verifier.verify_folding_proof(fold_proof);

    //     //     // Run decider
    //     //     auto decider_prover = composer.create_decider_prover(prover_accumulator);
    //     //     auto decider_verifier = composer.create_decider_verifier(verifier_accumulator);
    //     //     auto decider_proof = decider_prover.construct_proof();
    //     //     bool decision = decider_verifier.verify_proof(decider_proof);
    //     //     EXPECT_TRUE(decision);
    //     // }
    // };

    // /**
    //  * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
    //  *
    //  */
    // TEST_F(ClientIVCTests, Full)
    // {
    //     ClientIVC ivc;

    //     // Initialize IVC with function circuit
    //     Builder function_circuit_1 = create_mock_circuit(ivc);
    //     ivc.initialize(function_circuit_1);
    //     VerifierAccumulator native_verifier_accum =
    //         ivc.get_verifier_accumulator(); // fake accumulator, just a function circuit for the first round

    //     Builder kernel_circuit = create_mock_circuit(ivc);
    //     FoldProof kernel_fold_proof = ivc.accumulate(kernel_circuit);
    //     auto kernel_verifier_inst = ivc.get_verifier_instance();
    //     size_t NUM_CIRCUITS = 2;
    //     RecursiveVerifierAccumulator kernel_verifier_accum;
    //     Builder* prev_kernel_circuit;
    //     for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
    //         // Accumulate function circuit
    //         Builder function_circuit = create_mock_circuit(ivc);
    //         FoldProof function_fold_proof = ivc.accumulate(function_circuit);
    //         auto fnct_verifier_inst = ivc.get_verifier_instance();

    //         // Accumulate kernel circuit
    //         Builder kernel_circuit{ ivc.goblin.op_queue };
    //         if (circuit_idx == 0) {
    //             // kernel_verifier_accum = construct_mock_folding_kernel(kernel_circuit,
    //             //                                                       kernel_fold_proof,
    //             //                                                       function_fold_proof,
    //             //                                                       kernel_verifier_inst,
    //             //                                                       fnct_verifier_inst,
    //             //                                                       native_verifier_accum);
    //             FoldingRecursiveVerifier verifier_1{ &kernel_circuit,
    //                                                  native_verifier_accum,
    //                                                  { kernel_verifier_inst->verification_key } };
    //             auto fctn_verifier_accum = verifier_1.verify_folding_proof(kernel_fold_proof);

    //             FoldingRecursiveVerifier verifier_2{ &kernel_circuit,
    //                                                  fctn_verifier_accum,
    //                                                  { fnct_verifier_inst->verification_key } };
    //             kernel_verifier_accum = verifier_2.verify_folding_proof(function_fold_proof);
    //         } else {
    //             // kernel_verifier_accum = construct_mock_folding_kernel(kernel_circuit,
    //             //                                                       kernel_fold_proof,
    //             //                                                       function_fold_proof,
    //             //                                                       kernel_verifier_inst,
    //             //                                                       fnct_verifier_inst,
    //             //                                                       kernel_verifier_accum);
    //             FoldingRecursiveVerifier verifier_1{ &kernel_circuit,
    //                                                  kernel_verifier_accum,
    //                                                  { kernel_verifier_inst->verification_key } };
    //             auto fctn_verifier_accum = verifier_1.verify_folding_proof(kernel_fold_proof);

    //             FoldingRecursiveVerifier verifier_2{ &kernel_circuit,
    //                                                  fctn_verifier_accum,
    //                                                  { fnct_verifier_inst->verification_key } };
    //             kernel_verifier_accum = verifier_2.verify_folding_proof(function_fold_proof);
    //         }
    //         prev_kernel_circuit = &kernel_circuit; // i think this is needed
    //         static_cast<void>(prev_kernel_circuit);
    //         kernel_fold_proof = ivc.accumulate(kernel_circuit);
    //     }
    //     kernel_verifier_inst = ivc.get_verifier_instance();

    //     // Constuct four proofs: merge, eccvm, translator, decider, last folding proof
    //     auto proof = ivc.prove();
    //     auto native_verifier_acc1 = std::make_shared<ClientIVC::VerifierInstance>();
    //     kernel_verifier_accum->get_value(native_verifier_acc1);

    //     // Verify all four proofs
    //     auto verifier_instances = std::vector<VerifierInstance>{ native_verifier_acc1, kernel_verifier_inst };
    //     auto res = ivc.verify(proof, verifier_instances);

    //     EXPECT_TRUE(res);
};