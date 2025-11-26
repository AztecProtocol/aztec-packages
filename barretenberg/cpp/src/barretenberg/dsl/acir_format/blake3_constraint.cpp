// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "blake3_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "round.hpp"

namespace acir_format {

template <typename Builder> void create_blake3_constraints(Builder& builder, const Blake3Constraint& constraint)
{
    using byte_array_ct = bb::stdlib::byte_array<Builder>;
    using field_ct = bb::stdlib::field_t<Builder>;

    // Build input byte array by appending constrained byte_arrays
    byte_array_ct arr = byte_array_ct::constant_padding(&builder, 0); // Start with empty array

    for (const auto& witness_index_num_bits : constraint.inputs) {
        auto witness_index = witness_index_num_bits.blackbox_input;
        auto num_bits = witness_index_num_bits.num_bits;

        // XXX: The implementation requires us to truncate the element to the nearest byte and not bit
        auto num_bytes = round_to_nearest_byte(num_bits);
        BB_ASSERT_LTE(num_bytes, 1024U, "barretenberg does not support blake3 inputs with more than 1024 bytes");
        field_ct element = to_field_ct(witness_index, builder);

        // byte_array_ct(field, num_bytes) constructor adds range constraints for each byte
        byte_array_ct element_bytes(element, num_bytes);

        // Safe write: both arr and element_bytes are constrained
        arr.write(element_bytes);
    }

    byte_array_ct output_bytes = bb::stdlib::Blake3s<Builder>::hash(arr);

    // Convert byte array to vector of field_t

    for (size_t i = 0; i < output_bytes.size(); ++i) {
        output_bytes[i].assert_equal(field_ct::from_witness_index(&builder, constraint.result[i]));
    }
}

template void create_blake3_constraints<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                 const Blake3Constraint& constraint);
template void create_blake3_constraints<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                                const Blake3Constraint& constraint);

} // namespace acir_format
