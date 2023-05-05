#pragma once
#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/utils/dummy_composer.hpp"
#include "aztec3/utils/types/native_types.hpp"

namespace aztec3::circuits::mock {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using NT = aztec3::utils::types::NativeTypes;
using DummyComposer = aztec3::utils::DummyComposer;

KernelCircuitPublicInputs<NT> native_mock_kernel_circuit(DummyComposer& dummycomposer,
                                                         KernelCircuitPublicInputs<NT>& public_inputs);

}  // namespace aztec3::circuits::mock
