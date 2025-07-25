// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/ecc//batched_affine_addition/batched_affine_addition.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include <benchmark/benchmark.h>

namespace bb {

template <typename Curve> CommitmentKey<Curve> create_commitment_key(const size_t num_points)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    std::string srs_path;
    return CommitmentKey<Curve>(num_points);
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

template <typename FF> struct PolyData {
    Polynomial<FF> polynomial;
    std::vector<std::pair<size_t, size_t>> active_range_endpoints;
};

// Generate a polynomial with random coefficients organized in isolated blocks. (Mimics the wire polynomials
// in the structured trace setting, or z_perm if non_zero_complement is set to true).
template <typename FF> PolyData<FF> structured_random_poly(bool non_zero_complement = false)
{
    // An arbitrary but realistic test case taken from the actual structure of a wire in the client_ivc bench
    std::vector<uint32_t> fixed_sizes = {
        1 << 10, 1 << 7, 201000, 90000, 9000, 137000, 72000, 1 << 7, 2500, 11500,
    };
    std::vector<uint32_t> actual_sizes = {
        10, 16, 48873, 18209, 4132, 23556, 35443, 3, 2, 2,
    };

    uint32_t full_size = 0;
    for (auto size : fixed_sizes) {
        full_size += size;
    }

    // In practice the polynomials will have a power-of-2 size
    auto log2_n = static_cast<size_t>(numeric::get_msb(full_size));
    if ((1UL << log2_n) != (full_size)) {
        ++log2_n;
    }
    full_size = 1 << log2_n;

    // Construct a polynomial with the prescribed structure; track the "active" regions
    auto polynomial = Polynomial<FF>(full_size);
    uint32_t start_idx = 0;
    uint32_t end_idx = 0;
    std::vector<std::pair<size_t, size_t>> active_range_endpoints;
    for (auto [block_size, actual_size] : zip_view(fixed_sizes, actual_sizes)) {
        end_idx = start_idx + actual_size;
        for (size_t i = start_idx; i < end_idx; ++i) {
            polynomial.at(i) = FF::random_element();
        }
        active_range_endpoints.emplace_back(start_idx, end_idx);
        start_idx += block_size;
        // If indicated, populate the active region complement with a random constant (mimicking z_perm)
        if (non_zero_complement) {
            FF const_random_coeff = FF::random_element();
            for (size_t i = end_idx; i < start_idx; ++i) {
                polynomial.at(i) = const_random_coeff;
            }
        }
    }

    return { polynomial, active_range_endpoints };
}

constexpr size_t MIN_LOG_NUM_POINTS = 16;
constexpr size_t MAX_LOG_NUM_POINTS = 20;
constexpr size_t MAX_NUM_POINTS = 1 << MAX_LOG_NUM_POINTS;
constexpr size_t SPARSE_NUM_NONZERO = 100;

// Commit to a zero polynomial
template <typename Curve> void bench_commit_zero(::benchmark::State& state)
{
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    const size_t num_points = 1 << state.range(0);
    const auto polynomial = Polynomial<typename Curve::ScalarField>(num_points);
    for (auto _ : state) {
        key.commit(polynomial);
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
        key.commit(polynomial);
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
        key.commit(polynomial);
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
        key.commit(polynomial);
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
        key.commit(polynomial);
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
        key.commit(polynomial);
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
        key.commit(polynomial);
    }
}

// Commit to a polynomial with block structured random entries using the basic commit method
template <typename Curve> void bench_commit_structured_random_poly(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    auto [polynomial, active_range_endpoints] = structured_random_poly<Fr>();

    for (auto _ : state) {
        key.commit(polynomial);
    }
}

// Commit to a polynomial with block structured random entries using commit_structured
template <typename Curve> void bench_commit_structured_random_poly_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    auto [polynomial, active_range_endpoints] = structured_random_poly<Fr>();

    for (auto _ : state) {
        key.commit_structured(polynomial, active_range_endpoints);
    }
}

// Commit to a polynomial with block structured random entries and constant valued complement
template <typename Curve> void bench_commit_mock_z_perm(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    auto [polynomial, active_range_endpoints] = structured_random_poly<Fr>(/*non_zero_complement=*/true);

    for (auto _ : state) {
        key.commit(polynomial);
    }
}

// Commit to a polynomial with block structured random entries and constant valued complement using tailored method
template <typename Curve> void bench_commit_mock_z_perm_preprocessed(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    auto key = create_commitment_key<Curve>(MAX_NUM_POINTS);

    auto [polynomial, active_range_endpoints] = structured_random_poly<Fr>(/*non_zero_complement=*/true);

    for (auto _ : state) {
        key.commit_structured_with_nonzero_complement(polynomial, active_range_endpoints);
    }
}

constexpr size_t MIN_LOG_NUM_GRUMPKIN_POINTS = 12;
constexpr size_t MAX_LOG_NUM_GRUMPKIN_POINTS = 16;
constexpr size_t MAX_NUM_GRUMPKIN_POINTS = 1 << MAX_LOG_NUM_GRUMPKIN_POINTS;

/**
 * @brief Benchmark pippenger_without_endomorphism_basis_points function, which is used notably in the IPA verifier.
 *
 * @tparam Curve
 * @param state
 */
template <typename Curve> void bench_pippenger_without_endomorphism_basis_points(::benchmark::State& state)
{
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto pcs_verification_key = std::make_shared<VerifierCommitmentKey<Curve>>(MAX_NUM_GRUMPKIN_POINTS + 1);

    for (auto _ : state) {
        state.PauseTiming();
        const size_t num_points = 1 << state.range(0);
        Polynomial<Fr> s_poly = Polynomial<Fr>::random(num_points);

        state.ResumeTiming();
        std::span<const Commitment> srs_elements = pcs_verification_key->get_monomial_points();
        std::vector<Commitment> G_vec_local(num_points);
        parallel_for_heuristic(
            num_points, [&](size_t i) { G_vec_local[i] = srs_elements[i * 2]; }, thread_heuristics::FF_COPY_COST * 2);

        // IPA MSM
        bb::scalar_multiplication::pippenger_unsafe<Curve>(s_poly, { &G_vec_local[0], num_points });
    }
}

BENCHMARK(bench_pippenger_without_endomorphism_basis_points<curve::Grumpkin>)
    ->DenseRange(MIN_LOG_NUM_GRUMPKIN_POINTS, MAX_LOG_NUM_GRUMPKIN_POINTS)
    ->Unit(benchmark::kMillisecond);

BENCHMARK(bench_commit_zero<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_preprocessed<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_random<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_sparse_random_preprocessed<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_random<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_random_non_power_of_2<curve::BN254>)
    ->DenseRange(MIN_LOG_NUM_POINTS, MAX_LOG_NUM_POINTS)
    ->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_structured_random_poly<curve::BN254>)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_structured_random_poly_preprocessed<curve::BN254>)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_mock_z_perm<curve::BN254>)->Unit(benchmark::kMillisecond);
BENCHMARK(bench_commit_mock_z_perm_preprocessed<curve::BN254>)->Unit(benchmark::kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
