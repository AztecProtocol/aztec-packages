#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Blake3Constraint {
    std::vector<WitnessOrConstant<bb::fr>> inputs;
    std::array<uint32_t, 32> result;

    friend bool operator==(Blake3Constraint const& lhs, Blake3Constraint const& rhs) = default;
};

template <typename Builder> void create_blake3_constraints(Builder& builder, const Blake3Constraint& constraint);

} // namespace acir_format
