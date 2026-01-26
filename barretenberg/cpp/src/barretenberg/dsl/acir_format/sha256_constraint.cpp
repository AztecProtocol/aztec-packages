// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "sha256_constraint.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"

namespace acir_format {

template <typename Builder>
void create_sha256_compression_constraints(Builder& builder, const Sha256Compression& constraint)
{
    using field_ct = bb::stdlib::field_t<Builder>;

    std::array<field_ct, 8> hash_inputs; // previous  (or initial) hash state
    std::array<field_ct, 16> inputs;     // message block to compress

    field_ct test = field_ct::from_witness(&builder, bb::fr::one());
    test = test * test;

    // Get the witness assignment for each witness index.
    // It is assumed that the caller (Noir) separately constrains all 24 inputs (8 hash state + 16 message words) to 32
    // bits, e.g. via instantiating them as u32 types.
    for (auto [input, witness_or_constant] : zip_view(inputs, constraint.inputs)) {
        input = to_field_ct(witness_or_constant, builder);
    }
    for (auto [hash_input, witness_or_constant] : zip_view(hash_inputs, constraint.hash_values)) {
        hash_input = to_field_ct(witness_or_constant, builder);
    }

    // Compute sha256 compression
    std::array<field_ct, 8> output_state = bb::stdlib::SHA256<Builder>::sha256_block(hash_inputs, inputs);

    // Constrain outputs to match expected witness indices
    for (auto [output, result_idx] : zip_view(output_state, constraint.result)) {
        field_ct result_witness = field_ct::from_witness_index(&builder, result_idx);
        output.assert_equal(result_witness);
    }
}

template void create_sha256_compression_constraints<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                             const Sha256Compression& constraint);
template void create_sha256_compression_constraints<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                                            const Sha256Compression& constraint);

} // namespace acir_format
