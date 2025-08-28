// Simple test for nested OpCount infrastructure
#include "src/barretenberg/common/bb_bench.hpp"
#include <iostream>

int main()
{
    // Enable op count timing
    bb::detail::use_bb_bench = true;

    // Test hierarchical op counts
    {
        BB_OP_COUNT_SCOPE_WITH_TIMING("polynomial_operations");

        // Nested operation 1
        {
            BB_OP_COUNT_SCOPE("fft");
            BB_OP_COUNT_TIME_NAME("fft_forward");
            // Simulate some work
            for (int i = 0; i < 1000; i++)
                ;

            // Sub-operation
            {
                BB_OP_COUNT_SCOPE("butterfly");
                BB_OP_COUNT_TIME_NAME("butterfly_op");
                for (int i = 0; i < 100; i++)
                    ;
            }
        }

        // Nested operation 2
        {
            BB_OP_COUNT_SCOPE("msm");
            BB_OP_COUNT_TIME_NAME("scalar_mul");
            for (int i = 0; i < 2000; i++)
                ;

            {
                BB_OP_COUNT_SCOPE("point_addition");
                BB_OP_COUNT_TIME_NAME("ec_add");
                for (int i = 0; i < 500; i++)
                    ;
            }
        }
    }

    // Print hierarchical results
    std::cout << "\n=== Hierarchical OpCount Results ===" << std::endl;
    bb::detail::GLOBAL_BENCH_STATS.print_hierarchical();

    // Show how it appears in benchmark format
    std::cout << "\n=== Google Benchmark Format (with slash notation) ===" << std::endl;
    auto counts = bb::detail::GLOBAL_BENCH_STATS.get_aggregate_counts_with_hierarchy();
    for (const auto& [key, value] : counts) {
        std::cout << key << ": " << value << std::endl;
    }

    return 0;
}
