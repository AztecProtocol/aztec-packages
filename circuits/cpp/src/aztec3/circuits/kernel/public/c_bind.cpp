#include "c_bind.h"

#include "index.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/public_kernel/public_kernel_inputs_init.hpp"
#include "aztec3/circuits/abis/public_kernel/public_kernel_inputs_inner.hpp"
#include "aztec3/constants.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"
#include "aztec3/utils/types/native_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace {
using Builder = UltraCircuitBuilder;
using NT = aztec3::utils::types::NativeTypes;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;
using aztec3::circuits::abis::PublicKernelPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputsInit;
using aztec3::circuits::abis::public_kernel::PublicKernelInputsInner;
using aztec3::circuits::kernel::public_kernel::native_public_kernel_circuit_private_previous_kernel;
using aztec3::circuits::kernel::public_kernel::native_public_kernel_circuit_public_previous_kernel;

// WASM Cbinds
CBIND(public_kernel_init__sim, [](PublicKernelInputsInit<NT> const& public_kernel_inputs) {
    DummyBuilder builder = DummyBuilder("public_kernel_init__sim");
    PublicKernelPublicInputs<NT> const result =
        native_public_kernel_circuit_private_previous_kernel(builder, public_kernel_inputs);
    return builder.result_or_error(result);
});

CBIND(public_kernel_inner__sim, [](PublicKernelInputsInner<NT> const& public_kernel_inputs) {
    DummyBuilder builder = DummyBuilder("public_kernel_inner__sim");
    PublicKernelPublicInputs<NT> const result =
        native_public_kernel_circuit_public_previous_kernel(builder, public_kernel_inputs);
    return builder.result_or_error(result);
});

}  // namespace
