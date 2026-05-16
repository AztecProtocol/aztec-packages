#pragma once
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace bb {

/**
 * @brief The unified interface for check circuit functionality implemented in the specialized CircuitChecker classes
 *
 */
class CircuitChecker {
  public:
    static bool check(const UltraCircuitBuilder& builder);
    static bool check(const MegaCircuitBuilder& builder);
};

} // namespace bb
