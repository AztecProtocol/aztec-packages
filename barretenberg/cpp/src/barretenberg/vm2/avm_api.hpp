#pragma once

#include <tuple>

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/world_state/types.hpp"

namespace bb::avm2 {

class AvmAPI {
  public:
    using AvmProof = AvmProvingHelper::Proof;
    using AvmVerificationKey = std::vector<uint8_t>;
    using ProvingInputs = AvmProvingInputs;

    AvmAPI() = default;

    // NOTE: The public inputs are NOT part of the proof.
    std::pair<AvmProof, AvmVerificationKey> prove(const ProvingInputs& inputs);
    bool check_circuit(const ProvingInputs& inputs);
    bool verify(const AvmProof& proof, const PublicInputs& pi, const AvmVerificationKey& vk_data);

    void simulate(const ExecutionHints& hints, world_state::WorldStateRevision& ws_revision);
};

} // namespace bb::avm2
