// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

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
static std::vector<stdlib::field_t<Builder>> fields_from_witnesses(Builder& builder,
                                                                   std::span<const uint32_t> witness_indices)
{
    std::vector<stdlib::field_t<Builder>> result;
    result.reserve(witness_indices.size());
    for (const auto& idx : witness_indices) {
        result.emplace_back(stdlib::field_t<Builder>::from_witness_index(&builder, idx));
    }
    return result;
}

/**
 * @brief Append values to a witness vector and track their indices.
 *
 * @details This function is useful in mocking situations, when we need to add dummy variables to a builder.
 * @tparam T
 * @param witness
 * @param input
 * @return std::vector<uint32_t>
 */
template <typename T>
std::vector<uint32_t> add_to_witness_and_track_indices(WitnessVector& witness, std::span<const T> input)
{
    std::vector<uint32_t> indices;
    indices.reserve(input.size());
    auto witness_idx = static_cast<uint32_t>(witness.size());
    for (const auto& value : input) {
        witness.push_back(bb::fr(value));
        indices.push_back(witness_idx++);
    }
    return indices;
};

/**
 * @brief Append values to a witness vector and track their indices.
 *
 * @details This function is useful in mocking situations, when we need to add dummy variables to a builder.
 *
 * @tparam T
 * @tparam N
 * @param witness
 * @param input
 * @return std::array<uint32_t, N>
 */
template <typename T, std::size_t N>
std::array<uint32_t, N> add_to_witness_and_track_indices(WitnessVector& witness, std::span<const T> input)
{
    std::array<uint32_t, N> indices;
    auto witness_idx = static_cast<uint32_t>(witness.size());
    size_t idx = 0;
    for (const auto& value : input) {
        witness.push_back(bb::fr(value));
        indices[idx++] = witness_idx++;
    }
    return indices;
};

} // namespace acir_format
