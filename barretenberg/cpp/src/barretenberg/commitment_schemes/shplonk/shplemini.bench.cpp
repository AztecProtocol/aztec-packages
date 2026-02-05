/**
 * @brief Benchmarks for Shplemini prover with 1 unshifted and 1 shifted polynomial
 */
#include "shplemini.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/utils/mock_witness_generator.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <benchmark/benchmark.h>

namespace {

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using ShpleminiProver = bb::ShpleminiProver_<Curve>;
using KZG = bb::KZG<Curve>;

constexpr size_t MIN_LOG_N = 18;
constexpr size_t MAX_LOG_N = 21;
constexpr size_t MAX_N = 1 << MAX_LOG_N;

// Number of polynomials: 1 unshifted + 1 to-be-shifted (the to-be-shifted also has an unshifted counterpart)
constexpr size_t NUM_POLYNOMIALS = 2;
constexpr size_t NUM_TO_BE_SHIFTED = 1;

/**
 * @brief Fixture for Shplemini benchmarks - handles setup outside of timing
 */
class ShpleminiBench : public benchmark::Fixture {
  public:
    std::shared_ptr<bb::CommitmentKey<Curve>> commitment_key;
    std::unique_ptr<bb::MockClaimGenerator<Curve>> mock_claims;
    std::vector<Fr> mle_opening_point;
    size_t n;

    void SetUp(const ::benchmark::State& state) override
    {
        size_t log_n = static_cast<size_t>(state.range(0));
        n = 1UL << log_n;

        // Initialize SRS and create commitment key
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        commitment_key = std::make_shared<bb::CommitmentKey<Curve>>(MAX_N);

        // Generate random evaluation point
        mle_opening_point.resize(log_n);
        for (size_t l = 0; l < log_n; ++l) {
            mle_opening_point[l] = Fr::random_element();
        }

        // Generate mock claim data: 1 unshifted + 1 shifted polynomial (both random dense)
        mock_claims = std::make_unique<bb::MockClaimGenerator<Curve>>(
            n, NUM_POLYNOMIALS, NUM_TO_BE_SHIFTED, mle_opening_point, *commitment_key);
    }

    void TearDown(const ::benchmark::State& /*state*/) override
    {
        mock_claims.reset();
        commitment_key.reset();
        mle_opening_point.clear();
    }
};

/**
 * @brief Benchmark Shplemini proving with 1 unshifted and 1 shifted polynomial (both random dense)
 */
BENCHMARK_DEFINE_F(ShpleminiBench, Prove)(benchmark::State& state)
{
    for (auto _ : state) {
        // Create transcript (very cheap, no need to pause timing)
        auto prover_transcript = bb::NativeTranscript::test_prover_init_empty();

        // Run Shplemini prover (without ZK, no libra polynomials)
        auto opening_claim = ShpleminiProver::prove(
            n, mock_claims->polynomial_batcher, mle_opening_point, *commitment_key, prover_transcript);

        benchmark::DoNotOptimize(opening_claim);
    }
}

/**
 * @brief Benchmark full PCS flow: Shplemini + KZG opening proof
 */
BENCHMARK_DEFINE_F(ShpleminiBench, ProveWithKZG)(benchmark::State& state)
{
    for (auto _ : state) {
        auto prover_transcript = bb::NativeTranscript::test_prover_init_empty();

        // Run Shplemini prover
        auto opening_claim = ShpleminiProver::prove(
            n, mock_claims->polynomial_batcher, mle_opening_point, *commitment_key, prover_transcript);

        // Run KZG opening proof
        KZG::compute_opening_proof(*commitment_key, opening_claim, prover_transcript);

        benchmark::DoNotOptimize(prover_transcript);
    }
}

BENCHMARK_REGISTER_F(ShpleminiBench, Prove)->DenseRange(MIN_LOG_N, MAX_LOG_N)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ShpleminiBench, ProveWithKZG)->DenseRange(MIN_LOG_N, MAX_LOG_N)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
