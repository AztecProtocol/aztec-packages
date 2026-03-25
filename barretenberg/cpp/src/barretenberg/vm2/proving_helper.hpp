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
    using Proof = AvmProver::Proof;
    using VkData = std::vector<uint8_t>;

    Proof prove(tracegen::TraceContainer&& trace);
    bool check_circuit(tracegen::TraceContainer&& trace);
    bool verify(const Proof& proof, const PublicInputs& pi);

    // Returns the VK (populated with precomputed group commitments after prove()).
    std::shared_ptr<AvmFlavor::VerificationKey> get_vk() const { return vk_; }

  private:
    // The VK includes precomputed group commitments computed during prove().
    // The verify() method reuses this VK if available.
    std::shared_ptr<AvmFlavor::VerificationKey> vk_;
};

} // namespace bb::avm2
