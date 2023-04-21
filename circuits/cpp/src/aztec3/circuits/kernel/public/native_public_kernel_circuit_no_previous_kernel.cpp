#include "init.hpp"

#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs_no_previous_kernel.hpp>
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include "native_public_kernel_circuit_no_previous_kernel.hpp"
#include "common.hpp"

#include <aztec3/utils/array.hpp>
#include <aztec3/utils/dummy_composer.hpp>
#include <aztec3/circuits/hash.hpp>
#include "aztec3/constants.hpp"

namespace aztec3::circuits::kernel::public_kernel {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputsNoPreviousKernel;
using aztec3::circuits::kernel::public_kernel::common_validate_inputs;
using aztec3::circuits::kernel::public_kernel::common_validate_kernel_execution;
using aztec3::circuits::kernel::public_kernel::validate_function_execution;
using aztec3::circuits::kernel::public_kernel::validate_state_reads;
using aztec3::circuits::kernel::public_kernel::validate_state_transitions;
using aztec3::circuits::kernel::public_kernel::validate_this_public_call_stack;
using aztec3::utils::push_array_to_array;

using DummyComposer = aztec3::utils::DummyComposer;

// NOTE: THIS IS A VERY UNFINISHED WORK IN PROGRESS.
// TODO: decide what to return.
// TODO: is there a way to identify whether an input has not been used by ths circuit? This would help us more-safely
// ensure we're constraining everything.
KernelCircuitPublicInputs<NT> native_public_kernel_circuit_no_previous_kernel(
    DummyComposer& composer, PublicKernelInputsNoPreviousKernel<NT> const& public_kernel_inputs)
{
    // There is not circuit state carried over from previous iterations.
    // We are construcitng fresh state that will be added to during this circuit execution.
    KernelCircuitPublicInputs<NT> public_inputs{};

    common_validate_inputs(composer, public_kernel_inputs);

    common_validate_kernel_execution(composer, public_kernel_inputs);

    update_public_end_values(composer, public_kernel_inputs, public_inputs);
    return public_inputs;
};

} // namespace aztec3::circuits::kernel::public_kernel