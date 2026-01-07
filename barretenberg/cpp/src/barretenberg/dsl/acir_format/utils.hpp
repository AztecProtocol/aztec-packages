// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/// ========== ACIR TO BARRETENBERG ========== ///

/// The functions below are helpers for constructing in-circuit representations of the witnesses passed from ACIR to
/// barretenberg

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
std::vector<field_t<Builder>> fields_from_witnesses(Builder& builder, std::span<const uint32_t> witness_indices);

/**
 * @brief Convert a vector of field_t elements to a byte_array enforcing each element to be a boolean
 *
 * @tparam Builder
 * @param builder
 * @param fields
 * @return byte_array<Builder>
 */
template <typename Builder>
byte_array<Builder> fields_to_bytes(Builder& builder, std::vector<field_t<Builder>>& fields);

/**
 * @brief Reconstruct a barretenberg style proof from an ACIR style proof + public inputs
 *
 * @details In barretenberg, proofs start with the public inputs. ACIR represents proofs in the format
 * (public_inputs, proof_without_public_inputs). This function stitches together the indices of the public inputs
 * with those of the proof to transform ACIR-style proofs into barretenberg-style proofs.
 *
 * @param proof_in A proof stripped of its public inputs
 * @param public_inputs The public inputs to be reinserted into the proof
 * @return std::vector<uint32_t> The witness indices of the complete proof
 */
std::vector<uint32_t> add_public_inputs_to_proof(const std::vector<uint32_t>& proof_in,
                                                 const std::vector<uint32_t>& public_inputs);

/// ========== TESTING UTILITIES ========== ///

/// The functions below are helpers for handling witnesses in testing situations

/**
 * @brief Given recursion data (proof, key, key hash, predicate and the number of public inputs) and a proof type,
 * populate a witness vector with these values and return the associated recursion constraint.
 *
 * @details The proof is assumed to be barretenberg-style: containing all the public inputs at its start. The variable
 * num_public_inputs_to_extract is used to extract the ACIR-style public inputs.
 *
 */
RecursionConstraint recursion_data_to_recursion_constraint(std::vector<bb::fr>& witness,
                                                           const std::vector<bb::fr>& proof,
                                                           const std::vector<bb::fr>& key,
                                                           const bb::fr& key_hash,
                                                           const bb::fr& predicate,
                                                           const size_t num_public_inputs_to_extract,
                                                           const uint32_t proof_type);

/**
 * @brief Append values to a witness vector and track their indices.
 *
 * @details This function is useful in testing situations, when we need to add witnesses to a builder.
 * @tparam T The input type
 * @param witness The witness vector to append to
 * @param input The input value(s) - either a span of values or a single special type
 * @return std::vector<uint32_t> The witness indices of the appended values
 */
template <typename T>
std::vector<uint32_t> add_to_witness_and_track_indices(std::vector<bb::fr>& witness, const T& input)
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
}

/**
 * @brief Add a single value to the witness vector and track its index.
 */
inline uint32_t add_to_witness_and_track_indices(std::vector<bb::fr>& witness, const bb::fr& input)
{
    uint32_t index = static_cast<uint32_t>(witness.size());
    witness.emplace_back(input);

    return index;
}

/**
 * @brief Add a span of values to the witness and track their indices, returning them as a fixed-size array.
 */
template <typename T, size_t N>
std::array<uint32_t, N> add_to_witness_and_track_indices(std::vector<bb::fr>& witness, const T& input)
{
    std::vector<uint32_t> tracked_indices = add_to_witness_and_track_indices(witness, input);
    BB_ASSERT_LTE(tracked_indices.size(), N, "Number of witnesses added is greater than the size of the output array.");

    std::array<uint32_t, N> indices;
    std::ranges::copy(tracked_indices, indices.begin());
    return indices;
}

/// ========== WRITE_VK UTILITIES ========== ///

/// The functions below are helpers for write_vk situations

/**
 * @brief Populate fields in the builder with the given values.
 *
 */
template <typename Builder>
void populate_fields(Builder& builder, const std::vector<field_t<Builder>>& fields, const std::vector<bb::fr>& values);

} // namespace acir_format
