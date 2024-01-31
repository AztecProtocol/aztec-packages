#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb::crypto;
using namespace bb::curve;
using pedersen = bb::crypto::pedersen_hash;

pedersen::Fq pedersen_impl(const pedersen::Fq& x, const pedersen::Fq& y, const pedersen::GeneratorContext& ctx)
{
    std::vector<pedersen::Fq> to_hash{ x, y };
    return pedersen::hash(to_hash, ctx);
}

void pedersen_bench(State& state) noexcept
{
    pedersen::GeneratorContext ctx;
    ctx.offset = 0;
    pedersen::Fq x = pedersen::Fq::random_element();
    pedersen::Fq y = pedersen::Fq::random_element();
    for (auto _ : state) {
        DoNotOptimize(pedersen_impl(x, y, ctx));
    }
}
BENCHMARK(pedersen_bench)->Unit(benchmark::kMillisecond);