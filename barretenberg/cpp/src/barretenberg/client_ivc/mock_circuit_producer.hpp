// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

namespace {

/**
 * @brief Test utility for coordinating passing of databus data between mocked private function execution circuits
 * @details Facilitates testing of the databus consistency checks that establish the correct passing of databus data
 * between circuits. Generates arbitrary return data for each app/kernel. Sets the kernel calldata and
 * secondary_calldata based respectively on the previous kernel return data and app return data.
 */
class MockDatabusProducer {
  private:
    using ClientCircuit = ClientIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;
    using BusDataArray = std::vector<FF>;

    static constexpr size_t BUS_ARRAY_SIZE = 3; // arbitrary length of mock bus inputs
    BusDataArray app_return_data;
    BusDataArray kernel_return_data;

    FF dummy_return_val = 1; // use simple return val for easier test debugging

    BusDataArray generate_random_bus_array()
    {
        BusDataArray result;
        for (size_t i = 0; i < BUS_ARRAY_SIZE; ++i) {
            result.emplace_back(dummy_return_val);
        }
        dummy_return_val += 1;
        return result;
    }

  public:
    /**
     * @brief Update the app return data and populate it in the app circuit
     */
    void populate_app_databus(ClientCircuit& circuit)
    {
        app_return_data = generate_random_bus_array();
        for (auto& val : app_return_data) {
            circuit.add_public_return_data(circuit.add_variable(val));
        }
    };

    /**
     * @brief Populate the calldata and secondary calldata in the kernel from respectively the previous kernel and app
     * return data. Update and populate the return data for the present kernel.
     */
    void populate_kernel_databus(ClientCircuit& circuit)
    {
        // Populate calldata from previous kernel return data (if it exists)
        for (auto& val : kernel_return_data) {
            circuit.add_public_calldata(circuit.add_variable(val));
        }
        // Populate secondary_calldata from app return data (if it exists), then clear the app return data
        for (auto& val : app_return_data) {
            circuit.add_public_secondary_calldata(circuit.add_variable(val));
        }
        app_return_data.clear();

        // Mock the return data for the present kernel circuit
        kernel_return_data = generate_random_bus_array();
        for (auto& val : kernel_return_data) {
            circuit.add_public_return_data(circuit.add_variable(val));
        }
    };

    /**
     * @brief Add an arbitrary value to the app return data. This leads to a descrepency between the values used by the
     * app itself and the secondary_calldata values in the kernel that will be set based on these tampered values.
     */
    void tamper_with_app_return_data() { app_return_data.emplace_back(17); }
};

struct TestSettings {
    size_t num_public_inputs = 0; // number of public inputs to add to the app circuits
    bool force_is_kernel = false; // force the next circuit to be a kernel
    size_t log2_num_gates = 0;
    bool no_vk_precomputation = false; // do not precompute the vk for the circuit
};

/**
 * @brief Manage the construction of mock app/kernel circuits for the private function execution setting
 * @details Per the medium complexity benchmark spec, the first app circuit is size 2^19. Subsequent app and kernel
 * circuits are size 2^17. Circuits produced are alternatingly app and kernel. Mock databus data is passed between the
 * circuits in a manor conistent with the real architecture in order to facilitate testing of databus consistency
 * checks.
 */
// WORKTODO This is the producer we'll use
// WORKTO Point of friction, we need to keep the option of creating circuits with public inputs (available in the other
// mock circuit producer). It should be fine as a last tail  and hiding should be added automatically
// WORKTODO: should prolly not enable adding public inputs to any app circuits and just add some for the hiding kernel
class PrivateFunctionExecutionMockCircuitProducer {
    using ClientCircuit = ClientIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;

    MockDatabusProducer mock_databus;
    bool large_first_app = true;
    bool is_kernel = false; // whether the next circuit is a kernel or not

  public:
    // WORKTODO: smaller tests will set this to false
    PrivateFunctionExecutionMockCircuitProducer(bool large_first_app = true)
        : large_first_app(large_first_app)
    {}

    static std::shared_ptr<VerificationKey> get_verification_key(ClientCircuit& builder_in,
                                                                 TraceSettings& trace_settings)
    {
        // This is a workaround to ensure that the circuit is finalized before we create the verification key
        // In practice, this should not be needed as the circuit will be finalized when it is accumulated into the IVC
        // but this is a workaround for the test setup.
        // Create a copy of the input circuit
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };

        // Deepcopy the opqueue to avoid modifying the original one
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key =
            std::make_shared<ClientIVC::DeciderProvingKey>(builder, trace_settings);
        std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(proving_key->get_precomputed());
        return vk;
    }

    ClientCircuit create_simple_circuit(ClientIVC& ivc, size_t log2_num_gates, size_t num_public_inputs)
    {
        circuit_counter++;
        is_kernel = (circuit_counter % 2 == 0);
        ClientCircuit circuit{ ivc.goblin.op_queue, is_kernel };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
        if (num_public_inputs > 0) {
            // Add some public inputs to the circuit
            for (size_t i = 0; i < num_public_inputs; ++i) {
                circuit.add_public_variable(13634816 + i); // arbitrary number
            }
        }
        if (circuit.is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit);
        } else {
            stdlib::recursion::PairingPoints<ClientCircuit>::add_default_to_public_inputs(circuit);
        }
        return circuit;
    }

    ClientCircuit create_next_circuit_no_vk(ClientIVC& ivc, bool force_is_kernel = false)
    {
        circuit_counter++;
        is_kernel = (circuit_counter % 2 == 0) || force_is_kernel;
        ClientCircuit circuit{ ivc.goblin.op_queue, is_kernel };
        if (circuit.is_kernel) {
            GoblinMockCircuits::construct_mock_folding_kernel(circuit); // construct mock base logic
            mock_databus.populate_kernel_databus(circuit);              // populate databus inputs/outputs
            ivc.complete_kernel_circuit_logic(circuit);                 // complete with recursive verifiers etc
        } else {
            bool use_large_circuit = large_first_app && (circuit_counter == 1);         // first circuit is size 2^19
            GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit); // construct mock app
            mock_databus.populate_app_databus(circuit);                                 // populate databus outputs
        }
        return circuit;
    }

    /**
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    std::pair<ClientCircuit, std::shared_ptr<VerificationKey>> create_next_circuit(ClientIVC& ivc,
                                                                                   TestSettings settings = {})
    {

        if (settings.log2_num_gates != 0) {
            ClientCircuit circuit = create_simple_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs);
            return { circuit, get_verification_key(circuit, ivc.trace_settings) };
        }

        ClientCircuit circuit = create_next_circuit_no_vk(ivc, settings.force_is_kernel); // construct the circuit

        return { circuit, get_verification_key(circuit, ivc.trace_settings) };
    }

    /**
     * @brief Tamper with databus data to facilitate failure testing
     */
    void tamper_with_databus() { mock_databus.tamper_with_app_return_data(); }
};

} // namespace
