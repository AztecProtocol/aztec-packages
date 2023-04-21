#include "init.hpp"

#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs.hpp>
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include "native_public_kernel_circuit_public_previous_kernel.hpp"
#include "common.hpp"

#include <aztec3/utils/array.hpp>
#include <aztec3/utils/dummy_composer.hpp>
#include "aztec3/constants.hpp"

namespace aztec3::circuits::kernel::public_kernel {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputs;
using aztec3::circuits::kernel::public_kernel::common_validate_inputs;
using aztec3::circuits::kernel::public_kernel::common_validate_kernel_execution;
using aztec3::utils::push_array_to_array;

using DummyComposer = aztec3::utils::DummyComposer;

void validate_inputs(DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    const auto& this_call_stack_item = public_kernel_inputs.public_call.public_call_data.call_stack_item;
    composer.do_assert(array_length(this_call_stack_item.public_inputs.public_call_stack) > 0,
                       "Public call stack can't be empty");
    composer.do_assert(public_kernel_inputs.previous_kernel.public_inputs.end.public_call_count > 0,
                       "Public call count can't be zero");
    composer.do_assert(public_kernel_inputs.previous_kernel.public_inputs.is_private == false,
                       "Previous kernel must be public");
}

// NOTE: THIS IS A VERY UNFINISHED WORK IN PROGRESS.
// TODO: decide what to return.
// TODO: is there a way to identify whether an input has not been used by ths circuit? This would help us
// more-safely ensure we're constraining everything.
KernelCircuitPublicInputs<NT> native_public_kernel_circuit_public_previous_kernel(
    DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    // construct the circuit outputs
    KernelCircuitPublicInputs<NT> public_inputs{};

    initialise_end_values(public_kernel_inputs, public_inputs);

    common_validate_inputs(composer, public_kernel_inputs);

    validate_inputs(composer, public_kernel_inputs);

    common_validate_kernel_execution(composer, public_kernel_inputs);

    validate_this_public_call_hash(composer, public_kernel_inputs);

    update_public_end_values(public_kernel_inputs, public_inputs);

    public_inputs.constants = public_kernel_inputs.previous_kernel.public_inputs.constants;
    return public_inputs;
};

} // namespace aztec3::circuits::kernel::public_kernel