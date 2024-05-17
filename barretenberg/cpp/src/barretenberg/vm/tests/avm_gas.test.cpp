#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/constants.hpp"

namespace tests_avm {
using namespace bb::avm_trace;

class AvmGasTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

class AvmGasPositiveTests : public AvmGasTests {};
class AvmGasNegativeTests : public AvmGasTests {};

using KernelInputs = std::array<FF, KERNEL_INPUTS_LENGTH>;

// TODO: migrate to helper
// Template helper function to apply boilerplate around the kernel lookup tests
template <typename OpcodesFunc, typename CheckFunc> void test_lookup(OpcodesFunc apply_opcodes, CheckFunc check_trace)
{
    KernelInputs kernel_inputs = {};
    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    apply_opcodes(trace_builder);

    trace_builder.halt();

    auto trace = trace_builder.finalize();

    check_trace(trace);

    validate_trace(std::move(trace), kernel_inputs);
}

TEST_F(AvmGasPositiveTests, gasAdd)
{
    // We test that the sender opcode is included at index 0 in the public inputs
    auto apply_opcodes = [=](AvmTraceBuilder& trace_builder) {
        // trace_builder.set()
        trace_builder.op_add(0, 1, 2, 3, AvmMemoryTag::FF);
    };
    auto checks = [=](const std::vector<Row>& trace) {
        std::vector<Row>::const_iterator sender_row =
            std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avm_main_sel_op_add == FF(1); });
        EXPECT_TRUE(sender_row != trace.end());

        //
    };

    test_lookup(apply_opcodes, checks);
}

} // namespace tests_avm