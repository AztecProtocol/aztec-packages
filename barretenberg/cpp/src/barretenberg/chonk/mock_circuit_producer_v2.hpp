#pragma once

#include "barretenberg/chonk/chonk_v2.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"

using namespace bb;

namespace {

/**
 * @brief Mock circuit producer for ChonkV2 (MegaV2Flavor).
 *
 * @details Mirrors PrivateFunctionExecutionMockCircuitProducer but:
 *   - Uses KernelV2IO::add_default() for app circuits (instead of AppIO)
 *   - Adds deferred Poseidon2 hashes via queue_poseidon2_permutation()
 *   - Uses ChonkV2::complete_kernel_circuit_logic() for kernel completion
 *   - Creates VKs with MegaV2Flavor
 */
class PrivateFunctionExecutionMockCircuitProducerV2 {
    using ClientCircuit = ChonkV2::ClientCircuit;
    using Flavor = MegaV2Flavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;
    std::vector<bool> is_kernel_flags;

    MockDatabusProducer mock_databus;
    bool large_first_app = true;
    constexpr static size_t NUM_TRAILING_KERNELS = 3;

  public:
    size_t total_num_circuits = 0;

    PrivateFunctionExecutionMockCircuitProducerV2(size_t num_app_circuits, bool large_first_app = true)
        : large_first_app(large_first_app)
        , total_num_circuits(num_app_circuits * 2 + NUM_TRAILING_KERNELS)
    {
        for (size_t i = 0; i < num_app_circuits; ++i) {
            is_kernel_flags.emplace_back(false);
            is_kernel_flags.emplace_back(true);
        }
        for (size_t i = 0; i < NUM_TRAILING_KERNELS; ++i) {
            is_kernel_flags.emplace_back(true);
        }
    }

    static std::shared_ptr<VerificationKey> get_verification_key(ClientCircuit& builder_in)
    {
        MegaCircuitBuilder_<bb::fr> builder{ builder_in };
        builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
        if (builder.poseidon2_op_queue) {
            builder.poseidon2_op_queue = std::make_shared<Poseidon2OpQueue>(*builder.poseidon2_op_queue);
        }
        std::shared_ptr<ProverInstance_<Flavor>> prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
        return std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    }

    ClientCircuit create_next_circuit(ChonkV2& ivc, size_t log2_num_gates = 0)
    {
        const bool is_kernel = is_kernel_flags[circuit_counter++];
        const bool use_large_circuit = large_first_app && (circuit_counter == 1);
        const bool is_trailing_kernel = (ivc.num_circuits_accumulated >= ivc.get_num_circuits() - NUM_TRAILING_KERNELS);

        ClientCircuit circuit{ ivc.goblin.op_queue };
        // Share the poseidon2_op_queue
        circuit.poseidon2_op_queue = ivc.goblin.poseidon2_op_queue;

        if (log2_num_gates != 0) {
            // Tiny circuit: just arithmetic gates + ECC ops for valid Goblin state
            MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates, /* include_public_inputs= */ false);
        } else if (is_kernel) {
            if (!is_trailing_kernel) {
                GoblinMockCircuits::construct_mock_folding_kernel(circuit);
            }
            mock_databus.populate_kernel_databus(circuit);
        } else {
            GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit);
            mock_databus.populate_app_databus(circuit);

            // Add some deferred Poseidon2 hashes (this is what ChonkV2 optimizes)
            for (size_t i = 0; i < 10; i++) {
                std::array<uint32_t, 4> sponge_indices = {
                    circuit.add_variable(fr::random_element()), circuit.add_variable(fr::random_element()),
                    circuit.add_variable(fr::random_element()), circuit.add_variable(fr::random_element())
                };
                circuit.queue_poseidon2_permutation(sponge_indices);
            }
        }

        if (is_kernel) {
            ivc.complete_kernel_circuit_logic(circuit);
        } else {
            stdlib::recursion::honk::AppIO::add_default(circuit);
        }

        return circuit;
    }
};

} // namespace
