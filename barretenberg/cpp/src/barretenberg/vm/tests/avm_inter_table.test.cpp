#include "avm_common.test.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace tests_avm {
using namespace bb::avm_trace;

class AvmInterTableTests : public ::testing::Test {
  public:
    AvmTraceBuilder trace_builder;

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override { srs::init_crs_factory("../srs_db/ignition"); };
};

TEST_F(AvmInterTableTests, addition)
{
    EXPECT_TRUE(true);
}

} // namespace tests_avm