#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <benchmark/benchmark.h>

using namespace bb;
using affine_element = grumpkin::g1::affine_element;
using element = grumpkin::g1::element;
using Fr = grumpkin::g1::Fr;

namespace {

std::vector<affine_element> make_points(size_t n)
{
    std::vector<affine_element> pts;
    pts.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        pts.emplace_back(element::random_element());
    }
    return pts;
}

void bench_full(::benchmark::State& state)
{
    const size_t n = static_cast<size_t>(state.range(0));
    auto pts = make_points(n);
    Fr s = Fr::random_element();
    for (auto _ : state) {
        auto result = element::batch_mul_with_endomorphism(pts, s);
        ::benchmark::DoNotOptimize(result);
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * static_cast<int64_t>(n));
}

} // namespace

BENCHMARK(bench_full)
    ->Name("batch_mul/full")
    ->Arg(1 << 12)
    ->Arg(1 << 13)
    ->Arg(1 << 14)
    ->Arg(1 << 15)
    ->Unit(::benchmark::kMillisecond);

BENCHMARK_MAIN();
