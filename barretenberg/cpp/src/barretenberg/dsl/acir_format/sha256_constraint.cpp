// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "sha256_constraint.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "round.hpp"

namespace acir_format {

template <typename Builder>
void create_sha256_compression_constraints(Builder& builder, const Sha256Compression& constraint)
{
    using field_ct = bb::stdlib::field_t<Builder>;

    std::array<field_ct, 16> inputs;
    std::array<field_ct, 8> hash_inputs;

    // Get the witness assignment for each witness index
    // Note that we do not range-check the inputs, which should be 32 bits,
    // because of the lookup-tables.
    size_t i = 0;
    for (const auto& witness_index_num_bits : constraint.inputs) {
        inputs[i] = to_field_ct(witness_index_num_bits, builder);
        ++i;
    }
    i = 0;
    for (const auto& witness_index_num_bits : constraint.hash_values) {
        hash_inputs[i] = to_field_ct(witness_index_num_bits, builder);
        ++i;
    }

    // Compute sha256 compression
    auto output_bytes = bb::stdlib::SHA256<Builder>::sha256_block(hash_inputs, inputs);

    // Constrain outputs to match expected witness indices
    for (size_t i = 0; i < 8; ++i) {
        field_ct result_witness = field_ct::from_witness_index(&builder, constraint.result[i]);
        output_bytes[i].assert_equal(result_witness);
    }
}

template void create_sha256_compression_constraints<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                             const Sha256Compression& constraint);
template void create_sha256_compression_constraints<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                                            const Sha256Compression& constraint);

} // namespace acir_format
