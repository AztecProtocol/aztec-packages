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
        return end == other.end && constants == other.constants && is_private == other.is_private;
    };

    template <typename Builder> KernelCircuitPublicInputs<CircuitTypes<Builder>> to_circuit_type(Builder& builder) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        // Capture the circuit builder:
        auto to_ct = [&](auto& e) { return aztec3::utils::types::to_ct(builder, e); };

        KernelCircuitPublicInputs<CircuitTypes<Builder>> private_inputs = {
            end.to_circuit_type(builder),
            constants.to_circuit_type(builder),

            to_ct(is_private),
        };

        return private_inputs;
    };

    template <typename Builder> KernelCircuitPublicInputs<NativeTypes> to_native_type() const
    {
        static_assert(std::is_same<CircuitTypes<Builder>, NCT>::value);
        auto to_nt = [&](auto& e) { return aztec3::utils::types::to_nt<Builder>(e); };
        auto to_native_type = []<typename T>(T& e) { return e.template to_native_type<Builder>(); };

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

template <typename NCT> void read(uint8_t const*& it, KernelCircuitPublicInputs<NCT>& public_inputs)
{
    using serialize::read;

    read(it, public_inputs.end);
    read(it, public_inputs.constants);
    read(it, public_inputs.is_private);
};

template <typename NCT> void write(std::vector<uint8_t>& buf, KernelCircuitPublicInputs<NCT> const& public_inputs)
{
    using serialize::write;

    write(buf, public_inputs.end);
    write(buf, public_inputs.constants);
    write(buf, public_inputs.is_private);
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