#pragma once
#include "barretenberg/circuit_checker/ultra_circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief The unified interface for check circuit functionality implemented in the specialized CircuitChecker classes
 *
 */
class CircuitChecker {
  public:
    static bool check(const UltraCircuitBuilder& builder) { return UltraCircuitChecker::check(builder); }
    static bool check(const MegaCircuitBuilder& builder) { return UltraCircuitChecker::check(builder); }
};

} // namespace bb
