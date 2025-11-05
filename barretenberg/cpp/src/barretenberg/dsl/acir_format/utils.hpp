// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_format_mocks.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Generate builder variables from witness indices. This function is useful when receiving the indices of the
 * witness from ACIR.
 *
 * @tparam Builder
 * @param builder
 * @param witness_indices
 * @return std::vector<stdlib::field_t<Builder>>
 */
template <typename Builder>
static std::vector<field_t<Builder>> fields_from_witnesses(Builder& builder, std::span<const uint32_t> witness_indices)
{
    std::vector<field_t<Builder>> result;
    result.reserve(witness_indices.size());
    for (const auto& idx : witness_indices) {
        result.emplace_back(field_t<Builder>::from_witness_index(&builder, idx));
    }
    return result;
}

/**
 * @brief Convert a vector of field_t elements to a byte_array enforcing each element to be a boolean
 *
 * @tparam Builder
 * @param builder
 * @param fields
 * @return byte_array<Builder>
 */
template <typename Builder> byte_array<Builder> fields_to_bytes(Builder& builder, std::vector<field_t<Builder>>& fields)
{
    byte_array<Builder> result(&builder);
    for (auto& field : fields) {
        // Construct byte array of length 1 from the field element
        // The constructor enforces that `field` fits in one byte
        byte_array<Builder> byte_to_append(field, /*num_bytes=*/1);
        // Append the new byte to the result
        result.write(byte_to_append);
    }

    return result;
};

/**
 * @brief Append values to a witness vector and track their indices.
 *
 * @details This function is useful in mocking situations, when we need to add dummy variables to a builder.
 * @tparam T The input type
 * @param witness The witness vector to append to
 * @param input The input value(s) - either a span of values or a single special type
 * @return std::vector<uint32_t> The witness indices of the appended values
 */
template <typename T> std::vector<uint32_t> add_to_witness_and_track_indices(WitnessVector& witness, const T& input)
{
    std::vector<uint32_t> indices;

    if constexpr (std::is_same_v<T, bb::grumpkin::g1::affine_element>) {
        indices.emplace_back(witness.size());
        witness.emplace_back(input.x);
        indices.emplace_back(witness.size());
        witness.emplace_back(input.y);
        indices.emplace_back(witness.size());
        witness.emplace_back(input.is_point_at_infinity() ? bb::fr(1) : bb::fr(0));
    } else {
        // If no other type is matched, we assume T is a span of values
        indices.reserve(input.size());
        auto witness_idx = static_cast<uint32_t>(witness.size());
        for (const auto& value : input) {
            witness.push_back(bb::fr(value));
            indices.push_back(witness_idx++);
        }
    }

    return indices;
};

/**
 * @brief Add a single value to the witness vector and track its index.
 */
inline uint32_t add_to_witness_and_track_indices(WitnessVector& witness, const bb::fr& input)
{
    uint32_t index = static_cast<uint32_t>(witness.size());
    witness.emplace_back(input);

    return index;
}

/**
 * @brief Add a span of values to the witness and track their indices, returning them as a fixed-size array.
 */
template <typename T, size_t N>
std::array<uint32_t, N> add_to_witness_and_track_indices(WitnessVector& witness, const T& input)
{
    std::vector<uint32_t> tracked_indices = add_to_witness_and_track_indices(witness, input);
    std::array<uint32_t, N> indices;
    std::ranges::copy(tracked_indices, indices.begin());
    return indices;
};

/**
 * @brief Populate fields in the builder with the given values. To be used in mocking situations.
 *
 */
template <typename Builder>
void populate_fields(Builder& builder, const std::vector<field_t<Builder>>& fields, const std::vector<bb::fr>& values)
{
    for (auto [field, value] : zip_view(fields, values)) {
        builder.set_variable(field.get_witness_index(), value);
    }
};

} // namespace acir_format
