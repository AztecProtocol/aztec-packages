// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 8fb8b041d4c9179f62da56a9c7bbf22c40db46cc}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "blake2s_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/stdlib/hash/blake2s/blake2s.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"

namespace acir_format {

using namespace bb;

template <typename Builder> void create_blake2s_constraints(Builder& builder, const Blake2sConstraint& constraint)
{
    using byte_array_ct = stdlib::byte_array<Builder>;
    using field_ct = stdlib::field_t<Builder>;

    // Build input byte array by appending constrained byte_arrays
    byte_array_ct arr = byte_array_ct::constant_padding(&builder, 0); // Start with empty array

    for (const auto& witness_index : constraint.inputs) {
        field_ct element = to_field_ct(witness_index, builder);

        // byte_array_ct(field, num_bytes) constructor adds range constraints for each byte. Note that num_bytes =
        // ceil(witness_index_num_bits.num_bits/8). Here, num_bits is set to 8 when constructing the vector of inputs in
        // the Blake2s constraint. Hence, we set num_bytes = 1.
        byte_array_ct element_bytes(element, 1);

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
