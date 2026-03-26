#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs_test_serde.hpp"
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
    using ClientCircuit = Chonk::ClientCircuit;
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

enum class CircuitType : uint8_t { APP, KERNEL, GOBLIN_FLUSH_APP };

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
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using KernelIOSerde = bb::stdlib::recursion::honk::KernelIOSerde;

    std::vector<CircuitType> circuit_types;

    MockDatabusProducer mock_databus;
    bool large_first_app = true;
    constexpr static size_t NUM_TRAILING_KERNELS = 3; // reset, tail, hiding

    std::array<Commitment, ClientCircuit::NUM_WIRES> previous_circuit_ecc_op_tables;

  public:
    size_t circuit_counter = 0;
    size_t total_num_circuits = 0;

    /**
     * @param num_app_circuits Number of app circuits (including any goblin flush apps)
     * @param large_first_app Whether the first app should be 2^19
     * @param flush_app_indices Vector of app indices (0-based among apps) that should be goblin flush apps.
     *        E.g., {2} means the 3rd app (A_G) is a flush app.
     */
    PrivateFunctionExecutionMockCircuitProducer(size_t num_app_circuits,
                                                bool large_first_app = true,
                                                const std::vector<size_t>& flush_app_indices = {})
        : large_first_app(large_first_app)
        , total_num_circuits(num_app_circuits * 2 +
                             NUM_TRAILING_KERNELS) /*One kernel per app, plus a fixed number of final kernels*/
    {
        // Set flags indicating which circuits are kernels vs apps
        for (size_t i = 0; i < num_app_circuits; ++i) {
            circuit_types.emplace_back(CircuitType::APP);    // every other circuit is an app
            circuit_types.emplace_back(CircuitType::KERNEL); // every other circuit is a kernel
        }
        for (size_t i = 0; i < NUM_TRAILING_KERNELS; ++i) {
            circuit_types.emplace_back(CircuitType::KERNEL);
        }

        // Override APP with GOBLIN_FLUSH_APP for specified indices
        for (const auto& idx : flush_app_indices) {
            size_t app_circuit_pos = idx * 2; // position of the app in the circuit_types vector
            BB_ASSERT(idx < num_app_circuits, "Flush app index is out of bounds");
            circuit_types[app_circuit_pos] = CircuitType::GOBLIN_FLUSH_APP;
        }
    }

    /**
     * @brief Precompute the verification key for the given circuit.
     *
     */
    std::shared_ptr<VerificationKey> get_verification_key(ClientCircuit& builder_in)
    {
        bool is_next_goblin_flush = false;
        if (circuit_counter < circuit_types.size() && circuit_types[circuit_counter] == CircuitType::GOBLIN_FLUSH_APP) {
            is_next_goblin_flush = true;
        }

        // This is a workaround to ensure that the circuit is finalized before we create the verification key
        // In practice, this should not be needed as the circuit will be finalized when it is accumulated into the IVC
        // but this is a workaround for the test setup.
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };

        // Deepcopy the opqueue to avoid modifying the original one when finalising the circuit
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        std::shared_ptr<Chonk::ProverInstance> prover_instance = std::make_shared<Chonk::ProverInstance>(builder);
        std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());

        if (is_next_goblin_flush) {
            // If the next app is a goblin app, we need to extract the commitments for the ecc op wires to populate the
            // flush app's T_prev and t
            CommitmentKey<curve::BN254> commitment_key(prover_instance->dyadic_size());
            for (auto [table, poly] :
                 zip_view(previous_circuit_ecc_op_tables, prover_instance->polynomials.get_ecc_op_wires())) {
                table = commitment_key.commit(poly);
            }
        }

        return vk;
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
        const bool is_kernel = circuit_types[circuit_counter] == CircuitType::KERNEL;
        const bool is_goblin_flush = circuit_types[circuit_counter] == CircuitType::GOBLIN_FLUSH_APP;
        const bool use_large_circuit = large_first_app && (circuit_counter == 0); // first circuit is size 2^19
        circuit_counter++;
        // Check if this is one of the trailing kernels (reset, tail, hiding)
        const bool is_trailing_kernel = (ivc.num_circuits_accumulated >= ivc.get_num_circuits() - NUM_TRAILING_KERNELS);

        ClientCircuit circuit{ ivc.goblin.op_queue };

        if (is_goblin_flush) {
            // Build a mock goblin flush app (A_G) with GoblinFlushIO public inputs
            auto flush_io = build_mock_goblin_flush_app(circuit, ivc, log2_num_gates);
            mock_databus.populate_app_databus(circuit);
            flush_io.set_public();
        } else {
            if (log2_num_gates != 0) {
                // if the number of gates is specified we just add a number of arithmetic gates
                MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
                // Add some public inputs
                for (size_t i = 0; i < num_public_inputs; ++i) {
                    circuit.add_public_variable(FF(13634816 + i)); // arbitrary number
                }
            } else {
                // If the number of gates is not specified we create a structured mock circuit
                if (is_kernel) {
                    // For trailing kernels (reset, tail, hiding), skip the expensive mock kernel logic to match real
                    // Noir flows. These kernels are simpler and mainly contain the completion logic added by Chonk.
                    if (!is_trailing_kernel) {
                        GoblinMockCircuits::construct_mock_folding_kernel(circuit); // construct mock base logic
                    }
                } else {
                    GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit); // construct mock app
                }
            }

            if (is_kernel) {
                mock_databus.populate_kernel_databus(circuit);
            } else {
                mock_databus.populate_app_databus(circuit);
            }
        }

        if (is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit);
        } else if (!is_goblin_flush) {
            stdlib::recursion::honk::AppIO::add_default(circuit);
        }

        if (check_circuit_sizes) {
            auto prover_instance = std::make_shared<Chonk::ProverInstance>(circuit);
            size_t log2_dyadic_size = prover_instance->log_dyadic_size();
            if (log2_num_gates != 0) {
                if (is_kernel) {
                    // There are various possibilities here, so we provide a bound
                    BB_ASSERT_LTE(log2_dyadic_size,
                                  19UL,
                                  "Log number of gates in a kernel with fixed number of arithmetic gates has "
                                  "exceeded bound.");
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
                                      16UL,
                                      "Trailing kernel circuit size has exceeded expected bound (should be <= 2^16).");
                        vinfo("Log number of gates in a trailing kernel circuit is: ", log2_dyadic_size);
                    } else {
                        BB_ASSERT_EQ(log2_dyadic_size,
                                     18UL,
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

    /**
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    std::pair<ClientCircuit, std::shared_ptr<VerificationKey>> create_next_circuit_and_vk(
        Chonk& ivc, TestSettings settings = {}, bool check_circuit_size = false)
    {
        // If this is a mock hiding kernel, remove the settings and use a default (non-structured) trace
        if (ivc.num_circuits_accumulated == ivc.get_num_circuits() - 1) {
            settings = TestSettings{};
        }
        auto circuit =
            create_next_circuit(ivc, settings.log2_num_gates, settings.num_public_inputs, check_circuit_size);
        return { circuit, get_verification_key(circuit) };
    }

    void construct_and_accumulate_next_circuit(Chonk& ivc, TestSettings settings = {}, bool check_circuit_sizes = false)
    {
        auto [circuit, vk] = create_next_circuit_and_vk(ivc, settings, check_circuit_sizes);
        ivc.accumulate(circuit, vk);
    }

    /**
     * @brief Tamper with databus data to facilitate failure testing
     */
    void tamper_with_databus() { mock_databus.tamper_with_app_return_data(); }

  private:
    /**
     * @brief Build a mock goblin flush app (A_G) circuit with GoblinFlushIO public inputs.
     * @details Constructs a Mega circuit with GoblinFlushIO values matching the IVC state:
     *   - T_prev = previous kernel's ecc_op_tables (from KernelIO in the verification queue)
     *   - t = previous kernel's ecc op wire commitments (saved during accumulate)
     *   - ipa_claim = a random valid IPA claim
     *   - pairing_inputs = default (infinity) points
     */
    stdlib::recursion::honk::GoblinFlushIO<ClientCircuit> build_mock_goblin_flush_app(ClientCircuit& circuit,
                                                                                      Chonk& ivc,
                                                                                      size_t log2_num_gates)
    {
        using GoblinFlushIO = stdlib::recursion::honk::GoblinFlushIO<ClientCircuit>;
        using GrumpkinCurve = stdlib::grumpkin<ClientCircuit>;
        using G1 = typename GoblinFlushIO::G1;

        // Add mock gates
        if (log2_num_gates != 0) {
            MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /*include_public_inputs=*/false);
        } else {
            GoblinMockCircuits::construct_mock_app_circuit(circuit, /*large=*/false);
        }

        // Extract KernelIO from the previous kernel's proof in the verification queue
        BB_ASSERT(ivc.verification_queue.size() == 1, "Goblin flush app requires a preceding kernel in the queue");
        auto& kernel_entry = ivc.verification_queue.front();
        BB_ASSERT(kernel_entry.is_kernel, "Expected first queue entry to be a kernel");
        size_t num_pub_inputs = kernel_entry.honk_vk->num_public_inputs;
        KernelIOSerde kernel_io = KernelIOSerde::from_proof(kernel_entry.proof, num_pub_inputs);

        // Construct GoblinFlushIO with values matching the IVC state
        GoblinFlushIO flush_io;

        // Pairing points: default points at infinity
        flush_io.pairing_inputs = GoblinFlushIO::PairingInputs::construct_default();

        // IPA claim: create a random valid IPA claim
        auto [stdlib_opening_claim, flush_ipa_proof] =
            IPA<GrumpkinCurve>::create_random_valid_ipa_claim_and_proof(circuit);
        flush_io.ipa_claim = stdlib_opening_claim;
        circuit.ipa_proof = flush_ipa_proof;

        // T_prev: must match previous kernel's ecc_op_tables (from KernelIO)
        for (size_t i = 0; i < ClientCircuit::NUM_WIRES; i++) {
            flush_io.T_prev[i] = G1::from_witness(&circuit, kernel_io.ecc_op_tables[i]);
        }

        // t: must match previous kernel's ecc op wire commitments (saved during accumulate)
        for (size_t i = 0; i < ClientCircuit::NUM_WIRES; i++) {
            flush_io.t[i] = G1::from_witness(&circuit, previous_circuit_ecc_op_tables[i]);
        }

        return flush_io;
    }
};

} // namespace
