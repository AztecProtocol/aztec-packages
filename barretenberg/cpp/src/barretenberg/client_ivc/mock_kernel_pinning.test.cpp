#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief For benchmarking, we want to be sure that our mocking functions create circuits of a known size. We control
 * this, to the degree that matters for proof construction time, using these "pinning tests" that fix values.
 *
 */
class MockKernelTest : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(MockKernelTest, PinFoldingKernelSizes)
{
    ClientIVC ivc;

    // Accumulate three circuits to generate two folding proofs for input to folding kernel
    GoblinUltraCircuitBuilder circuit_1{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_1);
    ivc.initialize(circuit_1);
    auto verifier_acc = ivc.get_verifier_accumulator();

    GoblinUltraCircuitBuilder circuit_2{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_2);
    auto fold_proof_1 = ivc.accumulate(circuit_2);
    auto verifier_inst_1 = ivc.get_verifier_instance();

    GoblinUltraCircuitBuilder circuit_3{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_3);
    auto fold_proof_2 = ivc.accumulate(circuit_3);
    auto verifier_inst_2 = ivc.get_verifier_instance();

    // Construct kernel circuit
    GoblinUltraCircuitBuilder kernel_circuit{ ivc.goblin.op_queue };
    auto new_acc = GoblinMockCircuits::construct_mock_folding_kernel(
        kernel_circuit, fold_proof_1, fold_proof_2, verifier_inst_1, verifier_inst_2, verifier_acc);

    auto fold_proof_3 = ivc.accumulate(kernel_circuit);
    auto verifier_inst_3 = ivc.get_verifier_instance();
    EXPECT_EQ(ivc.prover_instance->log_instance_size, 16);

    GoblinUltraCircuitBuilder circuit_4{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_4);
    auto fold_proof_4 = ivc.accumulate(circuit_4);
    auto verifier_inst_4 = ivc.get_verifier_instance();

    GoblinUltraCircuitBuilder new_kernel_circuit = GoblinUltraCircuitBuilder{ ivc.goblin.op_queue };
    new_acc = GoblinMockCircuits::construct_mock_folding_kernel(
        new_kernel_circuit, fold_proof_3, fold_proof_4, verifier_inst_3, verifier_inst_4, new_acc);
    GoblinUltraComposer composer;
    auto instance = composer.create_prover_instance(kernel_circuit);
    EXPECT_EQ(instance->proving_key->log_circuit_size, 16);
}