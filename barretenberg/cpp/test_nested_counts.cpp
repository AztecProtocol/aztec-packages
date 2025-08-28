// Example demonstrating nested OpCount infrastructure
#include "src/barretenberg/common/bb_bench.hpp"
#include "src/barretenberg/common/op_count_google_bench.hpp"
#include <benchmark/benchmark.h>
#include <iostream>

// Example function with nested operations
void polynomial_operations()
{
    BB_OP_COUNT_SCOPE_WITH_TIMING("polynomial_operations");

    // FFT operations
    {
        BB_OP_COUNT_SCOPE("fft");
        BB_OP_COUNT_TIME_NAME("fft_forward");
        volatile int x = 0;
        for (int i = 0; i < 10000; i++)
            x++;

        // Butterfly sub-operation
        {
            BB_OP_COUNT_SCOPE("butterfly");
            BB_OP_COUNT_TIME_NAME("butterfly_op");
            for (int i = 0; i < 5000; i++)
                x++;
        }

        BB_OP_COUNT_TIME_NAME("fft_inverse");
        for (int i = 0; i < 10000; i++)
            x++;
    }

    // MSM operations
    {
        BB_OP_COUNT_SCOPE("msm");
        BB_OP_COUNT_TIME_NAME("scalar_mul");
        volatile int x = 0;
        for (int i = 0; i < 20000; i++)
            x++;

        {
            BB_OP_COUNT_SCOPE("point_addition");
            BB_OP_COUNT_TIME_NAME("ec_add");
            for (int i = 0; i < 5000; i++)
                x++;

            // Even deeper nesting
            {
                BB_OP_COUNT_SCOPE("field_ops");
                BB_OP_COUNT_TIME_NAME("field_mul");
                for (int i = 0; i < 2500; i++)
                    x++;
            }
        }
    }
}

// Google Benchmark example
static void BM_NestedOps(benchmark::State& state)
{
    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        polynomial_operations();
    }
}

BENCHMARK(BM_NestedOps);

int main(int argc, char** argv)
{
    // Enable op count timing
    bb::detail::use_bb_bench = true;

    // Run once to show hierarchical output
    std::cout << "=== Running with hierarchical OpCount ===" << std::endl;
    polynomial_operations();

    // Print results
    std::cout << "\n=== Hierarchical Output ===" << std::endl;
    bb::detail::GLOBAL_BENCH_STATS.print_hierarchical();

    // Show Google Benchmark format with slash notation
    std::cout << "\n=== Google Benchmark Format (slash notation) ===" << std::endl;
    auto counts = bb::detail::GLOBAL_BENCH_STATS.get_aggregate_counts_with_hierarchy();
    for (const auto& [key, value] : counts) {
        // Filter time measurements for cleaner output
        if (key.find("(t)") == std::string::npos) {
            std::cout << key << ": " << value << std::endl;
        }
    }

    // Run benchmarks if requested
    if (argc > 1 && std::string(argv[1]) == "--benchmark") {
        ::benchmark::Initialize(&argc, argv);
        ::benchmark::RunSpecifiedBenchmarks();
    }

    return 0;
}
