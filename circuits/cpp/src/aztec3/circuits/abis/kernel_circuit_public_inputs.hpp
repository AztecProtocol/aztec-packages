#pragma once
#include "combined_accumulated_data.hpp"
#include "combined_constant_data.hpp"

#include <aztec3/utils/msgpack_derived_equals.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/serialize/msgpack.hpp>
#include <barretenberg/stdlib/primitives/witness/witness.hpp>

namespace aztec3::circuits::abis {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using plonk::stdlib::witness_t;
using std::conditional;
using std::is_same;

template <typename NCT> struct KernelCircuitPublicInputs {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    CombinedAccumulatedData<NCT> end{};
    CombinedConstantData<NCT> constants{};

    boolean is_private = true;  // TODO: might need to instantiate from witness!

    // for serialization, update with new fields
    MSGPACK_FIELDS(end, constants, is_private);

    boolean operator==(KernelCircuitPublicInputs<NCT> const& other) const
    {
        return utils::msgpack_derived_equals<boolean>(*this, other);
    };

    template <typename Composer>
    KernelCircuitPublicInputs<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the composer:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(composer, e); };

        KernelCircuitPublicInputs<CircuitTypes<Composer>> private_inputs = {
            end.to_circuit_type(composer),
            constants.to_circuit_type(composer),

            to_ct(is_private),
        };

        return private_inputs;
    };

    template <typename Composer> KernelCircuitPublicInputs<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Composer>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Composer>(e); };
        auto to_native_type = []<typename T>(T& e) { return e.template to_native_type<Composer>(); };

        KernelCircuitPublicInputs<NativeTypes> pis = {
            to_native_type(end),
            to_native_type(constants),

            to_nt(is_private),
        };

        return pis;
    };

    void set_public()
    {
        static_assert(!(std::is_same<NativeTypes, NCT>::value));

        end.set_public();
        constants.set_public();

        fr(is_private).set_public();
    }
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, KernelCircuitPublicInputs<NCT> const& public_inputs)
{
    return os << "end:\n"
              << public_inputs.end << "\n"
              << "constants:\n"
              << public_inputs.constants << "\n"
              << "is_private: " << public_inputs.is_private << "\n";
}

}  // namespace aztec3::circuits::abis