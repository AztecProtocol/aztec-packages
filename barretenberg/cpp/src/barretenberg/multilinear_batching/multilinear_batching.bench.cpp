/**
 * @brief Benchmarks for MultilinearBatching prover
 */
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "multilinear_batching_prover.hpp"
#include <benchmark/benchmark.h>

namespace {

using namespace bb;
using Flavor = MultilinearBatchingFlavor;
using FF = Flavor::FF;
using Polynomial = Flavor::Polynomial;
using Commitment = Flavor::Commitment;
using Transcript = Flavor::Transcript;

constexpr size_t MIN_LOG_N = 18;
constexpr size_t MAX_LOG_N = 21;

/**
 * @brief Create a valid claim with random polynomials of given size.
 * @param log_n Log of the polynomial size
 */
MultilinearBatchingProverClaim create_claim(size_t log_n)
{
    const size_t dyadic_size = 1UL << log_n;

    MultilinearBatchingProverClaim claim;

    // Challenge point (always VIRTUAL_LOG_N sized for padding)
    claim.challenge = std::vector<FF>(Flavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < Flavor::VIRTUAL_LOG_N; i++) {
        claim.challenge[i] = FF::random_element();
    }

    // Create polynomials
    claim.non_shifted_polynomial = Polynomial(dyadic_size);
    claim.shifted_polynomial = Polynomial::shiftable(dyadic_size);

    // Fill with random values (shifted poly has 0 at index 0)
    claim.non_shifted_polynomial.at(0) = FF::random_element();
    for (size_t i = 1; i < dyadic_size; i++) {
        claim.non_shifted_polynomial.at(i) = FF::random_element();
        claim.shifted_polynomial.at(i) = FF::random_element();
    }

    // Random commitments (we don't verify them in benchmarks)
    claim.non_shifted_commitment = Commitment::random_element();
    claim.shifted_commitment = Commitment::random_element();

    // Compute evaluations using eq polynomial
    auto eq_polynomial = ProverEqPolynomial<FF>::construct(claim.challenge, log_n);

    claim.non_shifted_evaluation = FF::zero();
    for (size_t i = 0; i < dyadic_size; i++) {
        claim.non_shifted_evaluation += claim.non_shifted_polynomial.at(i) * eq_polynomial.at(i);
    }

    auto shifted = claim.shifted_polynomial.shifted();
    claim.shifted_evaluation = FF::zero();
    for (size_t i = 0; i < dyadic_size; i++) {
        claim.shifted_evaluation += shifted.at(i) * eq_polynomial.at(i);
    }

    claim.dyadic_size = dyadic_size;
    return claim;
}

/**
 * @brief Fixture for MultilinearBatching benchmarks
 */
class MultilinearBatchingBench : public benchmark::Fixture {
  public:
    std::unique_ptr<MultilinearBatchingProverClaim> accumulator_claim;
    std::unique_ptr<MultilinearBatchingProverClaim> instance_claim;

    void SetUp(const ::benchmark::State& state) override
    {
        size_t log_n = static_cast<size_t>(state.range(0));
        accumulator_claim = std::make_unique<MultilinearBatchingProverClaim>(create_claim(log_n));
        instance_claim = std::make_unique<MultilinearBatchingProverClaim>(create_claim(log_n));
    }

    void TearDown(const ::benchmark::State& /*state*/) override
    {
        accumulator_claim.reset();
        instance_claim.reset();
    }
};

/**
 * @brief Benchmark MultilinearBatching proof construction
 */
BENCHMARK_DEFINE_F(MultilinearBatchingBench, Prove)(benchmark::State& state)
{
    for (auto _ : state) {
        state.PauseTiming();
        // Create fresh copies for each iteration (claims are moved)
        auto acc = create_claim(static_cast<size_t>(state.range(0)));
        auto inst = create_claim(static_cast<size_t>(state.range(0)));
        auto transcript = std::make_shared<Transcript>();
        state.ResumeTiming();

        MultilinearBatchingProver prover(std::move(acc), std::move(inst), transcript);
        auto proof = prover.construct_proof();
        auto new_claim = prover.compute_new_claim();

        benchmark::DoNotOptimize(proof);
        benchmark::DoNotOptimize(new_claim);
    }
}

BENCHMARK_REGISTER_F(MultilinearBatchingBench, Prove)->DenseRange(MIN_LOG_N, MAX_LOG_N)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
