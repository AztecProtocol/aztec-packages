#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Blake3Input {
    WitnessOrConstant<bb::fr> blackbox_input;
    uint32_t num_bits;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(blackbox_input, num_bits);
    friend bool operator==(Blake3Input const& lhs, Blake3Input const& rhs) = default;
};

struct Blake3Constraint {
    std::vector<Blake3Input> inputs;
    std::array<uint32_t, 32> result;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(inputs, result);
    friend bool operator==(Blake3Constraint const& lhs, Blake3Constraint const& rhs) = default;
};

template <typename Builder> void create_blake3_constraints(Builder& builder, const Blake3Constraint& constraint);

} // namespace acir_format
