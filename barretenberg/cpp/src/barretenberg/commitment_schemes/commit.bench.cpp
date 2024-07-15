
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <algorithm>
#include <benchmark/benchmark.h>
#include <iostream>
#include <ranges>
#include <vector>

namespace bb {

template <typename Curve> std::shared_ptr<CommitmentKey<Curve>> create_commitment_key(const size_t num_points)
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    std::string srs_path;
    return std::make_shared<CommitmentKey<Curve>>(num_points);
}

template <typename FF> Polynomial<FF> sparse_random_poly(const size_t size, const size_t num_nonzero)
{
    auto polynomial = Polynomial<FF>(size);

    for (size_t i = 0; i < num_nonzero; i++) {
        polynomial[i] = FF::random_element();
    }

    return polynomial;
}

template <typename Curve>
std::vector<typename Curve::AffineElement> extract_srs(std::shared_ptr<CommitmentKey<Curve>> commitment_key,
                                                       const size_t num_points)
{
    using G1 = typename Curve::AffineElement;
    std::vector<G1> monomials;
    size_t idx = 0;
    std::span<G1> point_table(commitment_key->srs->get_monomial_points(), 2 * num_points);

    for (auto& element : point_table) {
        if (idx % 2 == 0) {
            monomials.emplace_back(element);
        }
        idx++;
        if (monomials.size() == num_points) {
            break;
        }
    }
    return monomials;
}

constexpr size_t MAX_LOG_NUM_POINTS = 18;
constexpr size_t MAX_NUM_POINTS = 1 << MAX_LOG_NUM_POINTS;

template <typename Curve> void bench_commit_zero(::benchmark::State& state)
{
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const auto polynomial = Polynomial<typename Curve::ScalarField>(num_points);
    for (auto _ : state) {
        key->commit(polynomial);
    }
}

template <typename Curve> void bench_commit_sparse(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    auto polynomial = Polynomial<Fr>(num_points);
    polynomial[25] = 1;
    polynomial[22] = 1;
    for (auto _ : state) {
        key->commit(polynomial);
    }
}

template <typename Curve> void bench_commit_sparse_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = 100;

    auto polynomial = sparse_random_poly<Fr>(num_points, num_nonzero);

    for (auto _ : state) {
        key->commit(polynomial);
    }
}

template <typename Curve> void bench_commit_sparse_random_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = 100;

    auto polynomial = sparse_random_poly<Fr>(num_points, num_nonzero);

    for (auto _ : state) {
        key->commit_sparse(polynomial);
    }
}

template <typename Curve> void bench_commit_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    auto polynomial = Polynomial<Fr>(num_points);
    for (auto& coeff : polynomial) {
        coeff = Fr::random_element();
    }
    for (auto _ : state) {
        key->commit(polynomial);
    }
}

BENCHMARK(bench_commit_zero<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_random<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_random_preprocessed<curve::BN254>)
    ->DenseRange(14, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_random<curve::BN254>)->DenseRange(14, MAX_LOG_NUM_POINTS)->Unit(benchmark::kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
