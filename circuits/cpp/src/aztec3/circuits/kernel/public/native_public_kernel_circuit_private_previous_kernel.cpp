#include "init.hpp"

#include <aztec3/circuits/abis/public_kernel/public_kernel_inputs.hpp>
#include <aztec3/circuits/abis/kernel_circuit_public_inputs.hpp>
#include "native_public_kernel_circuit_public_previous_kernel.hpp"
#include "common.hpp"

#include <aztec3/utils/array.hpp>
#include <aztec3/utils/dummy_composer.hpp>
#include "aztec3/constants.hpp"

namespace {
void validate_inputs(DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    const auto& this_call_stack_item = public_kernel_inputs.public_call.public_call_data.call_stack_item;
    composer.do_assert(array_length(this_call_stack_item.public_inputs.public_call_stack) > 0,
                       "Public call stack can't be empty");
    composer.do_assert(public_kernel_inputs.previous_kernel.public_inputs.end.private_call_count > 0,
                       "Private call count can't be zero");
    composer.do_assert(public_kernel_inputs.previous_kernel.public_inputs.end.public_call_count == 0,
                       "Public call count must be zero");
    composer.do_assert(public_kernel_inputs.previous_kernel.public_inputs.is_private == true,
                       "Previous kernel must be public");
}
} // namespace

namespace aztec3::circuits::kernel::public_kernel {

using aztec3::circuits::abis::KernelCircuitPublicInputs;
using aztec3::circuits::abis::public_kernel::PublicKernelInputs;
using aztec3::circuits::kernel::public_kernel::common_validate_inputs;
using aztec3::circuits::kernel::public_kernel::common_validate_kernel_execution;
using aztec3::circuits::kernel::public_kernel::update_public_end_values;
using aztec3::utils::push_array_to_array;

using DummyComposer = aztec3::utils::DummyComposer;

void update_end_values(PublicKernelInputs<NT> const& public_kernel_inputs,
                       KernelCircuitPublicInputs<NT>& circuit_outputs)
{
    update_public_end_values(public_kernel_inputs, circuit_outputs);

    // Ensure the arrays are the same as previously, before we start pushing more data onto them in other functions
    // within this circuit:
    auto& end = circuit_outputs.end;
    const auto& start = public_kernel_inputs.previous_kernel.public_inputs.end;

    end.new_commitments = start.new_commitments;
    end.new_nullifiers = start.new_nullifiers;

    end.private_call_stack = start.private_call_stack;
    end.public_call_stack = start.public_call_stack;
    end.l1_msg_stack = start.l1_msg_stack;

    end.optionally_revealed_data = start.optionally_revealed_data;

    circuit_outputs.constants = public_kernel_inputs.previous_kernel.public_inputs.constants;
}

// NOTE: THIS IS A VERY UNFINISHED WORK IN PROGRESS.
// TODO: decide what to return.
// TODO: is there a way to identify whether an input has not been used by ths circuit? This would help us
// more-safely ensure we're constraining everything.
KernelCircuitPublicInputs<NT> native_public_kernel_circuit_private_previous_kernel(
    DummyComposer& composer, PublicKernelInputs<NT> const& public_kernel_inputs)
{
    // construct the circuit outputs
    KernelCircuitPublicInputs<NT> public_inputs{};

    initialise_end_values(public_kernel_inputs, public_inputs);

    common_validate_inputs(composer, public_kernel_inputs);

    validate_inputs(composer, public_kernel_inputs);

    common_validate_kernel_execution(composer, public_kernel_inputs);

    update_end_values(public_kernel_inputs, public_inputs);

    return public_inputs;
};

} // namespace aztec3::circuits::kernel::public_kernel