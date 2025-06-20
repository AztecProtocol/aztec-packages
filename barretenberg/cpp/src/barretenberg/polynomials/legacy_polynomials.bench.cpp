// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/common/mem.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/ecc/groups/wnaf.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <benchmark/benchmark.h>
#include <vector>

using namespace benchmark;
using namespace bb;

constexpr size_t MAX_GATES = 1 << 20;
constexpr size_t START = (1 << 20) >> 7;

#define CIRCUIT_STATE_SIZE(x) ((x * 17 * sizeof(fr)) + (x * 3 * sizeof(uint32_t)))
#define FFT_SIZE(x) (x * 22 * sizeof(fr))

struct global_vars {
    std::vector<g1::affine_element> g1_pair_points;
    std::vector<g2::affine_element> g2_pair_points;
    std::span<g1::affine_element> monomials;
    g2::affine_element g2_x;
    std::vector<fr> data;
    std::vector<fr> scalars;
    std::vector<fr> roots;
    std::vector<fr> coefficients;
};

global_vars globals;

bb::evaluation_domain evaluation_domains[10]{ bb::evaluation_domain(START),       bb::evaluation_domain(START * 2),
                                              bb::evaluation_domain(START * 4),   bb::evaluation_domain(START * 8),
                                              bb::evaluation_domain(START * 16),  bb::evaluation_domain(START * 32),
                                              bb::evaluation_domain(START * 64),  bb::evaluation_domain(START * 128),
                                              bb::evaluation_domain(START * 256), bb::evaluation_domain(START * 512) };

void generate_scalars(fr* scalars)
{
    fr T0 = fr::random_element();
    fr acc;
    fr::__copy(T0, acc);
    for (size_t i = 0; i < MAX_GATES; ++i) {
        acc *= T0;
        fr::__copy(acc, scalars[i]);
    }
}

void generate_pairing_points(g1::affine_element* p1s, g2::affine_element* p2s)
{
    p1s[0] = g1::affine_element(g1::element::random_element());
    p1s[1] = g1::affine_element(g1::element::random_element());
    p2s[0] = g2::affine_element(g2::element::random_element());
    p2s[1] = g2::affine_element(g2::element::random_element());
}

constexpr size_t MAX_ROUNDS = 9;
const auto init = []() {
    info("generating test data");
    globals.g1_pair_points.resize(2);
    globals.g2_pair_points.resize(2);
    globals.scalars.resize(MAX_GATES * MAX_ROUNDS);
    globals.data.resize(8UL * 17 * MAX_GATES);
    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    globals.monomials = srs::get_bn254_crs_factory()->get_crs(MAX_GATES)->get_monomial_points();
    globals.g2_x = srs::get_bn254_crs_factory()->get_verifier_crs()->get_g2x();
    generate_pairing_points(globals.g1_pair_points.data(), globals.g2_pair_points.data());
    for (size_t i = 0; i < MAX_ROUNDS; ++i) {
        generate_scalars(globals.scalars.data() + i * MAX_GATES);
    }
    for (bb::evaluation_domain& evaluation_domain : evaluation_domains) {
        evaluation_domain.compute_lookup_table();
    }
    info("finished generating test data\n");
    return true;
}();

uint64_t rdtsc()
{
#ifdef __aarch64__
    uint64_t pmccntr;
    __asm__ __volatile__("mrs %0, pmccntr_el0" : "=r"(pmccntr));
    return pmccntr;
#elif __x86_64__
    unsigned int lo, hi;
    __asm__ __volatile__("rdtsc" : "=a"(lo), "=d"(hi));
    return ((uint64_t)hi << 32) | lo;
#else
    return 0;
#endif
}

constexpr size_t NUM_SQUARINGS = 10000000;
inline fq fq_sqr_asm(fq& a, fq& r) noexcept
{
    for (size_t i = 0; i < NUM_SQUARINGS; ++i) {
        r = a.sqr();
    }
    DoNotOptimize(r);
    return r;
}

