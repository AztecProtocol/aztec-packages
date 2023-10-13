#pragma once

#include "init.hpp"

#include "aztec3/circuits/abis/private_kernel/private_kernel_inputs_inner.hpp"
#include "aztec3/circuits/abis/private_kernel_public_inputs.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"

namespace aztec3::circuits::kernel::private_kernel {

using aztec3::circuits::abis::PrivateKernelPublicInputs;
using aztec3::circuits::abis::private_kernel::PrivateKernelInputsInner;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;

PrivateKernelPublicInputs<NT> native_private_kernel_circuit_inner(DummyBuilder& builder,
                                                                  PrivateKernelInputsInner<NT> const& private_inputs);

}  // namespace aztec3::circuits::kernel::private_kernel