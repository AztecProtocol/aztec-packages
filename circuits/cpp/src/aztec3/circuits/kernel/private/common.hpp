#pragma once

#include "init.hpp"

#include "aztec3/circuits/abis/kernel_circuit_public_inputs.hpp"
#include "aztec3/circuits/abis/private_kernel/private_call_data.hpp"
#include "aztec3/utils/dummy_composer.hpp"

namespace aztec3::circuits::kernel::private_kernel {

using DummyComposer = aztec3::utils::DummyComposer;
using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::private_kernel::PrivateCallData;

void common_validate_call_stack(DummyComposer& composer, PrivateCallData<NT> const& private_call);

void common_update_end_values(DummyComposer& composer,
                              PrivateCallData<NT> const& private_call,
                              KernelCircuitPublicInputs<NT>& public_inputs);

}  // namespace aztec3::circuits::kernel::private_kernel