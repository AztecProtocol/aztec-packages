// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include <cstdint>

namespace acir_format {

using namespace bb;

/**
 * @brief Logic constraint representation in ACIR format.
 *
 * @details The logic constraint enforces that:
 *  1. The inputs a and b fit into num_bits bits.
 *  2. That the result is the bitwise AND or XOR of a and b, depending on the is_xor_gate flag.
 *
 * NOTE: num_bits must be <= MAX_NO_WRAP_INTEGER_BIT_LENGTH (252)
 *
 */
struct LogicConstraint {
    WitnessOrConstant<fr> a;
    WitnessOrConstant<fr> b;
    uint32_t result;
    uint32_t num_bits;
    bool is_xor_gate;

    friend bool operator==(LogicConstraint const& lhs, LogicConstraint const& rhs) = default;
};

template <typename Builder>
void create_logic_gate(Builder& builder,
                       WitnessOrConstant<fr> a,
                       WitnessOrConstant<fr> b,
                       uint32_t result,
                       std::size_t num_bits,
                       bool is_xor_gate);

void xor_gate(UltraCircuitBuilder& builder, WitnessOrConstant<fr> a, WitnessOrConstant<fr> b, uint32_t result);

void and_gate(UltraCircuitBuilder& builder, WitnessOrConstant<fr> a, WitnessOrConstant<fr> b, uint32_t result);
} // namespace acir_format
