
#include "avm_common.test.hpp"

namespace tests_avm {
using namespace bb::avm_trace;

class AvmEnvironmentTests : public ::testing::Test {

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

TEST_F(AvmEnvironmentTests, simpleSender)
{
    // We test that the sender opcode is inlcuded at index x in the public inputs

    std::vector<FF> kernel_inputs = { FF(1), FF(2) };
    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    trace_builder.op_sender(42);
    trace_builder.halt();

    auto trace = trace_builder.finalize();

    validate_trace(std::move(trace), kernel_inputs);
}

TEST_F(AvmEnvironmentTests, simpleAddress)
{
    // We test that the sender opcode is inlcuded at index x in the public inputs

    std::vector<FF> kernel_inputs = { FF(1), FF(2) };
    AvmTraceBuilder trace_builder(kernel_inputs);

    // We should return a value of 1 for the sender, as it exists at index 0
    trace_builder.op_address(42);
    trace_builder.halt();

    auto trace = trace_builder.finalize();

    validate_trace(std::move(trace), kernel_inputs);
}
} // namespace tests_avm