constexpr size_t NUM_MULTIPLICATIONS = 10000000;
inline fq fq_mul_asm(fq& a, fq& r) noexcept
{
    for (size_t i = 0; i < NUM_MULTIPLICATIONS; ++i) {
        r = a * r;
    }
    DoNotOptimize(r);
    return r;
}

void pippenger_bench(State& state) noexcept
{
    for (auto _ : state) {
        const size_t num_points = static_cast<size_t>(state.range(0));
        state.PauseTiming();
        scalar_multiplication::pippenger_runtime_state<curve::BN254> run_state(num_points);
        state.ResumeTiming();
        scalar_multiplication::pippenger<curve::BN254>(
            { 0, { globals.scalars.data(), num_points } }, { globals.monomials.data(), num_points * 2 }, run_state);
    }
}
BENCHMARK(pippenger_bench)->RangeMultiplier(2)->Range(START, MAX_GATES)->Unit(benchmark::kMillisecond);

void new_plonk_scalar_multiplications_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t k = 0;
    for (auto _ : state) {
        state.PauseTiming();
        scalar_multiplication::pippenger_runtime_state<curve::BN254> run_state(MAX_GATES);
        state.ResumeTiming();

        uint64_t before = rdtsc();
        g1::element a = scalar_multiplication::pippenger<curve::BN254>(
            { 0, { globals.scalars.data(), MAX_GATES } }, { globals.monomials.data(), MAX_GATES }, run_state);
        g1::element b =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element c =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 2 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element d =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 3 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element e =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 4 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element f =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 5 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element g =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 6 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element h =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 7 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        g1::element i =
            scalar_multiplication::pippenger<curve::BN254>({ 0, { globals.scalars.data() + 8 * MAX_GATES, MAX_GATES } },
                                                           { globals.monomials.data(), MAX_GATES },
                                                           run_state);
        uint64_t after = rdtsc();
        count += (after - before);
        ++k;
        g1::element out;
        out.self_set_infinity();
        out = a + out;
        out = b + out;
        out = c + out;
        out = d + out;
        out = e + out;
        out = f + out;
        out = g + out;
        out = h + out;
        out = i + out;
    }
    uint64_t avg_cycles = count / k;
    printf("plonk clock cycles = %" PRIu64 "\n", (avg_cycles));
    printf("pippenger clock cycles = %" PRIu64 "\n", (avg_cycles / 9));
    printf("pippenger clock cycles per scalar mul = %" PRIu64 "\n", (avg_cycles / (9 * MAX_GATES)));
}
BENCHMARK(new_plonk_scalar_multiplications_bench)->Unit(benchmark::kMillisecond);

void coset_fft_bench_parallel(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = (size_t)numeric::get_msb((uint64_t)state.range(0)) - (size_t)numeric::get_msb(START);
        bb::polynomial_arithmetic::coset_fft(globals.data.data(), evaluation_domains[idx]);
    }
}
BENCHMARK(coset_fft_bench_parallel)->RangeMultiplier(2)->Range(START * 4, MAX_GATES * 4)->Unit(benchmark::kMicrosecond);

void alternate_coset_fft_bench_parallel(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = (size_t)numeric::get_msb((uint64_t)state.range(0)) - (size_t)numeric::get_msb(START);
        bb::polynomial_arithmetic::coset_fft(
            globals.data.data(), evaluation_domains[idx - 2], evaluation_domains[idx - 2], 4);
    }
}
BENCHMARK(alternate_coset_fft_bench_parallel)
    ->RangeMultiplier(2)
    ->Range(START * 4, MAX_GATES * 4)
    ->Unit(benchmark::kMicrosecond);

void fft_bench_parallel(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = (size_t)numeric::get_msb((uint64_t)state.range(0)) - (size_t)numeric::get_msb(START);
        bb::polynomial_arithmetic::fft(globals.data.data(), evaluation_domains[idx]);
    }
}
BENCHMARK(fft_bench_parallel)->RangeMultiplier(2)->Range(START * 4, MAX_GATES * 4)->Unit(benchmark::kMicrosecond);

