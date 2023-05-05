#pragma once
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include <aztec3/utils/dummy_composer.hpp>
#include <aztec3/utils/types/circuit_types.hpp>
#include <aztec3/utils/types/native_types.hpp>

namespace aztec3::circuits::mock {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using NT = aztec3::utils::types::NativeTypes;
using DummyComposer = aztec3::utils::DummyComposer;

KernelCircuitPublicInputs<NT> native_mock_kernel_circuit(DummyComposer&,
                                                         KernelCircuitPublicInputs<NT> const& public_inputs)
{
    {
        // 16 is the number of values added to `proof_witness_indices` at the end of `verify_proof`.
        constexpr uint32_t num_witness_indices = 16;
        for (uint32_t i = 0; i < num_witness_indices; ++i) {
            public_inputs.end.aggregation_object.proof_witness_indices.push_back(i);
        }
    }
    public_inputs.set_public();

    return public_inputs;
}

}  // namespace aztec3::circuits::mock
