#pragma once

#include "public_call_data.hpp"
#include "../previous_kernel_data.hpp"
#include "../signed_tx_request.hpp"

#include "aztec3/circuits/abis/combined_historic_tree_roots.hpp"
#include <aztec3/utils/msgpack_derived_equals.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/convert.hpp>
#include <aztec3/utils/types/native_types.hpp>

#include <barretenberg/serialize/msgpack.hpp>
#include <barretenberg/stdlib/primitives/witness/witness.hpp>

namespace aztec3::circuits::abis::public_kernel {

using aztec3::utils::types::CircuitTypes;
using aztec3::utils::types::NativeTypes;
using std::is_same;

template <typename NCT> struct PublicKernelInputsNoPreviousKernel {
    using fr = typename NCT::fr;
    using boolean = typename NCT::boolean;

    SignedTxRequest<NCT> signed_tx_request{};
    PublicCallData<NCT> public_call{};
    CombinedHistoricTreeRoots<NCT> historic_tree_roots{};

    // for serialization, update with new fields
    MSGPACK_FIELDS(signed_tx_request, public_call, historic_tree_roots);
    boolean operator==(PublicKernelInputsNoPreviousKernel<NCT> const& other) const
    {
        return utils::msgpack_derived_equals<boolean>(*this, other);
    };

    template <typename Composer>
    PublicKernelInputsNoPreviousKernel<CircuitTypes<Composer>> to_circuit_type(Composer& composer) const
    {
        static_assert((std::is_same<NativeTypes, NCT>::value));

        PublicKernelInputsNoPreviousKernel<CircuitTypes<Composer>> public_kernel_inputs = {
            // TODO to_ct(signature),
            signed_tx_request.to_circuit_type(composer),
            public_call.to_circuit_type(composer),
            historic_tree_roots.to_circuit_type(composer)
        };

        return public_kernel_inputs;
    };
};

template <typename NCT>
std::ostream& operator<<(std::ostream& os, PublicKernelInputsNoPreviousKernel<NCT> const& public_kernel_inputs)
{
    return os << "signed_tx_request:\n"
              << public_kernel_inputs.signed_tx_request << "\n"
              << "public_call:\n"
              << public_kernel_inputs.public_call << "\n"
              << "historic_tree_roots:\n"
              << public_kernel_inputs.historic_tree_roots << "\n";
}

}  // namespace aztec3::circuits::abis::public_kernel