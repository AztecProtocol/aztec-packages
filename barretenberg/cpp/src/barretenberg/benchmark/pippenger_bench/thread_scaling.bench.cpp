/**
 * @brief Pippenger thread-scaling benchmark for heterogeneous scalar distributions.
 *
 * MSM::batch_multi_scalar_mul partitions work across threads by cumulative per-scalar
 * weight (see get_work_units in scalar_multiplication.cpp), where each scalar's weight
 * is ceil(bit_length / bits_per_slice) -- i.e. the number of nonzero c-bit slices it
 * contributes to bucket accumulation. Small scalars weigh less because their high-order
 * slices are zero and get filtered by the zero-bucket pre-sort. This benchmark exercises
 * pathological and typical bit-size distributions to verify thread scaling stays uniform.
 *
 * Distributions contrasted here:
 *   - Clustered:    first half small (32-bit), second half full random -- stresses the
 *                   weighted split; count-based partitioning would give half the threads
 *                   ~all of the heavy work.
 *   - UniformMixed: small/full randomly interleaved -- isolates heterogeneity alone.
 *   - AllFull:      all full random (z_perm-like baseline).
 *
 * Expected: all three scale comparably under the weighted partition.
 */
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <benchmark/benchmark.h>

#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

constexpr size_t MSM_SIZE = 1 << 20;

enum class Distribution { Clustered, UniformMixed, AllFull };

class ThreadScalingBench : public benchmark::Fixture {
  public:
    std::shared_ptr<bb::srs::factories::Crs<Curve>> srs;
    bb::numeric::RNG& engine = bb::numeric::get_debug_randomness();

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        if (srs) {
            return;
        }
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        srs = bb::srs::get_crs_factory<Curve>()->get_crs(MSM_SIZE);
    }

    // 32-bit "small" value -- mimics witness indices, booleans, limbs.
    // On BN254 (254-bit field) with ~14 bits per Pippenger slice, only the lowest
    // ~2-3 rounds produce nonzero slices for these scalars; the rest get filtered.
    Fr small_scalar() { return Fr(static_cast<uint64_t>(engine.get_random_uint32())); }
    Fr full_scalar() { return Fr::random_element(&engine); }

    std::vector<Fr> build_scalars(Distribution dist)
    {
        std::vector<Fr> scalars(MSM_SIZE);
        switch (dist) {
        case Distribution::Clustered:
            for (size_t i = 0; i < MSM_SIZE / 2; ++i) {
                scalars[i] = small_scalar();
            }
            for (size_t i = MSM_SIZE / 2; i < MSM_SIZE; ++i) {
                scalars[i] = full_scalar();
            }
            break;
        case Distribution::UniformMixed:
            for (size_t i = 0; i < MSM_SIZE; ++i) {
                scalars[i] = (engine.get_random_uint32() & 1U) ? small_scalar() : full_scalar();
            }
            break;
        case Distribution::AllFull:
            for (size_t i = 0; i < MSM_SIZE; ++i) {
                scalars[i] = full_scalar();
            }
            break;
        }
        return scalars;
    }
};

static void run_msm(ThreadScalingBench& fx, benchmark::State& state, Distribution dist)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));

    // Rebuild per-invocation of the bench is fine: scalars get mutated (Montgomery
    // round-trip) inside batch_multi_scalar_mul, and we want consistent input across iterations.
    std::vector<Fr> scalars = fx.build_scalars(dist);

    std::vector<std::span<Fr>> scalar_spans;
    std::vector<std::span<const G1>> point_spans;
    scalar_spans.emplace_back(scalars);
    point_spans.emplace_back(fx.srs->get_monomial_points().subspan(0, MSM_SIZE));

    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(point_spans, scalar_spans, false);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

BENCHMARK_DEFINE_F(ThreadScalingBench, Clustered)(benchmark::State& state)
{
    run_msm(*this, state, Distribution::Clustered);
}
BENCHMARK_DEFINE_F(ThreadScalingBench, UniformMixed)(benchmark::State& state)
{
    run_msm(*this, state, Distribution::UniformMixed);
}
BENCHMARK_DEFINE_F(ThreadScalingBench, AllFull)(benchmark::State& state)
{
    run_msm(*this, state, Distribution::AllFull);
}

static void ThreadSweep(benchmark::internal::Benchmark* b)
{
    for (int64_t t : { 1, 2, 4, 8 }) {
        b->Arg(t);
    }
}

BENCHMARK_REGISTER_F(ThreadScalingBench, Clustered)->Unit(benchmark::kMillisecond)->Apply(ThreadSweep);
BENCHMARK_REGISTER_F(ThreadScalingBench, UniformMixed)->Unit(benchmark::kMillisecond)->Apply(ThreadSweep);
BENCHMARK_REGISTER_F(ThreadScalingBench, AllFull)->Unit(benchmark::kMillisecond)->Apply(ThreadSweep);

} // namespace

BENCHMARK_MAIN();
