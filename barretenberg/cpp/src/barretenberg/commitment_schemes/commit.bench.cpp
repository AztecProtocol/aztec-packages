
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <benchmark/benchmark.h>

namespace bb {

template <typename Curve> std::shared_ptr<CommitmentKey<Curve>> create_commitment_key(const size_t num_points)
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    std::string srs_path;
    return std::make_shared<CommitmentKey<Curve>>(num_points);
}

constexpr size_t MAX_LOG_NUM_POINTS = 19;
constexpr size_t MAX_NUM_POINTS = 1 << MAX_LOG_NUM_POINTS;

auto key = create_commitment_key<curve::BN254>(MAX_NUM_POINTS);

template <typename Curve> void bench_commit_zero(::benchmark::State& state)
{
    const size_t num_points = 1 << state.range(0);
    const auto polynomial = Polynomial<typename Curve::ScalarField>(num_points);
    for (auto _ : state) {
        benchmark::DoNotOptimize(key->commit(polynomial));
    }
}

template <typename Curve> void bench_commit_sparse(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    const size_t num_points = 1 << state.range(0);
    auto polynomial = Polynomial<Fr>(num_points);
    polynomial[25] = 1;
    polynomial[22] = 1;
    for (auto _ : state) {
        benchmark::DoNotOptimize(key->commit(polynomial));
    }
}

template <typename Curve> void bench_commit_sparse_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    const size_t num_points = 1 << state.range(0);
    auto polynomial = Polynomial<Fr>(num_points);
    polynomial[25] = Fr::random_element();
    polynomial[22] = Fr::random_element();
    for (auto _ : state) {
        benchmark::DoNotOptimize(key->commit(polynomial));
    }
}

template <typename Curve> void bench_commit_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    const size_t num_points = 1 << state.range(0);
    auto polynomial = Polynomial<Fr>(num_points);
    for (auto& coeff : polynomial) {
        coeff = Fr::random_element();
    }
    for (auto _ : state) {
        benchmark::DoNotOptimize(key->commit(polynomial));
    }
}

BENCHMARK(bench_commit_zero<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_random<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_random<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
