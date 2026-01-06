// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "blake2s_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "round.hpp"

namespace acir_format {

using namespace bb;

template <typename Builder> void create_blake2s_constraints(Builder& builder, const Blake2sConstraint& constraint)
{
    using byte_array_ct = stdlib::byte_array<Builder>;
    using field_ct = stdlib::field_t<Builder>;

    // Build input byte array by appending constrained byte_arrays
    byte_array_ct arr = byte_array_ct::constant_padding(&builder, 0); // Start with empty array

    for (const auto& witness_index_num_bits : constraint.inputs) {
        auto witness_index = witness_index_num_bits.blackbox_input;
        auto num_bits = witness_index_num_bits.num_bits;

        // XXX: The implementation requires us to truncate the element to the nearest byte and not bit
        auto num_bytes = round_to_nearest_byte(num_bits);
        BB_ASSERT_LTE(num_bytes, 32U, "Input num_bytes exceeds 32 per element in blake2s");

        field_ct element = to_field_ct(witness_index, builder);

        // byte_array_ct(field, num_bytes) constructor adds range constraints for each byte
        byte_array_ct element_bytes(element, num_bytes);

        // Safe write: both arr and element_bytes are constrained
        arr.write(element_bytes);
    }

    byte_array_ct output_bytes = stdlib::Blake2s<Builder>::hash(arr);

    for (const auto& [output_byte, result_byte_idx] : zip_view(output_bytes.bytes(), constraint.result)) {
        // Constrain each output byte to equal the corresponding witness
        // This equality also constrains the result witnesses to be bytes
        output_byte.assert_equal(field_ct::from_witness_index(&builder, result_byte_idx));
    }
}

template void create_blake2s_constraints<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                              const Blake2sConstraint& constraint);
template void create_blake2s_constraints<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                             const Blake2sConstraint& constraint);

} // namespace acir_format
