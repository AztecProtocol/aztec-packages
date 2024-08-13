
#include "barretenberg/aztec_ivc/aztec_ivc.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace bb;

namespace {

/**
 * @brief Manage the construction of mock app/kernel circuits for the private function execution setting
 * @details Per the medium complexity benchmark spec, the first app circuit is size 2^19. Subsequent app and kernel
 * circuits are size 2^17. Circuits produced are alternatingly app and kernel.
 */
class PrivateFunctionExecutionMockCircuitProducer {
    using ClientCircuit = AztecIVC::ClientCircuit;
    using Flavor = MegaFlavor;
    using VerificationKey = Flavor::VerificationKey;

    size_t circuit_counter = 0;

  public:
    ClientCircuit create_next_circuit(AztecIVC& ivc)
    {
        circuit_counter++;

        bool is_kernel = (circuit_counter % 2 == 0); // Every other circuit is a kernel, starting from the second

        ClientCircuit circuit{ ivc.goblin.op_queue };
        if (is_kernel) {
            GoblinMockCircuits::construct_mock_folding_kernel(circuit); // construct mock base logic
            ivc.complete_kernel_circuit_logic(circuit);                 // complete with recursive verifiers etc
        } else {
            // bool use_large_circuit = false; // first circuit is size 2^19
            bool use_large_circuit = (circuit_counter == 1); // first circuit is size 2^19
            GoblinMockCircuits::construct_mock_app_circuit(circuit, use_large_circuit);
        }
        return circuit;
    }

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
    auto precompute_verification_keys(const size_t num_circuits, TraceStructure trace_structure)
    {
        AztecIVC ivc; // temporary IVC instance needed to produce the complete kernel circuits
        ivc.trace_structure = trace_structure;

        std::vector<std::shared_ptr<VerificationKey>> vkeys;

        for (size_t idx = 0; idx < num_circuits; ++idx) {
            ClientCircuit circuit = create_next_circuit(ivc); // create the next circuit
            ivc.execute_accumulation_prover(circuit);         // accumulate the circuit
            vkeys.emplace_back(ivc.instance_vk);              // save the VK for the circuit
        }
        circuit_counter = 0; // reset the internal circuit counter back to 0

        return vkeys;
    }
};

} // namespace