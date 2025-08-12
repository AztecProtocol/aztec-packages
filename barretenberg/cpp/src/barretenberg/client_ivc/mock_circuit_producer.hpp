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
 * @brief Customises the production of mock circuits for Client IVC testing
 *
 */
struct TestSettings {
    // number of public inputs to manually add to circuits, by default this would be 0 because we use the
    // MockDatabusProducer to test public inputs handling
    size_t num_public_inputs = 0;
    // force the next circuit to be a kernel in order to test the occurence of consecutive kernels (expected behaviour
    // in real flows)
    bool force_is_kernel = false;
    // by default we will create more complex apps and kernel with various types of gates but in case we want to
    // specifically test overflow behaviour or unstructured circuits we can manually construct simple circuits with a
    // specified number of gates
    size_t log2_num_gates = 0;
};

/**
 * @brief Manage the construction of mock app/kernel circuits for the private function execution setting
 * @details Per the medium complexity benchmark spec, the first app circuit is size 2^19. Subsequent app and kernel
 * circuits are size 2^17. Circuits produced are alternatingly app and kernel. Mock databus data is passed between the
 * circuits in a manor conistent with the real architecture in order to facilitate testing of databus consistency
 * checks. Additionally, we allow for the creation of simpler circuits with public inputs set manually but also for
 * testing consecutive kernels. These can be configured via TestSettings.
 */
class PrivateFunctionExecutionMockCircuitProducer {
    using ClientCircuit = ClientIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;

    MockDatabusProducer mock_databus;
    bool large_first_app = true;
    bool is_kernel = false; // whether the next circuit is a kernel or not

  public:
    PrivateFunctionExecutionMockCircuitProducer(bool large_first_app = true)
        : large_first_app(large_first_app)
    {}

    /**
     * @brief Precompute the verification key for the given circuit.
     *
     */
    static std::shared_ptr<VerificationKey> get_verification_key(ClientCircuit& builder_in,
                                                                 TraceSettings& trace_settings)
    {
        // This is a workaround to ensure that the circuit is finalized before we create the verification key
        // In practice, this should not be needed as the circuit will be finalized when it is accumulated into the IVC
        // but this is a workaround for the test setup.
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };

        // Deepcopy the opqueue to avoid modifying the original one when finalising the circuit
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
        ClientCircuit circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
        if (num_public_inputs > 0) {
            // Add some public inputs to the circuit
            for (size_t i = 0; i < num_public_inputs; ++i) {
                circuit.add_public_variable(13634816 + i); // arbitrary number
            }
        }
        if (is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit);
        } else {
            stdlib::recursion::PairingPoints<ClientCircuit>::add_default_to_public_inputs(circuit);
        }
        return circuit;
    }

    /**
     * @brief Create a more realistic circuit (withv various custom gates and databus usage) that is also filled up to
     * 2^17 or 2^19 if large.
     *
     */
    ClientCircuit create_next_circuit(ClientIVC& ivc, bool force_is_kernel = false)
    {
        circuit_counter++;

        // Assume only every second circuit is a kernel, unless force_is_kernel == true or we accumulate an odd number
        // of circuits in which case we have to explicitly enforce the last circuit is a kernel
        bool is_kernel = (circuit_counter % 2 == 0) || circuit_counter == ivc.get_num_circuits() || force_is_kernel;

        ClientCircuit circuit{ ivc.goblin.op_queue };
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
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    std::pair<ClientCircuit, std::shared_ptr<VerificationKey>> create_next_circuit_and_vk(ClientIVC& ivc,
                                                                                          TestSettings settings = {})
    {

        // If a specific number of gates is specified we create a simple circuit with only arithmetic gates to easily
        // control the total number of gates.
        if (settings.log2_num_gates != 0) {
            ClientCircuit circuit = create_simple_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs);
            return { circuit, get_verification_key(circuit, ivc.trace_settings) };
        }

        ClientCircuit circuit = create_next_circuit(ivc, settings.force_is_kernel); // construct the circuit

        return { circuit, get_verification_key(circuit, ivc.trace_settings) };
    }

    void construct_and_accumulate_next_circuit(ClientIVC& ivc, TestSettings settings = {})
    {
        auto [circuit, vk] = create_next_circuit_and_vk(ivc, settings);
        ivc.accumulate(circuit, vk);

        if (circuit_counter == ivc.get_num_circuits()) {
            construct_hiding_kernel(ivc);
        }
    }

    /**
     * @brief Tamper with databus data to facilitate failure testing
     */
    void tamper_with_databus() { mock_databus.tamper_with_app_return_data(); }
    /**
     * @brief Creates the hiding circuit to complete IVC accumulation
     */
    static void construct_hiding_kernel(ClientIVC& ivc)
    {
        // create a builder from the goblin op_queue
        ClientIVC::ClientCircuit circuit{ ivc.goblin.op_queue };
        // complete the hiding kernel logic
        ivc.complete_kernel_circuit_logic(circuit);
    }
};

} // namespace
