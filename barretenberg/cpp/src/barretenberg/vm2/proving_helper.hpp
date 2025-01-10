#pragma once

#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/generated/prover.hpp"
#include "barretenberg/vm2/generated/verifier.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

class AvmProvingHelper {
  public:
    AvmProvingHelper() = default;
    using Proof = AvmProver::Proof;
    using VkData = std::vector<uint8_t>;

    std::pair<Proof, VkData> prove(tracegen::TraceContainer&& trace);
    bool check_circuit(tracegen::TraceContainer&& trace);
    bool verify(const Proof& proof, const PublicInputs& pi, const VkData& vk_data);
};

} // namespace bb::avm2