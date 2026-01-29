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
 */
class UltraRollupFlavor : public bb::UltraFlavor {
  public:
};

} // namespace bb
