#include "avm_common.test.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"
#include <gmock/gmock.h>
#include <gtest/gtest.h>

namespace tests_avm {
using namespace bb::avm_trace;
using namespace testing;

class AvmCastTests : public ::testing::Test {
  public:
    AvmTraceBuilder trace_builder;

  protected:
    std::vector<Row> trace;

    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

TEST_F(AvmCastTests, basicU8ToU16)
{
    trace_builder.op_set(0, 237, 0, AvmMemoryTag::U8);
    trace_builder.op_cast(0, 0, 1, AvmMemoryTag::U16);
    trace_builder.return_op(0, 0, 0);
    auto trace = trace_builder.finalize();

    validate_trace_check_circuit(std::move(trace));
}

} // namespace tests_avm
