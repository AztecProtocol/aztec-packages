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
