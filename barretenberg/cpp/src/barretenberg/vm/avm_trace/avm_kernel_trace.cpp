#include "avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_trace.hpp"
#include "constants.hpp"
#include <sys/types.h>

// For the meantime, we do not fire around the public inputs as a vector or otherwise
// Instead we fire them around as a fixed length array from the kernel, as that is how they will be

namespace bb::avm_trace {

AvmKernelTraceBuilder::AvmKernelTraceBuilder(std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs)
    : kernel_inputs(kernel_inputs)
{}

void AvmKernelTraceBuilder::reset()
{
    kernel_selector_counter.clear();
}

FF AvmKernelTraceBuilder::perform_kernel_lookup(uint32_t selector)
{
    FF result = kernel_inputs[selector];
    kernel_selector_counter[selector]++;
    return result;
}

// We want to be able to get the return value from the public inputs column
// Get the return value, this will be places in ia
// We read from the public inputs that were provided to the kernel
FF AvmKernelTraceBuilder::op_sender()
{
    return perform_kernel_lookup(SENDER_SELECTOR);
}

FF AvmKernelTraceBuilder::op_address()
{
    return perform_kernel_lookup(ADDRESS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_portal()
{
    return perform_kernel_lookup(PORTAL_SELECTOR);
}

FF AvmKernelTraceBuilder::op_function()
{
    return perform_kernel_lookup(FUNCTION_SELECTOR);
}

FF AvmKernelTraceBuilder::op_fee_per_da_gas()
{
    return perform_kernel_lookup(FEE_PER_DA_GAS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_fee_per_l1_gas()
{
    return perform_kernel_lookup(FEE_PER_L1_GAS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_fee_per_l2_gas()
{
    return perform_kernel_lookup(FEE_PER_L2_GAS_SELECTOR);
}

} // namespace bb::avm_trace