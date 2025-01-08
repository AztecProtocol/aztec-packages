
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"

using namespace bb;

namespace {

/**
 * @brief Manage the construction of mock app/kernel circuits for the private function execution setting
 * @details Per the medium complexity benchmark spec, the first app circuit is size 2^19. Subsequent app and kernel
 * circuits are size 2^17. Circuits produced are alternatingly app and kernel. Mock databus data is passed between the
 * circuits in a manor conistent with the real architecture in order to facilitate testing of databus consistency
 * checks.
 */
class PrivateFunctionExecutionMockCircuitProducer {
    using ClientCircuit = UltraVanillaClientIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;

    bool large_first_app = true; // if true, first app is 2^19, else 2^17

  public:
    PrivateFunctionExecutionMockCircuitProducer(bool large_first_app = true)
        : large_first_app(large_first_app)
    {}

    /**
     * @brief Create the next circuit (app/kernel) in a mocked private function execution stack
     */
    ClientCircuit create_next_circuit(UltraVanillaClientIVC& ivc, bool force_is_kernel = false)
    {
        circuit_counter++;

        // Assume only every second circuit is a kernel, unless force_is_kernel == true
        bool is_kernel = (circuit_counter % 2 == 0) || force_is_kernel;

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
    auto precompute_verification_keys(const size_t num_circuits, TraceSettings trace_settings)
    {
        UltraVanillaClientIVC ivc{
            trace_settings
        }; // temporary IVC instance needed to produce the complete kernel circuits

        std::vector<std::shared_ptr<VerificationKey>> vkeys;

        for (size_t idx = 0; idx < num_circuits; ++idx) {
            ClientCircuit circuit = create_next_circuit(ivc); // create the next circuit
            ivc.accumulate(circuit);                          // accumulate the circuit
            vkeys.emplace_back(ivc.honk_vk);                  // save the VK for the circuit
        }
        circuit_counter = 0; // reset the internal circuit counter back to 0

        return vkeys;
    }
};

} // namespace