void fft_bench_serial(State& state) noexcept
{
    for (auto _ : state) {
        size_t idx = (size_t)numeric::get_msb((uint64_t)state.range(0)) - (size_t)numeric::get_msb(START);
        bb::polynomial_arithmetic::fft_inner_serial(
            { globals.data.data() }, evaluation_domains[idx].thread_size, evaluation_domains[idx].get_round_roots());
    }
}
BENCHMARK(fft_bench_serial)->RangeMultiplier(2)->Range(START * 4, MAX_GATES * 4)->Unit(benchmark::kMicrosecond);

void pairing_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t i = 0;
    for (auto _ : state) {
        uint64_t before = rdtsc();
        DoNotOptimize(pairing::reduced_ate_pairing(globals.g1_pair_points[0], globals.g2_pair_points[0]));
        uint64_t after = rdtsc();
        count += (after - before);
        ++i;
    }
    uint64_t avg_cycles = count / i;
    printf("single pairing clock cycles = %" PRIu64 "\n", (avg_cycles));
}
BENCHMARK(pairing_bench);

void pairing_twin_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t i = 0;
    for (auto _ : state) {
        uint64_t before = rdtsc();
        DoNotOptimize(
            pairing::reduced_ate_pairing_batch(globals.g1_pair_points.data(), globals.g2_pair_points.data(), 2));
        uint64_t after = rdtsc();
        count += (after - before);
        ++i;
    }
    uint64_t avg_cycles = count / i;
    printf("twin pairing clock cycles = %" PRIu64 "\n", (avg_cycles));
}
BENCHMARK(pairing_twin_bench);

constexpr size_t NUM_G1_ADDITIONS = 10000000;
void add_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t j = 0;
    g1::element a = g1::element::random_element();
    g1::element b = g1::element::random_element();
    for (auto _ : state) {
        uint64_t before = rdtsc();
        for (size_t i = 0; i < NUM_G1_ADDITIONS; ++i) {
            a += b;
        }
        uint64_t after = rdtsc();
        count += (after - before);
        ++j;
    }
    printf("g1 add number of cycles = %" PRIu64 "\n", count / (j * NUM_G1_ADDITIONS));
}
BENCHMARK(add_bench);

void mixed_add_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t j = 0;
    g1::element a = g1::element::random_element();
    g1::affine_element b = g1::affine_element(g1::element::random_element());
    for (auto _ : state) {
        uint64_t before = rdtsc();
        for (size_t i = 0; i < NUM_G1_ADDITIONS; ++i) {
            a += b;
        }
        uint64_t after = rdtsc();
        count += (after - before);
        ++j;
    }
    printf("g1 mixed add number of cycles = %" PRIu64 "\n", count / (j * NUM_G1_ADDITIONS));
}
BENCHMARK(mixed_add_bench);

void fq_sqr_asm_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t i = 0;
    fq a{ 0x1122334455667788, 0x8877665544332211, 0x0123456701234567, 0x0efdfcfbfaf9f8f7 };
    fq r{ 1, 0, 0, 0 };
    for (auto _ : state) {
        uint64_t before = rdtsc();
        DoNotOptimize(fq_sqr_asm(a, r));
        uint64_t after = rdtsc();
        count += after - before;
        ++i;
    }
    printf("sqr number of cycles = %" PRIu64 "\n", count / (i * NUM_SQUARINGS));
}
BENCHMARK(fq_sqr_asm_bench);

void fq_mul_asm_bench(State& state) noexcept
{
    uint64_t count = 0;
    uint64_t i = 0;
    fq a{ 0x1122334455667788, 0x8877665544332211, 0x0123456701234567, 0x0efdfcfbfaf9f8f7 };
    fq r{ 1, 0, 0, 0 };
    for (auto _ : state) {
        uint64_t before = rdtsc();
        DoNotOptimize(fq_mul_asm(a, r));
        uint64_t after = rdtsc();
        count += after - before;
        ++i;
    }
    printf("mul number of cycles = %" PRIu64 "\n", count / (i * NUM_MULTIPLICATIONS));
}
BENCHMARK(fq_mul_asm_bench);

BENCHMARK_MAIN();
// 21218750000
