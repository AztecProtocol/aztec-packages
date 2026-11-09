#pragma once

#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/proving_helper.hpp"

namespace bb::avm2 {

class AvmAPI : public AvmSimAPI {
  public:
    using AvmProof = AvmProvingHelper::Proof;
    using AvmVerificationKey = std::vector<uint8_t>;
    using ProvingInputs = AvmProvingInputs;

    AvmAPI() = default;

    /** @brief Selects experimental first-fold and PCS memory optimizations for proving. */
    explicit AvmAPI(bool memory_optimizations)
        : memory_optimizations(memory_optimizations)
    {}

    // NOTE: The public inputs are NOT part of the proof.
    AvmProof prove(const ProvingInputs& inputs);
    bool check_circuit(const ProvingInputs& inputs);
    bool verify(const AvmProof& proof, const PublicInputs& pi);
    AvmVerificationKey get_verification_key();

  private:
    bool memory_optimizations = false;
};

} // namespace bb::avm2
