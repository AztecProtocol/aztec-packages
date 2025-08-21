// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb {

/**
 * @brief Verify an IVC proof
 *
 */
bool verify_ivc(ClientIVC::Proof& proof, ClientIVC& ivc)
{
    bool verified = ivc.verify(proof);

    // This is a benchmark, not a test, so just print success or failure to the log
    if (verified) {
        info("IVC successfully verified!");
    } else {
        info("IVC failed to verify.");
    }
    return verified;
}

/**
 * @brief Perform a specified number of circuit accumulation rounds
 *
 * @param NUM_CIRCUITS Number of circuits to accumulate (apps + kernels)
 */
void perform_ivc_accumulation_rounds(size_t num_app_circuits,
                                     ClientIVC& ivc,
                                     auto& precomputed_vks,

                                     const bool large_first_app = true)
{

    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, large_first_app);
    size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    BB_ASSERT_EQ(precomputed_vks.size(), NUM_CIRCUITS, "There should be a precomputed VK for each circuit");

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            PROFILE_THIS_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc);
        }

        ivc.accumulate(circuit, precomputed_vks[circuit_idx]);
    }
}

std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> mock_vks(const size_t num_app_circuits,
                                                                            const bool large_first_app = true)
{
    // Create an app and kernel vk with metadata set
    PrivateFunctionExecutionMockCircuitProducer circuit_producer{ num_app_circuits, large_first_app };
    size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };
    auto [app_circuit, app_vk] = circuit_producer.create_next_circuit_and_vk(ivc);
    ivc.accumulate(app_circuit, app_vk);
    auto [kernel_circuit, kernel_vk] = circuit_producer.create_next_circuit_and_vk(ivc);

    std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> vkeys;

    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto key = idx % 2 == 0 ? app_vk : kernel_vk; // alternate between app and kernel vks
        vkeys.push_back(key);
    }

    return vkeys;
}

} // namespace bb
