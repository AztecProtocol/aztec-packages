
#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"

namespace tests_avm {
using namespace bb::avm_trace;

class AvmEnvironmentTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

using KernelInputs = std::array<FF, KERNEL_INPUTS_LENGTH>;
KernelInputs get_kernel_inputs()
{
    std::array<FF, KERNEL_INPUTS_LENGTH> kernel_inputs;
    for (size_t i = 0; i < KERNEL_INPUTS_LENGTH; i++) {
        kernel_inputs[i] = FF(i + 1);
    }
    return kernel_inputs;
}

// Template helper function to apply boilerplate around the kernel lookup tests
template <typename Func> void test_kernel_lookup(Func apply_opcodes)
{
    KernelInputs kernel_inputs = get_kernel_inputs();
    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    validate_trace(std::move(trace), kernel_inputs);
}

TEST_F(AvmEnvironmentTests, simpleSender)
{
    // We test that the sender opcode is inlcuded at index x in the public inputs
    auto apply_opcodes = [](AvmTraceBuilder& trace_builder) { trace_builder.op_sender(42); };
    test_kernel_lookup(apply_opcodes);
}

TEST_F(AvmEnvironmentTests, simpleAddress)
{
    auto apply_opcodes = [](AvmTraceBuilder& trace_builder) { trace_builder.op_address(42); };
    test_kernel_lookup(apply_opcodes);
}

TEST_F(AvmEnvironmentTests, simplePortal)
{
    auto apply_opcodes = [](AvmTraceBuilder& trace_builder) { trace_builder.op_portal(42); };
    test_kernel_lookup(apply_opcodes);
}

TEST_F(AvmEnvironmentTests, simpleFunction)
{
    auto apply_opcodes = [](AvmTraceBuilder& trace_builder) { trace_builder.op_function(42); };
    test_kernel_lookup(apply_opcodes);
}

} // namespace tests_avm