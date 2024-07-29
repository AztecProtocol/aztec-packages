#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct HashInput {
    uint32_t witness;
    uint32_t num_bits;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(witness, num_bits);
    friend bool operator==(HashInput const& lhs, HashInput const& rhs) = default;
};

struct Keccakf1600 {
    std::array<WitnessOrConstant<bb::fr>, 25> state;
    std::array<uint32_t, 25> result;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(state, result);
    friend bool operator==(Keccakf1600 const& lhs, Keccakf1600 const& rhs) = default;
};

struct KeccakConstraint {
    std::vector<HashInput> inputs;
    std::array<uint32_t, 32> result;
    uint32_t var_message_size;

    // For serialization, update with any new fields
    MSGPACK_FIELDS(inputs, result, var_message_size);
    friend bool operator==(KeccakConstraint const& lhs, KeccakConstraint const& rhs) = default;
};

template <typename Builder> void create_keccak_constraints(Builder& builder, const KeccakConstraint& constraint);
template <typename Builder> void create_keccak_permutations(Builder& builder, const Keccakf1600& constraint);

} // namespace acir_format
