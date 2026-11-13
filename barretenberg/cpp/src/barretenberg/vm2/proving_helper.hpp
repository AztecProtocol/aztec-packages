#pragma once

#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

class AvmProvingHelper {
  public:
    AvmProvingHelper() = default;

    /** @brief Selects experimental first-fold, PCS accumulation, and native MSM workspace policies for proving. */
    explicit AvmProvingHelper(bool memory_optimizations)
        : memory_optimizations(memory_optimizations)
    {}

    using Proof = AvmProver::Proof;
    using VkData = std::vector<uint8_t>;

    Proof prove(tracegen::TraceContainer&& trace);
    bool check_circuit(tracegen::TraceContainer&& trace);
    bool verify(const Proof& proof, const PublicInputs& pi);

  private:
    bool memory_optimizations = false;
};

} // namespace bb::avm2
