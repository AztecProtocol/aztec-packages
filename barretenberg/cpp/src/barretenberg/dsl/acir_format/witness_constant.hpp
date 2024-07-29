#pragma once
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace acir_format {
template <typename FF> struct WitnessConstant {

    uint32_t index;
    FF value;
    bool is_constant;
    MSGPACK_FIELDS(index, value, is_constant);
    friend bool operator==(WitnessConstant const& lhs, WitnessConstant const& rhs) = default;
    static WitnessConstant from_index(uint32_t index)
    {
        return WitnessConstant{
            .index = index,
            .value = FF::zero(),
            .is_constant = false,
        };
    }
};

template <typename Builder, typename FF>
bb::stdlib::field_t<Builder> to_field_ct(const WitnessConstant<FF>& input, Builder& builder)
{
    using field_ct = bb::stdlib::field_t<Builder>;
    if (input.is_constant) {
        return field_ct(input.value);
    }
    return field_ct::from_witness_index(&builder, input.index);
}

} // namespace acir_format