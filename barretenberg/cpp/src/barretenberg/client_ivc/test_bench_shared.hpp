
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
void perform_ivc_accumulation_rounds(size_t NUM_CIRCUITS,
                                     ClientIVC& ivc,
                                     auto& precomputed_vks,
                                     const bool& mock_vk = false)
{
    ASSERT(precomputed_vks.size() == NUM_CIRCUITS); // ensure presence of a precomputed VK for each circuit

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            PROFILE_THIS_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc);
        }

        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vks[circuit_idx], mock_vk);
    }
}

std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> mock_verification_keys(const size_t num_circuits)
{

    std::vector<std::shared_ptr<typename MegaFlavor::VerificationKey>> vkeys;

    for (size_t idx = 0; idx < num_circuits; ++idx) {
        auto key = std::make_shared<typename MegaFlavor::VerificationKey>();
        for (auto& commitment : key->get_all()) {
            commitment = MegaFlavor::Commitment::random_element();
        }
        vkeys.push_back(key);
    }

    return vkeys;
}

} // namespace bb