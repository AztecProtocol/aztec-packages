#pragma once
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::test_utils {

/**
 * @brief Utility function for gate count checking and circuit verification
 *
 * This function finalizes the circuit, checks the gate count against an expected value, and runs the circuit checker.
 * The expected gate count should be provided WITHOUT the fixed number of gates that result from default constants added
 * in the builder:
 * - 1 base gate for UltraCircuitBuilder (fixed constant 0)
 * - 4 base gates for MegaCircuitBuilder (fixed constants 0, 3, 4, 8 for ecc op codes)
 *
 * @tparam Builder The circuit builder type
 * @param builder The circuit builder instance
 * @param expected_gates_without_base Expected number of gates excluding base gates
 */
template <typename Builder> void check_circuit_and_gate_count(Builder& builder, uint32_t expected_gates_without_base)
{
    if (!builder.circuit_finalized) {
        builder.finalize_circuit(/*ensure_nonzero=*/false);
    }

    // Add base gates: Ultra adds 1, Mega adds 4
    uint32_t base_gates = 1; // Default for Ultra
    if constexpr (!std::is_same_v<Builder, bb::UltraCircuitBuilder>) {
        base_gates = 4; // Mega
    }
    uint32_t expected_gates = expected_gates_without_base + base_gates;

    uint32_t actual_gates = static_cast<uint32_t>(builder.get_num_finalized_gates());
    EXPECT_EQ(actual_gates, expected_gates)
        << "Gate count changed! Expected: " << expected_gates << " (" << expected_gates_without_base << " + "
        << base_gates << " base), Actual: " << actual_gates;

    // Ensure no failure flags and run the circuit checker
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb::stdlib::test_utils
