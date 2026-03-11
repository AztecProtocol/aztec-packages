#include "pairing.hpp"
#include <benchmark/benchmark.h>

#include <array>

using namespace benchmark;
using namespace bb;

namespace {

std::array<g1::affine_element, 8> get_g1_points()
{
    std::array<g1::affine_element, 8> points;
    for (size_t i = 0; i < points.size(); ++i) {
        points[i] = g1::affine_one * fr(static_cast<uint64_t>(i + 1));
    }
    return points;
}

std::array<g2::affine_element, 8> get_g2_points()
{
    std::array<g2::affine_element, 8> points;
    for (size_t i = 0; i < points.size(); ++i) {
        points[i] = g2::affine_one * fr(static_cast<uint64_t>(i + 1));
    }
    return points;
}

void pairing_single(State& state) noexcept
{
    static const g1::affine_element p = g1::affine_one * fr(5);
    static const g2::affine_element q = g2::affine_one * fr(7);

    for (auto _ : state) {
        auto result = pairing::reduced_ate_pairing(p, q);
        DoNotOptimize(result);
    }
}

void pairing_batch(State& state) noexcept
{
    const auto num_pairs = static_cast<size_t>(state.range(0));
    static const auto p_points = get_g1_points();
    static const auto q_points = get_g2_points();

    for (auto _ : state) {
        auto result = pairing::reduced_ate_pairing_batch(p_points.data(), q_points.data(), num_pairs);
        DoNotOptimize(result);
    }
}

} // namespace

BENCHMARK(pairing_single)->Unit(kMicrosecond);
BENCHMARK(pairing_batch)->Arg(2)->Arg(4)->Arg(8)->Unit(kMicrosecond);

BENCHMARK_MAIN();
