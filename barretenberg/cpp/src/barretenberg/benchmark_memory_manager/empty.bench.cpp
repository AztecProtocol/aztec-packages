#include <benchmark/benchmark.h>
#include <vector>

using namespace benchmark;

void eg(State& state)
{
    for (auto _ : state) {
        std::vector<int> v(1 << 22);
        DoNotOptimize(v);
    }
}

BENCHMARK(eg)->Unit(kMicrosecond);

BENCHMARK_MAIN();