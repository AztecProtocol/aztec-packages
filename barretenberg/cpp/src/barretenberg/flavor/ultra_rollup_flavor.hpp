// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"

namespace bb {

/**
 * @brief UltraRollupFlavor extends UltraFlavor with IPA proof support.
 * @details The only differences from UltraFlavor are:
 * 1. PROOF_LENGTH_WITHOUT_PUB_INPUTS includes IPA_PROOF_LENGTH
 * 2. BACKEND_PUB_INPUTS_SIZE uses RollupIO::PUBLIC_INPUTS_SIZE
 * All other types (VerificationKey, VerifierCommitments, etc.) are inherited.
 */
class UltraRollupFlavor : public bb::UltraFlavor {
  public:
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return UltraFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) + IPA_PROOF_LENGTH;
    }
};

} // namespace bb
