/**
 * @brief CPU vs GPU MSM benchmarks over the real (file) SRS.
 *
 * Mirrors the PippengerUnsafe sizes from benchmark/pippenger_bench so GPU numbers are
 * directly comparable, and adds the AVM-shaped batch (32 polys x 2^19). Two GPU
 * variants: one-shot (points cross PCIe every call) and resident (points uploaded once
 * via the context cache — the realistic prover pattern; per-call cost is scalar staging
 * + scalar transfer + kernels).
 */
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/ecc_gpu/bb_msm_gpu.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <benchmark/benchmark.h>

#include <cstdint>
#include <vector>

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;
namespace gpu = bb::scalar_multiplication::gpu;

namespace {

constexpr size_t MIN_POINTS_LOG2 = 14;
constexpr size_t MAX_POINTS_LOG2 = 22;

class PippengerGpuBench : public benchmark::Fixture {
  public:
    static constexpr size_t MAX_POINTS = 1 << MAX_POINTS_LOG2;
    std::shared_ptr<bb::srs::factories::Crs<Curve>> srs;
    std::vector<Fr> scalars;
    bb::numeric::RNG& engine = bb::numeric::get_debug_randomness();

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        srs = bb::srs::get_crs_factory<Curve>()->get_crs(MAX_POINTS);

        scalars.resize(MAX_POINTS);
        for (auto& x : scalars) {
            x = Fr::random_element(&engine);
        }
    }

    bb::PolynomialSpan<const Fr> scalar_span(size_t n) { return { 0, { scalars.data(), n } }; }
    std::span<const G1> points(size_t n) { return srs->get_monomial_points().subspan(0, n); }
};

} // namespace

BENCHMARK_DEFINE_F(PippengerGpuBench, CpuPippengerUnsafe)(benchmark::State& state)
{
    const auto n = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        DoNotOptimize(bb::scalar_multiplication::pippenger_unsafe<Curve>(scalar_span(n), points(n)));
    }
}

BENCHMARK_DEFINE_F(PippengerGpuBench, GpuOneshot)(benchmark::State& state)
{
    if (!gpu::msm_available()) {
        state.SkipWithError("no CUDA device available");
        return;
    }
    const auto n = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        DoNotOptimize(gpu::pippenger_bn254_oneshot(scalar_span(n), points(n)));
    }
}

BENCHMARK_DEFINE_F(PippengerGpuBench, GpuResident)(benchmark::State& state)
{
    if (!gpu::msm_available()) {
        state.SkipWithError("no CUDA device available");
        return;
    }
    const auto n = static_cast<size_t>(state.range(0));
    // Warm the context cache so the timed loop measures the resident-SRS pattern.
    Curve::Element out;
    if (!gpu::try_pippenger_bn254(out, scalar_span(n), points(n))) {
        state.SkipWithError("GPU MSM failed");
        return;
    }
    for (auto _ : state) {
        gpu::try_pippenger_bn254(out, scalar_span(n), points(n));
        DoNotOptimize(out);
    }
}

// AVM-shaped batch: 32 wire polynomials of size 2^19 against a shared resident SRS.
BENCHMARK_DEFINE_F(PippengerGpuBench, GpuBatch32x2e19)(benchmark::State& state)
{
    if (!gpu::msm_available()) {
        state.SkipWithError("no CUDA device available");
        return;
    }
    constexpr size_t NUM_POLYS = 32;
    constexpr size_t POLY_SIZE = 1 << 19;
    Curve::Element out;
    if (!gpu::try_pippenger_bn254(out, scalar_span(POLY_SIZE), points(POLY_SIZE))) {
        state.SkipWithError("GPU MSM failed");
        return;
    }
    for (auto _ : state) {
        for (size_t i = 0; i < NUM_POLYS; i++) {
            // Shift the scalar window per poly so successive MSMs aren't byte-identical.
            bb::PolynomialSpan<const Fr> span{
                0, { scalars.data() + i * ((MAX_POINTS - POLY_SIZE) / NUM_POLYS), POLY_SIZE }
            };
            gpu::try_pippenger_bn254(out, span, points(POLY_SIZE));
            DoNotOptimize(out);
        }
    }
}

BENCHMARK_REGISTER_F(PippengerGpuBench, CpuPippengerUnsafe)
    ->RangeMultiplier(2)
    ->Range(1 << MIN_POINTS_LOG2, 1 << MAX_POINTS_LOG2)
    ->Unit(kMillisecond);
BENCHMARK_REGISTER_F(PippengerGpuBench, GpuOneshot)
    ->RangeMultiplier(2)
    ->Range(1 << MIN_POINTS_LOG2, 1 << MAX_POINTS_LOG2)
    ->Unit(kMillisecond);
BENCHMARK_REGISTER_F(PippengerGpuBench, GpuResident)
    ->RangeMultiplier(2)
    ->Range(1 << MIN_POINTS_LOG2, 1 << MAX_POINTS_LOG2)
    ->Unit(kMillisecond);
BENCHMARK_REGISTER_F(PippengerGpuBench, GpuBatch32x2e19)->Unit(kMillisecond);

BENCHMARK_MAIN();
