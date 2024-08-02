#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Sha256Input {
    uint32_t witness;
    uint32_t num_bits;

    friend bool operator==(Sha256Input const& lhs, Sha256Input const& rhs) = default;
    // for serialization, update with any new fields
    MSGPACK_FIELDS(witness, num_bits);
};

struct Sha256Constraint {
    std::vector<Sha256Input> inputs;
    std::array<uint32_t, 32> result;

    friend bool operator==(Sha256Constraint const& lhs, Sha256Constraint const& rhs) = default;
    // for serialization, update with any new fields
    MSGPACK_FIELDS(inputs, result);
};

struct Sha256Compression {
    std::array<WitnessOrConstant<bb::fr>, 16> inputs;
    std::array<WitnessOrConstant<bb::fr>, 8> hash_values;
    std::array<uint32_t, 8> result;

    friend bool operator==(Sha256Compression const& lhs, Sha256Compression const& rhs) = default;
    // for serialization, update with any new fields
    MSGPACK_FIELDS(inputs, hash_values, result);
};

// This function does not work (properly) because the stdlib:sha256 function is not working correctly for 512 bits
// pair<witness_index, bits>
template <typename Builder> void create_sha256_constraints(Builder& builder, const Sha256Constraint& constraint);

template <typename Builder>
void create_sha256_compression_constraints(Builder& builder, const Sha256Compression& constraint);

} // namespace acir_format
