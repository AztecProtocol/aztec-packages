#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <benchmark/benchmark.h>
#include <vector>

using namespace bb;
using Curve = curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

constexpr size_t BATCH_SIZE = 4;
constexpr size_t MIN_LOG_N = 19;
constexpr size_t MAX_LOG_N = 20;

template <typename Curve> CommitmentKey<Curve> create_commitment_key(const size_t num_points)
{
    BB_BENCH_NAME("SRS_Init");
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    return CommitmentKey<Curve>(num_points);
}

/**
 * @brief Benchmark multi-polynomial commitment strategies
 */
class MultiCommitBench : public benchmark::Fixture {
  public:
    std::shared_ptr<CommitmentKey<Curve>> commitment_key;
    std::array<Polynomial<Fr>, BATCH_SIZE> polys;
    Polynomial<Fr> interleaved_poly;

    void SetUp(const ::benchmark::State& state) override
    {
        BB_BENCH_NAME("Setup");

        size_t log_n = static_cast<size_t>(state.range(0));
        size_t n = 1UL << log_n;
        size_t srs_size = n * BATCH_SIZE;

        {
            BB_BENCH_NAME("SRS_Load");
            bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
            commitment_key = std::make_shared<CommitmentKey<Curve>>(srs_size);
        }

        {
            BB_BENCH_NAME("PolyGen_Random");
            for (size_t i = 0; i < BATCH_SIZE; i++) {
                polys[i] = Polynomial<Fr>::random(n);
            }
        }

        {
            BB_BENCH_NAME("PolyGen_Interleave");
            interleaved_poly = Polynomial<Fr>(srs_size);
            for (size_t i = 0; i < BATCH_SIZE; i++) {
                for (size_t j = 0; j < n; j++) {
                    interleaved_poly.at((BATCH_SIZE * j) + i) = polys[i].at(j);
                }
            }
        }
    }
};

/**
 * @brief Baseline: Full polynomial commitment (interleaved)
 */
BENCHMARK_DEFINE_F(MultiCommitBench, FullCommitment)(benchmark::State& state)
{
    for (auto _ : state) {
        G1 result;
        {
            BB_BENCH_NAME("Full_Commit");
            result = commitment_key->commit(interleaved_poly);
        }
        benchmark::DoNotOptimize(result);
    }
}

/**
 * @brief Production: Interleaved MSM using pippenger_interleaved
 */
BENCHMARK_DEFINE_F(MultiCommitBench, InterleavedPippenger)(benchmark::State& state)
{
    size_t log_n = static_cast<size_t>(state.range(0));
    size_t n = 1UL << log_n;
    size_t total_size = n * BATCH_SIZE;

    for (auto _ : state) {
        G1 result;
        {
            BB_BENCH_NAME("InterleavedPip_Full");

            auto srs_points = commitment_key->get_monomial_points();

            // Create array of polynomial spans
            std::array<PolynomialSpan<const Fr>, BATCH_SIZE> chunk_spans = {
                PolynomialSpan<const Fr>(0, polys[0].coeffs()),
                PolynomialSpan<const Fr>(0, polys[1].coeffs()),
                PolynomialSpan<const Fr>(0, polys[2].coeffs()),
                PolynomialSpan<const Fr>(0, polys[3].coeffs())
            };

            {
                BB_BENCH_NAME("InterleavedPip_MSM");
                result = scalar_multiplication::pippenger_interleaved<Curve>(
                    std::span<const PolynomialSpan<const Fr>>{ chunk_spans.data(), BATCH_SIZE },
                    std::span<const G1>{ srs_points.data(), total_size },
                    BATCH_SIZE);
            }
        }
        benchmark::DoNotOptimize(result);
    }
}

/**
 * @brief Verify that chunked and full commitments are equal
 */
BENCHMARK_DEFINE_F(MultiCommitBench, VerifyEquality)(benchmark::State& state)
{
    size_t log_n = static_cast<size_t>(state.range(0));
    size_t n = 1UL << log_n;

    // Precompute SRS views
    std::array<std::vector<G1>, BATCH_SIZE> srs_views;
    auto srs_points = commitment_key->get_monomial_points();
    for (size_t i = 0; i < BATCH_SIZE; i++) {
        srs_views[i].reserve(n);
        for (size_t j = 0; j < n; j++) {
            srs_views[i].push_back(srs_points[(BATCH_SIZE * j) + i]);
        }
    }

    for (auto _ : state) {
        // Full commitment
        G1 full_commit = commitment_key->commit(interleaved_poly);

        // Chunked commitment
        G1 chunked_commit = G1::infinity();
        for (size_t i = 0; i < BATCH_SIZE; i++) {
            auto scalars = PolynomialSpan<const Fr>(0, polys[i].coeffs());
            auto chunk =
                scalar_multiplication::pippenger_unsafe<Curve>(scalars, std::span<const G1>{ srs_views[i].data(), n });
            chunked_commit = chunked_commit + chunk;
        }

        // Verify equality
        bool equal = (full_commit == chunked_commit);
        benchmark::DoNotOptimize(equal);
        if (!equal) {
            state.SkipWithError("Commitments not equal!");
        }
    }
}

BENCHMARK_REGISTER_F(MultiCommitBench, FullCommitment)->Unit(benchmark::kMillisecond)->DenseRange(MIN_LOG_N, MAX_LOG_N);

BENCHMARK_REGISTER_F(MultiCommitBench, InterleavedPippenger)
    ->Unit(benchmark::kMillisecond)
    ->DenseRange(MIN_LOG_N, MAX_LOG_N);

BENCHMARK_REGISTER_F(MultiCommitBench, VerifyEquality)->Unit(benchmark::kMillisecond)->DenseRange(MIN_LOG_N, MAX_LOG_N);

} // namespace

int main(int argc, char** argv)
{
    // Enable BB_BENCH profiling
    bb::detail::use_bb_bench = true;

    // Run benchmarks
    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

    // Print detailed profiling breakdown
    std::cout << "\n=== BB_BENCH Detailed Breakdown ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);

    return 0;
}
