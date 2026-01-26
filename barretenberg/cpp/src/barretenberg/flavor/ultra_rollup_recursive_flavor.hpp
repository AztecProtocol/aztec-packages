// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"

namespace bb {

/**
 * @brief The recursive counterpart to the "native" UltraRollupFlavor.
 * @details Nearly identical to UltraRecursiveFlavor_, but with NativeFlavor = UltraRollupFlavor.
 * This distinction is needed for concept checks (e.g., HasIPAAccumulator) that trigger different code paths.
 *
 * @tparam BuilderType Determines the arithmetization of the verifier circuit defined based on this flavor.
 */
template <typename BuilderType> class UltraRollupRecursiveFlavor_ : public UltraRecursiveFlavor_<BuilderType> {
  public:
    using NativeFlavor = UltraRollupFlavor;
};

} // namespace bb
