#include "logic_constraint.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"

namespace acir_format {

template <typename Builder>
void create_logic_gate(Builder& builder,
                       const WitnessOrConstant<bb::fr> a,
                       const WitnessOrConstant<bb::fr> b,
                       const uint32_t result,
                       const size_t num_bits,
                       const bool is_xor_gate)
{
    using field_ct = bb::stdlib::field_t<Builder>;

    field_ct left = to_field_ct(a, builder);
    field_ct right = to_field_ct(b, builder);

    field_ct computed_result = bb::stdlib::logic<Builder>::create_logic_constraint(left, right, num_bits, is_xor_gate);

    // In write-VK mode the result witness holds a dummy zero. In certain cases, the computed result is non-zero so the
    // assert_equal would spuriously fail. Patch the witness value so the downstream assertion sees the correct value.
    // Eg. for an XOR gate, if the inputs are constants such that the result is a non-zero constant, the assert_equal
    // will fail in write-VK mode since the result witness is initialized to zero.
    if (builder.is_write_vk_mode()) {
        builder.set_variable(result, computed_result.get_value());
    }

    field_ct acir_result = field_ct::from_witness_index(&builder, result);
    computed_result.assert_equal(acir_result);
}

// Plookup-backed: only the arithmetizations that keep the lookup gate.
#define INSTANTIATE_CREATE_LOGIC_GATE(Builder)                                                                         \
    template void create_logic_gate<Builder>(Builder&,                                                                 \
                                             const WitnessOrConstant<bb::fr>,                                          \
                                             const WitnessOrConstant<bb::fr>,                                          \
                                             const uint32_t,                                                           \
                                             const size_t,                                                             \
                                             const bool);
INSTANTIATE_FOR_EACH_MEGA_BUILDER_WITH_LOOKUP(INSTANTIATE_CREATE_LOGIC_GATE)
#undef INSTANTIATE_CREATE_LOGIC_GATE
template void create_logic_gate<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                         const WitnessOrConstant<bb::fr> a,
                                                         const WitnessOrConstant<bb::fr> b,
                                                         const uint32_t result,
                                                         const size_t num_bits,
                                                         const bool is_xor_gate);

} // namespace acir_format
