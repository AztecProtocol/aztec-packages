#include "avm_environment_trace.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_trace.hpp"
#include <sys/types.h>

namespace bb::avm_trace {

AvmEnvironmentTraceBuilder::AvmEnvironmentTraceBuilder(std::vector<FF> kernel_inputs)
    : kernel_inputs(kernel_inputs)
{}

void AvmEnvironmentTraceBuilder::reset()
{
    environment_selector_counter.clear();
}

FF AvmEnvironmentTraceBuilder::op_sender()
{
    // We want to be able to get the return value from the public inputs column
    // Get the return value, this will be places in ia
    // We read from the public inputs that were provided to the kernel
    FF result = kernel_inputs[SENDER_SELECTOR];
    environment_selector_counter[SENDER_SELECTOR]++;

    return result;
}

FF AvmEnvironmentTraceBuilder::op_address()
{
    // We want to be able to get the return value from the public inputs column
    // Get the return value, this will be places in ia
    // We read from the public inputs that were provided to the kernel
    FF result = kernel_inputs[ADDRESS_SELECTOR];
    environment_selector_counter[ADDRESS_SELECTOR]++;

    return result;
}
} // namespace bb::avm_trace