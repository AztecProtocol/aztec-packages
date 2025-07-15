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

/**
 * @brief Manage the construction of mock app/kernel circuits for the private function execution setting
 * @details Per the medium complexity benchmark spec, the first app circuit is size 2^19. Subsequent app and kernel
 * circuits are size 2^17. Circuits produced are alternatingly app and kernel. Mock databus data is passed between the
 * circuits in a manor conistent with the real architecture in order to facilitate testing of databus consistency
 * checks.
 */
class PrivateFunctionExecutionMockCircuitProducer {
    using ClientCircuit = ClientIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;

    MockDatabusProducer mock_databus;

    bool large_first_app = true; // if true, first app is 2^19, else 2^17

  public:
    PrivateFunctionExecutionMockCircuitProducer(bool large_first_app = true)
        : large_first_app(large_first_app)
    {}

    /**
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    ClientCircuit create_next_circuit(ClientIVC& ivc, bool force_is_kernel = false)
    {
        circuit_counter++;

        // Assume only every second circuit is a kernel, unless force_is_kernel == true
        bool is_kernel = (circuit_counter % 2 == 0) || force_is_kernel;

        ClientCircuit circuit{ ivc.goblin.op_queue, is_kernel };
        if (is_kernel) {
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
     * @brief Tamper with databus data to facilitate failure testing
     */
    void tamper_with_databus() { mock_databus.tamper_with_app_return_data(); }

    /**
     * @brief Compute and return the verification keys for a mocked private function execution IVC
     * @details For testing/benchmarking only. This method is robust at the cost of being extremely inefficient. It
     * simply executes a full IVC for a given number of circuits and stores the verification keys along the way. (In
     * practice these VKs will be known to a client prover in advance).
     *
     * @param num_circuits
     * @param trace_structure Trace structuring must be known in advance because it effects the VKs
     * @return set of num_circuits-many verification keys
     */
    auto precompute_vks(const size_t num_circuits, TraceSettings trace_settings)
    {
        ClientIVC ivc{ num_circuits,
                       trace_settings }; // temporary IVC instance needed to produce the complete kernel circuits

        std::vector<std::shared_ptr<VerificationKey>> vks;

        for (size_t idx = 0; idx < num_circuits; ++idx) {
            ClientCircuit circuit = create_next_circuit(ivc); // create the next circuit
            ivc.accumulate(circuit);                          // accumulate the circuit
            vks.emplace_back(ivc.honk_vk);                    // save the VK for the circuit
        }
        circuit_counter = 0; // reset the internal circuit counter back to 0

        return vks;
    }
};

/**
 * @brief A test utility for generating alternating mock app and kernel circuits and precomputing verification keys
 *
 */
class ClientIVCMockCircuitProducer {
    using ClientCircuit = ClientIVC::ClientCircuit;

    bool is_kernel = false;

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Defaulted to add 2^16 gates (which will bump to next power of two with the addition of dummy gates).
     * The size of the baseline circuit needs to be ~2x the number of gates appended to the kernel circuits via
     * recursive verifications (currently ~60k) to ensure that the circuits being folded are equal in size. (This is
     * only necessary if the structured trace is not in use).
     *
     */
    static ClientCircuit create_mock_circuit(ClientIVC& ivc, size_t log2_num_gates = 16)
    {
        ClientCircuit circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
        return circuit;
    }

  public:
    ClientCircuit create_next_circuit(ClientIVC& ivc, size_t log2_num_gates = 16, const size_t num_public_inputs = 0)
    {
        ClientCircuit circuit{ ivc.goblin.op_queue, is_kernel };
        circuit = create_mock_circuit(ivc, log2_num_gates); // construct mock base logic
        while (circuit.num_public_inputs() < num_public_inputs) {
            circuit.add_public_variable(13634816); // arbitrary number
        }
        if (is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit); // complete with recursive verifiers etc
        } else {
            stdlib::recursion::PairingPoints<ClientCircuit>::add_default_to_public_inputs(circuit);
        }
        is_kernel = !is_kernel; // toggle is_kernel on/off alternatingly

        return circuit;
    }

    auto precompute_vks(const size_t num_circuits, TraceSettings trace_settings, size_t log2_num_gates = 16)
    {
        ClientIVC ivc{ num_circuits,
                       trace_settings }; // temporary IVC instance needed to produce the complete kernel circuits

        std::vector<std::shared_ptr<MegaFlavor::VerificationKey>> vks;

        for (size_t idx = 0; idx < num_circuits; ++idx) {
            ClientCircuit circuit = create_next_circuit(ivc, log2_num_gates); // create the next circuit
            ivc.accumulate(circuit);                                          // accumulate the circuit
            vks.emplace_back(ivc.honk_vk);                                    // save the VK for the circuit
        }
        is_kernel = false;

        return vks;
    }
};

} // namespace
