
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <benchmark/benchmark.h>

namespace bb {

template <typename Curve> std::shared_ptr<CommitmentKey<Curve>> create_commitment_key(const size_t num_points)
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    std::string srs_path;
    return std::make_shared<CommitmentKey<Curve>>(num_points);
}

// Generate a polynomial with a specified number of nonzero random coefficients
template <typename FF> Polynomial<FF> sparse_random_poly(const size_t size, const size_t num_nonzero)
{
    auto& engine = numeric::get_debug_randomness();
    auto polynomial = Polynomial<FF>(size);

    for (size_t i = 0; i < num_nonzero; i++) {
        size_t idx = engine.get_random_uint32() % size;
        polynomial.at(idx) = FF::random_element();
    }

    return polynomial;
}

// Generate a polynomial with a specified number of nonzero random coefficients
template <typename FF>
Polynomial<FF> structured_random_poly(const std::vector<uint32_t>& structured_sizes,
                                      const std::vector<uint32_t>& actual_sizes)
{
    uint32_t full_size = 0;
    for (auto size : structured_sizes) {
        full_size += size;
    }

    // auto& engine = numeric::get_debug_randomness();
    auto polynomial = Polynomial<FF>(full_size);

    uint32_t start_idx = 0;
    uint32_t end_idx = 0;
    for (auto [block_size, actual_size] : zip_view(structured_sizes, actual_sizes)) {
        end_idx = start_idx + actual_size;
        for (size_t i = start_idx; i < end_idx; ++i) {
            polynomial.at(i) = FF::random_element();
        }
        start_idx += block_size;
    }

    return polynomial;
}

constexpr size_t MIN_LOG_NUM_POINTS = 20;
constexpr size_t MAX_LOG_NUM_POINTS = 20;
constexpr size_t MAX_NUM_POINTS = 1 << MAX_LOG_NUM_POINTS;
constexpr size_t SPARSE_NUM_NONZERO = 1 << 16;

// Commit to a zero polynomial
template <typename Curve> void bench_commit_zero(::benchmark::State& state)
{
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const auto polynomial = Polynomial<typename Curve::ScalarField>(num_points);
    for (auto _ : state) {
        key->commit(polynomial);
    }
}

// Commit to a polynomial with sparse nonzero entries equal to 1
template <typename Curve> void bench_commit_sparse(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = SPARSE_NUM_NONZERO;

    auto polynomial = Polynomial<Fr>(num_points);
    for (size_t i = 0; i < num_nonzero; i++) {
        polynomial.at(i) = 1;
    }

    for (auto _ : state) {
        key->commit(polynomial);
    }
}

// Commit to a polynomial with sparse nonzero entries equal to 1 using the commit_sparse method to preprocess the input
template <typename Curve> void bench_commit_sparse_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = SPARSE_NUM_NONZERO;

    auto polynomial = Polynomial<Fr>(num_points);
    for (size_t i = 0; i < num_nonzero; i++) {
        polynomial.at(i) = 1;
    }

    for (auto _ : state) {
        key->commit_sparse(polynomial);
    }
}

// Commit to a polynomial with sparse random nonzero entries
template <typename Curve> void bench_commit_sparse_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = SPARSE_NUM_NONZERO;

    auto polynomial = sparse_random_poly<Fr>(num_points, num_nonzero);

    for (auto _ : state) {
        key->commit(polynomial);
    }
}

// Commit to a polynomial with sparse random nonzero entries using the commit_sparse method to preprocess the input
template <typename Curve> void bench_commit_sparse_random_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const size_t num_nonzero = SPARSE_NUM_NONZERO;

    auto polynomial = sparse_random_poly<Fr>(num_points, num_nonzero);

    for (auto _ : state) {
        key->commit_sparse(polynomial);
    }
}

// Commit to a polynomial with dense random nonzero entries
template <typename Curve> void bench_commit_random(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    Polynomial<Fr> polynomial = Polynomial<Fr>::random(num_points);
    for (auto _ : state) {
        key->commit(polynomial);
    }
}
// Commit to a polynomial with dense random nonzero entries but NOT our happiest case of an exact power of 2
// Note this used to be a 50% regression just subtracting a power of 2 by 1.
template <typename Curve> void bench_commit_random_non_power_of_2(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    Polynomial<Fr> polynomial = Polynomial<Fr>::random(num_points - 1);
    for (auto _ : state) {
        key->commit(polynomial);
    }
}

// Commit to a polynomial with sparse random nonzero entries using the commit_sparse method to preprocess the input
template <typename Curve> void bench_commit_structured_random_poly(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    // const size_t num_points = 1 << state.range(0);
    // const size_t num_nonzero = SPARSE_NUM_NONZERO;

    const uint32_t NUM_BLOCKS = 8;
    const uint32_t BLOCK_SIZE = 1 << 16;
    const uint32_t ACTUAL_SIZE = 1 << 14;
    std::vector<uint32_t> block_sizes(NUM_BLOCKS, BLOCK_SIZE);
    std::vector<uint32_t> actual_sizes(NUM_BLOCKS, ACTUAL_SIZE);

    auto polynomial = structured_random_poly<Fr>(block_sizes, actual_sizes);

    for (auto _ : state) {
        key->commit(polynomial);
    }
}

// Commit to a polynomial with sparse random nonzero entries using the commit_sparse method to preprocess the input
template <typename Curve> void bench_commit_structured_random_poly_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    // const size_t num_points = 1 << state.range(0);
    // const size_t num_nonzero = SPARSE_NUM_NONZERO;

    const uint32_t NUM_BLOCKS = 8;
    const uint32_t BLOCK_SIZE = 1 << 16;
    const uint32_t ACTUAL_SIZE = 1 << 14;
    std::vector<uint32_t> block_sizes(NUM_BLOCKS, BLOCK_SIZE);
    std::vector<uint32_t> actual_sizes(NUM_BLOCKS, ACTUAL_SIZE);

    auto polynomial = structured_random_poly<Fr>(block_sizes, actual_sizes);

    for (auto _ : state) {
        key->commit_structured(polynomial, block_sizes, actual_sizes);
    }
}

// Commit to a polynomial with sparse random nonzero entries using the commit_sparse method to preprocess the input
template <typename Curve> void bench_commit_structured_random_poly_preprocessed_partial(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    // const size_t num_points = 1 << state.range(0);
    // const size_t num_nonzero = SPARSE_NUM_NONZERO;

    const uint32_t NUM_BLOCKS = 8;
    const uint32_t BLOCK_SIZE = 1 << 16;
    const uint32_t ACTUAL_SIZE = 1 << 14;
    std::vector<uint32_t> block_sizes(NUM_BLOCKS, BLOCK_SIZE);
    std::vector<uint32_t> actual_sizes(NUM_BLOCKS, ACTUAL_SIZE);

    auto polynomial = structured_random_poly<Fr>(block_sizes, actual_sizes);

    for (auto _ : state) {
        key->commit_structured_partial(polynomial, block_sizes, actual_sizes);
    }
}

// BENCHMARK(bench_commit_zero<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_sparse<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_sparse_preprocessed<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_sparse_random<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_sparse_random_preprocessed<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_random<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
// BENCHMARK(bench_commit_random_non_power_of_2<curve::BN254>)
//     ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
//     ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_structured_random_poly<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_structured_random_poly_preprocessed<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_structured_random_poly_preprocessed_partial<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
