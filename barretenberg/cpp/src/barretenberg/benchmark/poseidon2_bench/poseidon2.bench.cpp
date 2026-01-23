#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb;

fr poseidon_function(const size_t count)
{
    std::vector<fr> inputs(count);
    for (size_t i = 0; i < count; ++i) {
        inputs[i] = fr::random_element();
    }
    // hash count many field elements
    inputs[0] = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    return inputs[0];
}

void native_poseidon2_commitment_bench(State& state) noexcept
{
    for (auto _ : state) {
        const size_t count = (static_cast<size_t>(state.range(0)));
        DoNotOptimize(poseidon_function(count));
    }
}
BENCHMARK(native_poseidon2_commitment_bench)->Arg(10)->Arg(1000)->Arg(10000);

fr poseidon_hash_impl(const fr& x, const fr& y)
{
    std::vector<fr> to_hash{ x, y };
    return bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(to_hash);
}

void poseidon_hash_bench(State& state) noexcept
{
    fr x = fr::random_element();
    fr y = fr::random_element();
    for (auto _ : state) {
        DoNotOptimize(poseidon_hash_impl(x, y));
    }
}
BENCHMARK(poseidon_hash_bench)->Unit(benchmark::kMillisecond);

BENCHMARK_MAIN();
