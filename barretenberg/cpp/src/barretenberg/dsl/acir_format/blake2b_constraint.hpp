// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Blake2bInput {
    WitnessOrConstant<bb::fr> blackbox_input;
    uint32_t num_bits;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(blackbox_input, num_bits);
    friend bool operator==(Blake2bInput const& lhs, Blake2bInput const& rhs) = default;
};

struct Blake2bConstraint {
    std::vector<Blake2bInput> inputs;
    std::array<uint32_t, 64> result;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(inputs, result);
    friend bool operator==(Blake2bConstraint const& lhs, Blake2bConstraint const& rhs) = default;
};

template <typename Builder> void create_blake2b_constraints(Builder& builder, const Blake2bConstraint& constraint);

} // namespace acir_format