#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include <benchmark/benchmark.h>

using Fq = bb::curve::BN254::BaseField;
using Fr = bb::curve::BN254::ScalarField;

// --- Fq (base field) ---

static void Fq_MontMul_Latency(benchmark::State& state)
{
    Fq a = Fq::random_element();
    Fq b = Fq::random_element();
    for (auto _ : state) {
        a *= b;
        benchmark::DoNotOptimize(a);
    }
}
BENCHMARK(Fq_MontMul_Latency)->Iterations(1 << 20);

static void Fq_MontMul_Throughput(benchmark::State& state)
{
    constexpr size_t BATCH = 64;
    std::array<Fq, BATCH> as, bs, rs;
    for (size_t i = 0; i < BATCH; i++) {
        as[i] = Fq::random_element();
        bs[i] = Fq::random_element();
    }
    for (auto _ : state) {
        for (size_t i = 0; i < BATCH; i++)
            rs[i] = as[i] * bs[i];
        benchmark::DoNotOptimize(rs);
    }
    state.SetItemsProcessed(state.iterations() * BATCH);
}
BENCHMARK(Fq_MontMul_Throughput)->Iterations(1 << 16);

// --- Fr (scalar field) — same algorithm, different modulus ---

static void Fr_MontMul_Latency(benchmark::State& state)
{
    Fr a = Fr::random_element();
    Fr b = Fr::random_element();
    for (auto _ : state) {
        a *= b;
        benchmark::DoNotOptimize(a);
    }
}
BENCHMARK(Fr_MontMul_Latency)->Iterations(1 << 20);

static void Fr_MontMul_Throughput(benchmark::State& state)
{
    constexpr size_t BATCH = 64;
    std::array<Fr, BATCH> as, bs, rs;
    for (size_t i = 0; i < BATCH; i++) {
        as[i] = Fr::random_element();
        bs[i] = Fr::random_element();
    }
    for (auto _ : state) {
        for (size_t i = 0; i < BATCH; i++)
            rs[i] = as[i] * bs[i];
        benchmark::DoNotOptimize(rs);
    }
    state.SetItemsProcessed(state.iterations() * BATCH);
}
BENCHMARK(Fr_MontMul_Throughput)->Iterations(1 << 16);

BENCHMARK_MAIN();
