#include "baby_vm_trace_builder.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::baby_vm_trace_builder_tests {

TEST(BabyVMTraceBuilderTests, Basic)
{
    using FF = typename BabyVMTraceBuilder::FF;

    const auto run_test = [](bool expected_result) {
        auto trace = BabyVMTraceBuilder();
        FF a = FF::random_element();
        FF b = FF::random_element();
        FF x = FF::random_element();
        FF expected = a + b * x;

        trace.add_accumulate(1);
        trace.mul_accumulate(b);
        trace.mul_accumulate(x);
        trace.add_accumulate(a);
        trace.eq_and_reset(expected);

        bool result = trace.check_gates();
        EXPECT_EQ(result, expected_result);
    };

    run_test(/*expected_result=*/true);
};

} // namespace proof_system::baby_vm_trace_builder_tests