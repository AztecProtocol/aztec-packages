#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

namespace {

/**
 * @brief Test utility for coordinating passing of databus data between mocked private function execution circuits
 * @details Facilitates testing of the databus consistency checks that establish the correct passing of databus data
 * between circuits. Generates arbitrary return data for each app/kernel. Sets the kernel calldata and app calldata
 * columns based respectively on the previous kernel return data and each app return data.
 */
class MockDatabusProducer {
  private:
    using ClientCircuit = Chonk::ClientCircuit;
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;
    using BusDataArray = std::vector<FF>;

    static constexpr size_t BUS_ARRAY_SIZE = 3; // arbitrary length of mock bus inputs
    std::array<BusDataArray, MAX_APPS_PER_KERNEL> app_return_data;
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
     * @brief Update the next app return data and populate it in the app circuit. App slots are processed in order.
     */
    void populate_app_databus(ClientCircuit& circuit)
    {
        for (auto& app_data : app_return_data) {
            if (app_data.empty()) {
                app_data = generate_random_bus_array();
                for (auto& val : app_data) {
                    circuit.add_public_return_data(circuit.add_variable(val));
                }
                return;
            }
        }
    };

    /**
     * @brief Populate the kernel calldata and app calldata columns from respectively the previous kernel and app return
     * data. Update and populate the return data for the present kernel.
     */
    void populate_kernel_databus(ClientCircuit& circuit)
    {
        // Populate kernel calldata from previous kernel return data (if it exists)
        for (auto& val : kernel_return_data) {
            circuit.add_public_calldata(BusId::KERNEL_CALLDATA, circuit.add_variable(val));
        }
        // Populate app calldata from app return data (if it exists), then clear the app return data
        for (size_t idx = 0; idx < app_return_data.size(); ++idx) {
            for (auto& val : app_return_data[idx]) {
                circuit.add_public_calldata(static_cast<BusId>(idx + 1), circuit.add_variable(val));
            }
            app_return_data[idx].clear();
        }

        // Mock the return data for the present kernel circuit
        kernel_return_data = generate_random_bus_array();
        for (auto& val : kernel_return_data) {
            circuit.add_public_return_data(circuit.add_variable(val));
        }
    };
};

/**
 * @brief Customises the production of mock circuits for Chonk testing
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
    using ClientCircuit = Chonk::ClientCircuit;
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
    {
        for (size_t i = 0; i < num_app_circuits / MAX_APPS_PER_KERNEL; ++i) {
            for (size_t idx = 0; idx < MAX_APPS_PER_KERNEL; ++idx) {
                is_kernel_flags.emplace_back(false);
            }
            is_kernel_flags.emplace_back(true);
        }
        if (num_app_circuits % MAX_APPS_PER_KERNEL != 0) {
            for (size_t idx = 0; idx < num_app_circuits % MAX_APPS_PER_KERNEL; ++idx) {
                is_kernel_flags.emplace_back(false);
            }
            is_kernel_flags.emplace_back(true);
        }
        for (size_t i = 0; i < NUM_TRAILING_KERNELS; ++i) {
            is_kernel_flags.emplace_back(true);
        }
        total_num_circuits = is_kernel_flags.size();
    }

    PrivateFunctionExecutionMockCircuitProducer(std::vector<bool> leading_is_kernel_flags, bool large_first_app = false)
        : is_kernel_flags(std::move(leading_is_kernel_flags))
        , large_first_app(large_first_app)
    {
        BB_ASSERT(!is_kernel_flags.empty(), "Mock circuit layout must contain at least one leading circuit");
        BB_ASSERT_EQ(is_kernel_flags[0], false, "Mock circuit layout must start with an app circuit");
        for (size_t i = 0; i < NUM_TRAILING_KERNELS; ++i) {
            is_kernel_flags.emplace_back(true);
        }
        total_num_circuits = is_kernel_flags.size();
    }

    /**
     * @brief Create either a circuit with certain number of gates or a more realistic circuit (withv various custom
     * gates and databus usage) in case number of gates is not specified, that is also filled up to 2^17 or 2^19 if
     * large.
     *
     */
    ClientCircuit create_next_circuit(Chonk& ivc,
                                      size_t log2_num_gates = 0,
                                      size_t num_public_inputs = 0,
                                      bool check_circuit_sizes = false)
    {
        const bool is_kernel = is_kernel_flags[circuit_counter++];
        const bool use_large_circuit = large_first_app && (circuit_counter == 1); // first circuit is size 2^19
        // Check if this is one of the trailing kernels (reset, tail, hiding)
        const bool is_trailing_kernel = (ivc.num_circuits_accumulated >= ivc.get_num_circuits() - NUM_TRAILING_KERNELS);

        ClientCircuit circuit{ ivc.goblin.op_queue };
        // if the number of gates is specified we just add a number of arithmetic gates
        if (log2_num_gates != 0) {
            MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
            // Add some public inputs
            for (size_t i = 0; i < num_public_inputs; ++i) {
                circuit.add_public_variable(typename Flavor::FF(13634816 + i)); // arbitrary number
            }
        } else {
            // If the number of gates is not specified we create a structured mock circuit
            if (is_kernel) {
                // For trailing kernels (reset, tail, hiding), skip the expensive mock kernel logic to match real Noir
                // flows. These kernels are simpler and mainly contain the completion logic added by Chonk.
                if (!is_trailing_kernel) {
                    GoblinMockCircuits::construct_mock_folding_kernel(circuit); // construct mock base logic
                }
                mock_databus.populate_kernel_databus(circuit); // populate databus inputs/outputs
            } else {
                GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit); // construct mock app
                mock_databus.populate_app_databus(circuit);                                 // populate databus outputs
            }
        }

