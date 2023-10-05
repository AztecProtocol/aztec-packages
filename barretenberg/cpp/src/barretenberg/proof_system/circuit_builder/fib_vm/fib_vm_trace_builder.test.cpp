#include "fib_vm_trace_builder.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::fib_vm_trace_builder_tests {

TEST(FibVMTraceBuilderTests, Basic)
{
    // using FF = typename FibVMTraceBuilder::FF;

    const auto run_test = [](bool expected_result) {
        auto trace = FibVMTraceBuilder();

        size_t n = 10;
        trace.set_n(n);

        bool result = trace.check_gates();
        EXPECT_EQ(result, expected_result);
    };

    run_test(/*expected_result=*/true);
};

} // namespace proof_system::fib_vm_trace_builder_tests