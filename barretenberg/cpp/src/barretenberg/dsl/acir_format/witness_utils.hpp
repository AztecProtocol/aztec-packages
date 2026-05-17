#pragma once

#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <cstdint>
#include <span>
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

template <typename Builder>
std::vector<field_t<Builder>> fields_from_witnesses(Builder& builder, std::span<const uint32_t> witness_indices);

template <typename Builder>
byte_array<Builder> fields_to_bytes(Builder& builder, std::vector<field_t<Builder>>& fields);

std::vector<uint32_t> add_public_inputs_to_proof(const std::vector<uint32_t>& proof_in,
                                                 const std::vector<uint32_t>& public_inputs);

template <typename Builder>
void populate_fields(Builder& builder, const std::vector<field_t<Builder>>& fields, const std::vector<bb::fr>& values);

} // namespace acir_format
