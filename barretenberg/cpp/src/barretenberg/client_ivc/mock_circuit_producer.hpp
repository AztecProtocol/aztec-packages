// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/bb_bench.hpp"
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
    std::vector<bool> is_kernel_flags;

    MockDatabusProducer mock_databus;
    bool large_first_app = true;
    constexpr static size_t NUM_TRAILING_KERNELS = 3; // reset, tail, hiding

  public:
    size_t total_num_circuits = 0;

    PrivateFunctionExecutionMockCircuitProducer(size_t num_app_circuits, bool large_first_app = true)
        : large_first_app(large_first_app)
        , total_num_circuits(num_app_circuits * 2 +
                             NUM_TRAILING_KERNELS) /*One kernel per app, plus a fixed number of final kernels*/
    {
        // Set flags indicating which circuits are kernels vs apps
        is_kernel_flags.resize(total_num_circuits, true);
        for (size_t i = 0; i < num_app_circuits; ++i) {
            is_kernel_flags[2 * i] = false; // every other circuit is an app
        }
    }

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
        std::shared_ptr<ClientIVC::ProverInstance> prover_instance =
            std::make_shared<ClientIVC::ProverInstance>(builder, trace_settings);
        std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        return vk;
    }

    /**
     * @brief Create either a circuit with certain number of gates or a more realistic circuit (withv various custom
     * gates and databus usage) in case number of gates is not specified, that is also filled up to 2^17 or 2^19 if
     * large.
     *
     */
    ClientCircuit create_next_circuit(ClientIVC& ivc, size_t log2_num_gates = 0, size_t num_public_inputs = 0)
    {
        const bool is_kernel = is_kernel_flags[circuit_counter];

        circuit_counter++;

        ClientCircuit circuit{ ivc.goblin.op_queue };
        // if the number of gates is specified we just add a number of arithmetic gates
        if (log2_num_gates != 0) {
            MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
            // Add some public inputs
            for (size_t i = 0; i < num_public_inputs; ++i) {
                circuit.add_public_variable(13634816 + i); // arbitrary number
            }
        } else {
            // If the number of gates is not specified we create a structured mock circuit
            if (is_kernel) {
                GoblinMockCircuits::construct_mock_folding_kernel(circuit); // construct mock base logic
                mock_databus.populate_kernel_databus(circuit);              // populate databus inputs/outputs
            } else {
                bool use_large_circuit = large_first_app && (circuit_counter == 1); // first circuit is size 2^19
                GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit); // construct mock app
                mock_databus.populate_app_databus(circuit);                                 // populate databus outputs
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
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    std::pair<ClientCircuit, std::shared_ptr<VerificationKey>> create_next_circuit_and_vk(ClientIVC& ivc,
                                                                                          TestSettings settings = {})
    {
        // If this is a mock hiding kernel, remove the settings and use a default (non-structured) trace
        if (ivc.num_circuits_accumulated == ivc.get_num_circuits() - 1) {
            settings = TestSettings{};
            ivc.trace_settings = TraceSettings{};
        }
        auto circuit = create_next_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs);
        return { circuit, get_verification_key(circuit, ivc.trace_settings) };
    }

    void construct_and_accumulate_next_circuit(ClientIVC& ivc, TestSettings settings = {})
    {
        auto [circuit, vk] = create_next_circuit_and_vk(ivc, settings);
        ivc.accumulate(circuit, vk);
    }

    /**
     * @brief Tamper with databus data to facilitate failure testing
     */
    void tamper_with_databus() { mock_databus.tamper_with_app_return_data(); }
};

} // namespace
