// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Perform a specified number of circuit accumulation rounds
 *
 * @param NUM_CIRCUITS Number of circuits to accumulate (apps + kernels)
 */
std::pair<ClientIVC::Proof, ClientIVC::VerificationKey> accumulate_and_prove_ivc_with_precomputed_vks(
    size_t num_app_circuits, auto& precomputed_vks, const bool large_first_app = true)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, large_first_app);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    ClientIVC ivc{ NUM_CIRCUITS, trace_settings };

    BB_ASSERT_EQ(precomputed_vks.size(), NUM_CIRCUITS, "There should be a precomputed VK for each circuit");

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            BB_BENCH_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc);
        }

        ivc.accumulate(circuit, precomputed_vks[circuit_idx]);
    }
    return { ivc.prove(), ivc.get_vk() };
}

std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> precompute_vks(const size_t num_app_circuits,
                                                                                  const bool large_first_app = true)
{
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    CircuitProducer circuit_producer(num_app_circuits, large_first_app);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    ClientIVC ivc{ NUM_CIRCUITS, trace_settings };

    std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> vkeys;
    for (size_t j = 0; j < NUM_CIRCUITS; ++j) {

        auto circuit = circuit_producer.create_next_circuit(ivc);

        // Hiding kernel does not use structured trace
        if (j == NUM_CIRCUITS - 1) {
            trace_settings = TraceSettings{};
        }
        auto vk = CircuitProducer::get_verification_key(circuit, trace_settings);
        vkeys.push_back(vk);
        ivc.accumulate(circuit, vk);
    }

    return vkeys;
}

} // namespace bb
