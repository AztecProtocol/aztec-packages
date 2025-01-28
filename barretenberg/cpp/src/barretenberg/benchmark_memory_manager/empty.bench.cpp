#include "custom_allocator.hpp" // Add this include
#include <benchmark/benchmark.h>
#include <vector>

void eg(benchmark::State& state)
{
    for (auto _ : state) {
        std::vector<int> v(1 << 22);
        benchmark::DoNotOptimize(v);
    }
}

BENCHMARK(eg)->Unit(benchmark::kMicrosecond);

// Register the custom memory manager and run the benchmark
int main(int argc, char** argv)
{
    benchmark::RegisterMemoryManager(new BenchmarkMemoryManager());
    ::benchmark::Initialize(&argc, argv);
    ::benchmark::RunSpecifiedBenchmarks();
    return 0;
}