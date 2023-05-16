#include "native_public_kernel_circuit_public_previous_kernel.hpp"

#include "common.hpp"
#include "init.hpp"

#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs.hpp>
#include <aztec3/utils/array.hpp>
#include <aztec3/utils/dummy_composer.hpp>

namespace {
using CircuitErrorCode = aztec3::utils::CircuitErrorCode;
/**
 * @brief Validates the kernel circuit inputs specific to having a public previous kernel
 * @param composer The circuit composer
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 */
void validate_inputs(DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    const auto& previous_kernel = public_kernel_inputs.previous_kernel.public_inputs;
    composer.do_assert(previous_kernel.is_private == false,
                       "Previous kernel must be public",
                       CircuitErrorCode::PUBLIC_KERNEL__PREVIOUS_KERNEL_NOT_PUBLIC);
}
}  // namespace

namespace aztec3::circuits::kernel::public_kernel {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputs;
using aztec3::circuits::kernel::public_kernel::common_validate_kernel_execution;

using DummyComposer = aztec3::utils::DummyComposer;

/**
 * @brief Entry point for the native public kernel circuit with a public previous kernel
 * @param composer The circuit composer
 * @param public_kernel_inputs The inputs to this iteration of the kernel circuit
 * @return The circuit public inputs
 */
KernelCircuitPublicInputs<NT> native_public_kernel_circuit_public_previous_kernel(
    DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    // construct the circuit outputs
    KernelCircuitPublicInputs<NT> public_inputs{};

    // initialise the end state with our provided previous kernel state
    common_initialise_end_values(public_kernel_inputs, public_inputs);

    // validate the inputs common to all invocation circumstances
    common_validate_inputs(composer, public_kernel_inputs);

    // validate the inputs unique to having a previous public kernel
    validate_inputs(composer, public_kernel_inputs);

    // validate the kernel execution common to all invocation circumstances
    common_validate_kernel_execution(composer, public_kernel_inputs);

    // validate our public call hash
    validate_this_public_call_hash(composer, public_kernel_inputs, public_inputs);

    // update the public end state of the circuit
    update_public_end_values(public_kernel_inputs, public_inputs);

    return public_inputs;
};

}  // namespace aztec3::circuits::kernel::public_kernel