#pragma once
#include "combined_accumulated_data.hpp"
#include "combined_constant_data.hpp"

#include "aztec3/utils/types/circuit_types.hpp"
#include "aztec3/utils/types/convert.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct PrivateKernelPublicInputs {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    CombinedAccumulatedData<NCT> end{};
    CombinedConstantData<NCT> constants{};

    // for serialization, update with new fields
    MSGPACK_FIELDS(end, constants);

    boolean operator==(PrivateKernelPublicInputs<NCT> const& other) const
    {
        return msgpack_derived_equals<boolean>(*this, other);
    };

    template <typename Builder> PrivateKernelPublicInputs<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        PrivateKernelPublicInputs<CircuitTypes<Builder>> private_inputs = {
            end.to_circuit_type(builder),
            constants.to_circuit_type(builder),
        };

        return private_inputs;
    };

    template <typename Builder> PrivateKernelPublicInputs<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Builder>, NCT>::value);
        auto to_native_type = []<typename T>(T& e) { return e.template to_native_type<Builder>(); };

        PrivateKernelPublicInputs<NativeTypes> pis = {
            to_native_type(end),
            to_native_type(constants),
        };

        return pis;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        end.set_public();
        constants.set_public();
    }
};

}  // namespace aztec3::circuits::abis