        if (is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit);
        } else {
            stdlib::recursion::honk::AppIO::add_default(circuit);
        }

        if (check_circuit_sizes) {
            // Size the circuit under its actual proving flavor — apps are MegaAppFlavor, kernels
            // are MegaKernelFlavor (trailing kernels included: the hiding-kernel-sized
            // MegaZKFlavor only differs in TRACE_OFFSET, not in dyadic size for these mocks).
            const size_t log2_dyadic_size = is_kernel ? ProverInstance_<Chonk::KernelFlavor>(circuit).log_dyadic_size()
                                                      : ProverInstance_<Chonk::AppFlavor>(circuit).log_dyadic_size();
            if (log2_num_gates != 0) {
                if (is_kernel) {
                    // There are various possibilities here, so we provide a bound
                    BB_ASSERT_LTE(
                        log2_dyadic_size,
                        19UL,
                        "Log number of gates in a kernel with fixed number of arithmetic gates has exceeded bound.");
                    vinfo("Log number of gates in a kernel with fixed number of arithmetic gates is: ",
                          log2_dyadic_size);
                } else {
                    // The offset is due to the fact that finalization adds a certain number of gates
                    size_t LOG2_OFFSET = 2;
                    BB_ASSERT_LTE(log2_dyadic_size,
                                  log2_num_gates + LOG2_OFFSET,
                                  "Log number of arithemtic gates produced is different from the one requested.");
                }
            } else {
                if (is_kernel) {
                    // Trailing kernels (reset, tail, hiding) are simpler than regular kernels
                    if (is_trailing_kernel) {
                        // Trailing kernels should be significantly smaller, with hiding kernel < 2^16
                        BB_ASSERT_LTE(log2_dyadic_size,
                                      17UL,
                                      "Trailing kernel circuit size has exceeded expected bound (should be <= 2^16).");
                        vinfo("Log number of gates in a trailing kernel circuit is: ", log2_dyadic_size);
                    } else {
                        const bool is_init_kernel = circuit_counter == 2;
                        const size_t expected_log2_dyadic_size = is_init_kernel ? 17UL : 18UL;
                        BB_ASSERT_EQ(log2_dyadic_size,
                                     expected_log2_dyadic_size,
                                     "There has been a change in the number of gates of a mock kernel circuit.");
                    }
                } else {
                    BB_ASSERT_EQ(log2_dyadic_size,
                                 use_large_circuit ? 19UL : 17UL,
                                 "There has been a change in the of gates generated for a mock app circuit.");
                }
            }
        }
        return circuit;
    }

    void construct_and_accumulate_next_circuit(Chonk& ivc, TestSettings settings = {}, bool check_circuit_sizes = false)
    {
        // If this is a mock hiding kernel, remove the settings and use a default (non-structured) trace
        const bool is_hiding_kernel = ivc.num_circuits_accumulated == ivc.get_num_circuits() - 1;
        if (is_hiding_kernel) {
            settings = TestSettings{};
        }
        auto circuit =
            create_next_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs, check_circuit_sizes);
        const Chonk::CircuitKind kind = ivc.next_circuit_kind();
        ivc.accumulate(circuit, kind, make_circuit_verification_key(kind, circuit));
    }

  private:
    // Build the per-kind verification key for the current circuit. Uses `dispatch_kind` to map
    // the runtime `CircuitKind` to the matching flavor and derive its precomputed VK.
    static Chonk::CircuitVerificationKey make_circuit_verification_key(Chonk::CircuitKind kind,
                                                                       ClientCircuit& builder_in)
    {
        return dispatch_kind(kind, [&]<Chonk::CircuitKind K>() -> Chonk::CircuitVerificationKey {
            using FlavorT = flavor_for<K>;
            using VK = typename FlavorT::VerificationKey;
            MegaCircuitBuilder_<bb::fr> builder{ builder_in };
            builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
            auto prover_instance = std::make_shared<ProverInstance_<FlavorT>>(builder);
            return Chonk::CircuitVerificationKey{ std::make_shared<VK>(prover_instance->get_precomputed()) };
        });
    }

  public:
};

} // namespace
