// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

/**
 * @brief Backward compatibility header
 * @details UltraRecursiveVerifier_ is now unified with bb::UltraVerifier_<Flavor, IO>.
 * This header provides a type alias for existing code that uses the old name.
 */
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {

// Default IO type for recursive verifiers: RollupIO for IPA flavors, DefaultIO<Builder> otherwise
template <typename Flavor>
using DefaultRecursiveIO =
    std::conditional_t<HasIPAAccumulator<Flavor>, RollupIO, DefaultIO<typename Flavor::CircuitBuilder>>;

/**
 * @brief Type alias for backward compatibility
 * @details UltraRecursiveVerifier_ is now an alias to the unified bb::UltraVerifier_
 * which supports both native and recursive flavors.
 */
template <typename Flavor, class IO = DefaultRecursiveIO<Flavor>>
using UltraRecursiveVerifier_ = bb::UltraVerifier_<Flavor, IO>;

} // namespace bb::stdlib::recursion::honk
