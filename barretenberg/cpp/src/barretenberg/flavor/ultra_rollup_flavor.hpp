// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"

namespace bb {

/**
 * @brief UltraRollupFlavor extends UltraFlavor with IPA proof support.
 * @details The only difference from UltraFlavor is that PROOF_LENGTH_WITHOUT_PUB_INPUTS includes IPA_PROOF_LENGTH.
 */
class UltraRollupFlavor : public bb::UltraFlavor {
  public:
    static constexpr size_t PROOF_LENGTH_WITHOUT_PUB_INPUTS(size_t virtual_log_n = VIRTUAL_LOG_N)
    {
        return UltraFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(virtual_log_n) + IPA_PROOF_LENGTH;
    }
};

} // namespace bb
