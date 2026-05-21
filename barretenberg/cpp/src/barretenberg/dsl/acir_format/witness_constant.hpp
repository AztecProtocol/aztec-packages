// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace acir_format {
template <typename FF> struct WitnessOrConstant {

    uint32_t index;
    FF value;
    bool is_constant;

    friend bool operator==(WitnessOrConstant const& lhs, WitnessOrConstant const& rhs) = default;
    static WitnessOrConstant from_index(uint32_t index)
    {
        return WitnessOrConstant{
            .index = index,
            .value = FF::zero(),
            .is_constant = false,
        };
    }

    static WitnessOrConstant from_constant(FF value)
    {
        return WitnessOrConstant{
            .index = bb::stdlib::IS_CONSTANT,
            .value = value,
            .is_constant = true,
        };
    }
};

template <typename Builder>
bb::stdlib::field_t<Builder> to_field_ct(const WitnessOrConstant<typename Builder::FF>& input, Builder& builder)
{
    using field_ct = bb::stdlib::field_t<Builder>;
    if (input.is_constant) {
        return field_ct(input.value);
    }
    return field_ct::from_witness_index(&builder, input.index);
}

template <typename Builder>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<typename Builder::FF>& input_x,
                                                   const WitnessOrConstant<typename Builder::FF>& input_y,
                                                   const bb::stdlib::bool_t<Builder>& predicate,
                                                   Builder& builder);

template <typename Builder>
typename bb::stdlib::cycle_group<Builder>::cycle_scalar to_grumpkin_scalar(
    const WitnessOrConstant<typename Builder::FF>& scalar_lo,
    const WitnessOrConstant<typename Builder::FF>& scalar_hi,
    const bb::stdlib::bool_t<Builder>& predicate,
    Builder& builder);

} // namespace acir_format
