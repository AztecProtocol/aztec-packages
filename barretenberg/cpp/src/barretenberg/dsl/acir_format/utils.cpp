// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/dsl/acir_format/utils.hpp"
#include <vector>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

template <typename Builder>
std::vector<field_t<Builder>> fields_from_witnesses(Builder& builder, std::span<const uint32_t> witness_indices)
{
    std::vector<field_t<Builder>> result;
    result.reserve(witness_indices.size());
    for (const auto& idx : witness_indices) {
        result.emplace_back(field_t<Builder>::from_witness_index(&builder, idx));
    }
    return result;
}

template <typename Builder> byte_array<Builder> fields_to_bytes(Builder& builder, std::vector<field_t<Builder>>& fields)
{
    byte_array<Builder> result = byte_array<Builder>::constant_padding(&builder, /*length*/ 0);
    for (auto& field : fields) {
        // Construct byte array of length 1 from the field element
        // The constructor enforces that `field` fits in one byte
        byte_array<Builder> byte_to_append(field, /*num_bytes=*/1);
        // Append the new byte to the result
        result.write(byte_to_append);
    }

    return result;
}

std::vector<uint32_t> add_public_inputs_to_proof(const std::vector<uint32_t>& proof_in,
                                                 const std::vector<uint32_t>& public_inputs)
{
    std::vector<uint32_t> proof;
    proof.reserve(proof_in.size() + public_inputs.size());

    // Construct the complete proof as the concatenation {public_inputs | proof_in}
    proof.insert(proof.end(), public_inputs.begin(), public_inputs.end());
    proof.insert(proof.end(), proof_in.begin(), proof_in.end());

    return proof;
}

RecursionConstraint recursion_data_to_recursion_constraint(std::vector<bb::fr>& witness,
                                                           const std::vector<bb::fr>& proof,
                                                           const std::vector<bb::fr>& key,
                                                           const bb::fr& key_hash,
                                                           const bb::fr& predicate,
                                                           const size_t num_public_inputs_to_extract,
                                                           const uint32_t proof_type)
{
    // Slice the proof extracting all public inputs except for those corresponding to the aggregation object
    std::vector<bb::fr> public_inputs(proof.begin(),
                                      proof.begin() + static_cast<ptrdiff_t>(num_public_inputs_to_extract));
    std::vector<bb::fr> proof_without_public_inputs(
        proof.begin() + static_cast<ptrdiff_t>(num_public_inputs_to_extract), proof.end());

    return RecursionConstraint{
        .key = add_to_witness_and_track_indices(witness, key),
        .proof = add_to_witness_and_track_indices(witness, proof_without_public_inputs),
        .public_inputs = add_to_witness_and_track_indices(witness, public_inputs),
        .key_hash = add_to_witness_and_track_indices(witness, key_hash),
        .proof_type = proof_type,
        .predicate = WitnessOrConstant<bb::fr>::from_index(add_to_witness_and_track_indices(witness, predicate)),
    };
}

template <typename Builder>
void populate_fields(Builder& builder, const std::vector<field_t<Builder>>& fields, const std::vector<bb::fr>& values)
{
    for (const auto [field, value] : zip_view(fields, values)) {
        builder.set_variable(field.get_witness_index(), value);
    }
};

// Explicit template instantiations
template std::vector<field_t<UltraCircuitBuilder>> fields_from_witnesses<UltraCircuitBuilder>(
    UltraCircuitBuilder&, std::span<const uint32_t>);
template std::vector<field_t<MegaCircuitBuilder>> fields_from_witnesses<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                                                            std::span<const uint32_t>);

template byte_array<UltraCircuitBuilder> fields_to_bytes<UltraCircuitBuilder>(
    UltraCircuitBuilder&, std::vector<field_t<UltraCircuitBuilder>>&);
template byte_array<MegaCircuitBuilder> fields_to_bytes<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                                            std::vector<field_t<MegaCircuitBuilder>>&);

template void populate_fields<UltraCircuitBuilder>(UltraCircuitBuilder&,
                                                   const std::vector<field_t<UltraCircuitBuilder>>&,
                                                   const std::vector<bb::fr>&);
template void populate_fields<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                  const std::vector<field_t<MegaCircuitBuilder>>&,
                                                  const std::vector<bb::fr>&);
} // namespace acir_format
