#include "native_public_kernel_circuit_public_previous_kernel.hpp"

#include "common.hpp"
#include "init.hpp"

#include "aztec3/circuits/abis/public_kernel/public_kernel_inputs_inner.hpp"
#include "aztec3/utils/dummy_circuit_builder.hpp"

namespace aztec3::circuits::kernel::public_kernel {

using CircuitErrorCode = aztec3::utils::CircuitErrorCode;
using aztec3::circuits::kernel::public_kernel::NT;
using DummyBuilder = aztec3::utils::DummyCircuitBuilder;
using aztec3::circuits::abis::PublicKernelPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputsInner;
using aztec3::circuits::kernel::public_kernel::common_validate_kernel_execution;

void initialise_end_values(PublicKernelInputsInner<NT> const& private_inputs,
                           PublicKernelPublicInputs<NT>& public_inputs)
{
    common_initialise_end_values(private_inputs, public_inputs);
    const auto& start = private_inputs.previous_kernel.public_inputs.end;
    public_inputs.end.public_data_update_requests = start.public_data_update_requests;
    public_inputs.end.public_data_reads = start.public_data_reads;
}

/**
 * @brief Entry point for the native public kernel circuit with a public previous kernel
 * @param builder The circuit builder
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 * @return The circuit public inputs
 */
PublicKernelPublicInputs<NT> native_public_kernel_circuit_public_previous_kernel(
    DummyBuilder& builder, PublicKernelInputsInner<NT> const& public_kernel_inputs)
{
    // construct the circuit outputs
    PublicKernelPublicInputs<NT> public_inputs{};

    // initialise the end state with our provided previous kernel state
    initialise_end_values(public_kernel_inputs, public_inputs);

    // validate the inputs common to all invocation circumstances
    common_validate_inputs(builder, public_kernel_inputs);

    // validate the inputs unique to having a previous public kernel
    // TODO: Nothing specific to validate here?

    // validate the kernel execution common to all invocation circumstances
    common_validate_kernel_execution(builder, public_kernel_inputs);

    // validate our public call hash
    validate_this_public_call_hash(builder, public_kernel_inputs, public_inputs);

    // update the public end state of the circuit
    common_update_public_end_values(builder, public_kernel_inputs, public_inputs);

    accumulate_unencrypted_logs(public_kernel_inputs, public_inputs);

    return public_inputs;
};

}  // namespace aztec3::circuits::kernel::public_kernel