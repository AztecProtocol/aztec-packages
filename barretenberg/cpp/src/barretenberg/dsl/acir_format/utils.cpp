// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: d4aff8893338c31425565db5a5a560048c33f27a}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
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

template <typename Builder>
void assign_g1_element_to_outputs(Builder& builder,
                                  const typename stdlib::bn254<Builder>::Group& element,
                                  const std::vector<uint32_t>& output_indices)
{
    // A G1 element in bigfield format requires 8 field elements: 4 for x, 4 for y
    constexpr size_t NUM_LIMBS_PER_COORD = 4;
    constexpr size_t EXPECTED_OUTPUTS = 2 * NUM_LIMBS_PER_COORD; // 8
    BB_ASSERT_EQ(output_indices.size(), EXPECTED_OUTPUTS, "assign_g1_element_to_outputs: expected 8 output indices");

    // Extract the x and y coordinates
    const auto& x = element.x();
    const auto& y = element.y();

    // Create field_t elements from the output witness indices
    std::array<field_t<Builder>, EXPECTED_OUTPUTS> output_fields;
    for (size_t i = 0; i < EXPECTED_OUTPUTS; ++i) {
        output_fields[i] = field_t<Builder>::from_witness_index(&builder, output_indices[i]);
    }

    // Handle the different internal representations based on Builder type
    if constexpr (std::is_same_v<Builder, MegaCircuitBuilder>) {
        // For MegaCircuitBuilder, coordinates are goblin_field with 2 limbs (136-bit each)
        // Convert to 4 68-bit limbs to match public inputs representation
        using BigFq = stdlib::bigfield<Builder, bb::fq::Params>;

        // Convert x coordinate: goblin_field -> bigfield
        BigFq x_bigfield(x.limbs[0], x.limbs[1]);
        for (size_t i = 0; i < NUM_LIMBS_PER_COORD; ++i) {
            x_bigfield.binary_basis_limbs[i].element.assert_equal(output_fields[i]);
        }

        // Convert y coordinate: goblin_field -> bigfield
        BigFq y_bigfield(y.limbs[0], y.limbs[1]);
        for (size_t i = 0; i < NUM_LIMBS_PER_COORD; ++i) {
            y_bigfield.binary_basis_limbs[i].element.assert_equal(output_fields[NUM_LIMBS_PER_COORD + i]);
        }
    } else {
        // For UltraCircuitBuilder, coordinates are bigfield with 4 limbs directly
        for (size_t i = 0; i < NUM_LIMBS_PER_COORD; ++i) {
            x.binary_basis_limbs[i].element.assert_equal(output_fields[i]);
        }
        for (size_t i = 0; i < NUM_LIMBS_PER_COORD; ++i) {
            y.binary_basis_limbs[i].element.assert_equal(output_fields[NUM_LIMBS_PER_COORD + i]);
        }
    }
}

template <typename Builder>
void assign_default_g1_to_outputs(Builder& builder, const std::vector<uint32_t>& output_indices)
{
    constexpr size_t EXPECTED_OUTPUTS = 8;
    BB_ASSERT_EQ(output_indices.size(), EXPECTED_OUTPUTS, "assign_default_g1_to_outputs: expected 8 output indices");

    // Assign zero to all output witnesses
    for (const auto& idx : output_indices) {
        field_t<Builder> output_field = field_t<Builder>::from_witness_index(&builder, idx);
        field_t<Builder> zero = field_t<Builder>::from_witness(&builder, bb::fr::zero());
        output_field.assert_equal(zero);
    }
}

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

template void assign_g1_element_to_outputs<UltraCircuitBuilder>(
    UltraCircuitBuilder&, const typename stdlib::bn254<UltraCircuitBuilder>::Group&, const std::vector<uint32_t>&);
template void assign_g1_element_to_outputs<MegaCircuitBuilder>(MegaCircuitBuilder&,
                                                               const typename stdlib::bn254<MegaCircuitBuilder>::Group&,
                                                               const std::vector<uint32_t>&);

template void assign_default_g1_to_outputs<UltraCircuitBuilder>(UltraCircuitBuilder&, const std::vector<uint32_t>&);
template void assign_default_g1_to_outputs<MegaCircuitBuilder>(MegaCircuitBuilder&, const std::vector<uint32_t>&);

} // namespace acir_format
