#pragma once
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

// Helper to create WitnessOrConstant from index
inline acir_format::WitnessOrConstant<bb::fr> witness_from_index(uint32_t idx)
{
    return acir_format::WitnessOrConstant<bb::fr>::from_index(idx);
}

// Helper to create WitnessOrConstant from constant value
inline acir_format::WitnessOrConstant<bb::fr> constant_from_value(uint8_t val)
{
    return acir_format::WitnessOrConstant<bb::fr>::from_constant(bb::fr(val));
}

// Helper to build AcirFormat from individual constraints through the full ACIR serde flow
template <typename... Constraints>
acir_format::AcirFormat build_acir_format(uint32_t max_witness_index, const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = acir_format::constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    (void)max_witness_index; // No longer needed by build_acir_circuit
    return acir_format::circuit_serde_to_acir_format(acir_format::build_acir_circuit(opcodes));
}
