#pragma once

#include "private_call_data.hpp"
#include "../combined_accumulated_data.hpp"
#include "../previous_kernel_data.hpp"
#include "../signed_tx_request.hpp"

#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/stdlib/primitives/witness/witness.hpp>

namespace aztec3::circuits::abis::private_kernel {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct PrivateInputs {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    SignedTxRequest<NCT> signed_tx_request{};
    PreviousKernelData<NCT> previous_kernel{};
    PrivateCallData<NCT> private_call{};

    // for serialization, update with new fields
    MSGPACK_FIELDS(signed_tx_request, previous_kernel, private_call);
    boolean operator==(PrivateInputs<NCT> const& other) const
    {
        return signed_tx_request == other.signed_tx_request && previous_kernel == other.previous_kernel &&
               private_call == other.private_call;
    };

    template <typename Composer> PrivateInputs<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        PrivateInputs<CircuitTypes<Composer>> private_inputs = {
            // TODO to_ct(signature),
            signed_tx_request.to_circuit_type(composer),
            previous_kernel.to_circuit_type(composer),
            private_call.to_circuit_type(composer),
        };

        return private_inputs;
    };
};

template <typename NCT> std::ostream& operator<<(std::ostream& os, PrivateInputs<NCT> const& private_inputs)
{
    return os << "signed_tx_request:\n"
              << private_inputs.signed_tx_request << "\n"
              << "previous_kernel:\n"
              << private_inputs.previous_kernel << "\n"
              << "private_call:\n"
              << private_inputs.private_call << "\n";
}

}  // namespace aztec3::circuits::abis::private_kernel