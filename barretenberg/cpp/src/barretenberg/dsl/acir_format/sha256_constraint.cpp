// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
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

    // Get the witness assignment for each witness index
    // AUDITTODO: We do not range-check the inputs here, assuming lookup tables in sha256_block
    // provide implicit 32-bit constraints. However, analysis shows this assumption is incomplete:
    // - inputs[0] is NEVER lookup-constrained
    // - hash_values[3] and hash_values[7] are used in arithmetic before being lookup-constrained
    // These values are only weakly bounded (~35 bits) by add_normalize overflow constraints.
    // See AUDITTODO in stdlib/hash/sha256/sha256.cpp for details and recommended fix.
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
