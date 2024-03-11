#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/protogalaxy_recursive_verifier.hpp"

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
    using ProverAccumulator = ClientIVC::ProverAccumulator;
    using VerifierAccumulator = ClientIVC::VerifierAccumulator;
    using VerifierInstance = ClientIVC::VerifierInstance;
    using FoldProof = ClientIVC::FoldProof;
    using VerifierFoldData = GoblinMockCircuits::VerifierFoldData;
    using GURecursiveFlavor = GoblinUltraRecursiveFlavor_<Builder>;
    using RecursiveVerifierInstance = ::bb::stdlib::recursion::honk::RecursiveVerifierInstance_<GURecursiveFlavor>;
    using RecursiveVerifierAccumulator = std::shared_ptr<RecursiveVerifierInstance>;
    using RecursiveVerifierInstances = ::bb::stdlib::recursion::honk::RecursiveVerifierInstances_<GURecursiveFlavor, 2>;
    using FoldingRecursiveVerifier =
        bb::stdlib::recursion::honk::ProtoGalaxyRecursiveVerifier_<RecursiveVerifierInstances>;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using ProverInstances = ProverInstances_<Flavor>;
    using FoldingProver = ProtoGalaxyProver_<ProverInstances>;
    using VerifierInstances = VerifierInstances_<Flavor>;
    using FoldingVerifier = ProtoGalaxyVerifier_<VerifierInstances>;

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Currently default sized to 2^16 to match kernel. (Note: op gates will bump size to next power of
     2)
     *
     */
    static Builder create_mock_circuit(ClientIVC& ivc, size_t log2_num_gates = 15)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    /**
     * @brief Construct mock kernel consisting of two recursive folding verifiers to verify the folding of the previous
     * function circuit and kernel circuit.
     *
     * @param builder
     * @param func_accum contains the folding proof for the function circuit and the corresponsing function
     * verifier instance
     * @param kernel_accum contains the folding proof for the kernel circuit and the corresponding kernel verifier
     * instance
     * @returns the updated verifier accumulator
     */
    static VerifierAccumulator construct_mock_folding_kernel(Builder& builder,
                                                             VerifierFoldData& func_accum,
                                                             VerifierFoldData& kernel_accum,
                                                             VerifierAccumulator& prev_kernel_accum)
    {

        FoldingRecursiveVerifier verifier_1{ &builder, prev_kernel_accum, { func_accum.inst_vk } };
        auto fctn_verifier_accum = verifier_1.verify_folding_proof(func_accum.fold_proof);
        auto native_acc = std::make_shared<ClientIVC::VerifierInstance>(fctn_verifier_accum->get_value());
        FoldingRecursiveVerifier verifier_2{ &builder, native_acc, { kernel_accum.inst_vk } };
        auto kernel_verifier_accum = verifier_2.verify_folding_proof(kernel_accum.fold_proof);
        return std::make_shared<ClientIVC::VerifierInstance>(kernel_verifier_accum->get_value());
    }

    /**
     * @brief Perform native fold verification and run decider prover/verifier
     *
     */
    static VerifierAccumulator update_accumulator_and_decide_native(
        const ProverAccumulator& prover_accumulator,
        const FoldProof& fold_proof,
        const VerifierAccumulator& prev_verifier_accumulator,
        const std::shared_ptr<Flavor::VerificationKey>& verifier_inst_vk)
    {
        // Verify fold proof
        auto new_verifier_inst = std::make_shared<VerifierInstance>(verifier_inst_vk);
        FoldingVerifier folding_verifier({ prev_verifier_accumulator, new_verifier_inst });
        auto verifier_accumulator = folding_verifier.verify_folding_proof(fold_proof);

        // Run decider
        DeciderProver decider_prover(prover_accumulator);
        DeciderVerifier decider_verifier(verifier_accumulator);
        auto decider_proof = decider_prover.construct_proof();
        bool decision = decider_verifier.verify_proof(decider_proof);
        EXPECT_TRUE(decision);

        return verifier_accumulator;
    }
};

/**
 * @brief A full Goblin test using PG that mimicks the basic aztec client architecture
 *
 */
TEST_F(ClientIVCTests, Fold1Succeeds)
{
    using VerificationKey = Flavor::VerificationKey;

    ClientIVC ivc;
    // Initialize IVC with function circuit
    Builder circuit = create_mock_circuit(ivc);
    ivc.initialize(circuit);
    auto verification_key = std::make_shared<VerificationKey>(ivc.prover_fold_output.accumulator->proving_key);
    auto verifier_accumulator = std::make_shared<VerifierInstance>(verification_key);

    FoldProof fold_proof;
    VerifierFoldData fold_data;
    const auto ivc_step = [&]() {
        // Fold a circuit
        circuit = create_mock_circuit(ivc);
        fold_proof = ivc.accumulate(circuit);
        fold_data = { fold_proof, verification_key };
        verification_key = std::make_shared<VerificationKey>(ivc.prover_instance->proving_key);
        update_accumulator_and_decide_native(
            ivc.prover_fold_output.accumulator, fold_proof, verifier_accumulator, verification_key);

        // Recursively verify the folding
        circuit = create_mock_circuit(ivc);
        FoldingRecursiveVerifier folding_verifier{ &circuit, verifier_accumulator, { verification_key } };
        auto recursive_verifier_accumulator = folding_verifier.verify_folding_proof(fold_data.fold_proof);
        fold_proof = ivc.accumulate(circuit);
        verification_key = std::make_shared<VerificationKey>(ivc.prover_instance->proving_key);
        verifier_accumulator = std::make_shared<VerifierInstance>(recursive_verifier_accumulator->get_value());
        EXPECT_TRUE(CircuitChecker::check(circuit));
    };

    ivc_step();

    auto client_proof = ivc.prove();
    auto final_instance = std::make_shared<VerifierInstance>(verification_key);
    EXPECT_TRUE(ivc.verify(client_proof, { verifier_accumulator, final_instance }));
};