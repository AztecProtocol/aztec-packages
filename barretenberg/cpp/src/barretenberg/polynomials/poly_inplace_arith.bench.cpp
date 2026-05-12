// Diagnostic benchmarks for Polynomial in-place arithmetic: operator+=,
// operator-=, and operator*=. Each operator is benched two ways:
//
//   _scalar  — raw scalar for-loop, no vectorized_for, no parallel_for.
//   _full    — Polynomial::operator(+/-/*)=, which now routes through
//              the *_chunk helper + parallel_for_heuristic + vectorized_for<5>.
//
// The _full / _scalar ratio is the production speedup from the SIMD path.
// On V8/Zen3 the ratio is meaningful; on wasmtime SIMD lowering is incomplete
// and the ratios understate the win.

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <benchmark/benchmark.h>
#include <cstring>

using namespace benchmark;
using bb::fr;
using bb::Polynomial;
using bb::PolynomialSpan;

constexpr size_t N = 1 << 16;

namespace {

// Pre-populate once: self_ref + other hold random data. Each bench iteration
// resets self to self_ref so accumulating values don't drift across iters.
struct PolyFixture {
    Polynomial<fr> self;
    Polynomial<fr> self_ref;
    Polynomial<fr> other;
    fr scaling;

    PolyFixture()
        : self(N, N, 0, Polynomial<fr>::DontZeroMemory::FLAG)
        , self_ref(N, N, 0, Polynomial<fr>::DontZeroMemory::FLAG)
        , other(N, N, 0, Polynomial<fr>::DontZeroMemory::FLAG)
        , scaling(fr::random_element())
    {
        for (size_t i = 0; i < N; ++i) {
            self_ref.at(i) = fr::random_element();
            other.at(i) = fr::random_element();
        }
        std::memcpy(self.data(), self_ref.data(), N * sizeof(fr));
    }

    void reset_self(State& state)
    {
        state.PauseTiming();
        std::memcpy(self.data(), self_ref.data(), N * sizeof(fr));
        state.ResumeTiming();
    }
};

// Correctness check (NOT timed): scalar reference vs Polynomial::operator
// for each of +=, -=, *= on identical inputs. Aborts before bench start
// if any output mismatches.
struct CorrectnessGuard {
    CorrectnessGuard()
    {
        constexpr size_t M = N;
        Polynomial<fr> a(M, M, 0, Polynomial<fr>::DontZeroMemory::FLAG);
        Polynomial<fr> a_ref(M, M, 0, Polynomial<fr>::DontZeroMemory::FLAG);
        Polynomial<fr> b(M, M, 0, Polynomial<fr>::DontZeroMemory::FLAG);
        for (size_t i = 0; i < M; ++i) {
            a.at(i) = fr::random_element();
            b.at(i) = fr::random_element();
        }
        const fr s = fr::random_element();

        auto check = [&](const char* label) {
            for (size_t i = 0; i < M; ++i) {
                if (!(a.at(i) == a_ref.at(i))) {
                    std::fprintf(stderr, "[POLY_INPLACE %s] mismatch at i=%zu\n", label, i);
                    std::abort();
                }
            }
        };

        // operator+=
        std::memcpy(a_ref.data(), a.data(), M * sizeof(fr));
        a += PolynomialSpan<const fr>{ 0, { b.data(), M } };
        for (size_t i = 0; i < M; ++i) {
            a_ref.at(i) = a_ref.at(i) + b.at(i);
        }
        check("+=");

        // operator-=
        std::memcpy(a_ref.data(), a.data(), M * sizeof(fr));
        a -= PolynomialSpan<const fr>{ 0, { b.data(), M } };
        for (size_t i = 0; i < M; ++i) {
            a_ref.at(i) = a_ref.at(i) - b.at(i);
        }
        check("-=");

        // operator*=
        std::memcpy(a_ref.data(), a.data(), M * sizeof(fr));
        a *= s;
        for (size_t i = 0; i < M; ++i) {
            a_ref.at(i) = a_ref.at(i) * s;
        }
        check("*=");
    }
};
static const CorrectnessGuard correctness_guard;

} // namespace

// =========================== operator+= ===========================

static void bench_plus_equals_scalar(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    for (auto _ : state) {
        f.reset_self(state);
        for (size_t i = 0; i < N; ++i) {
            self.at(i) = self.at(i) + other.at(i);
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_plus_equals_scalar);

static void bench_plus_equals_full(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    for (auto _ : state) {
        f.reset_self(state);
        self += PolynomialSpan<const fr>{ 0, { other.data(), N } };
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_plus_equals_full);

// =========================== operator-= ===========================

static void bench_minus_equals_scalar(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    for (auto _ : state) {
        f.reset_self(state);
        for (size_t i = 0; i < N; ++i) {
            self.at(i) = self.at(i) - other.at(i);
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_minus_equals_scalar);

static void bench_minus_equals_full(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    for (auto _ : state) {
        f.reset_self(state);
        self -= PolynomialSpan<const fr>{ 0, { other.data(), N } };
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_minus_equals_full);

// =========================== operator*= ===========================

static void bench_times_equals_scalar(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto scaling = f.scaling;
    for (auto _ : state) {
        f.reset_self(state);
        for (size_t i = 0; i < N; ++i) {
            self.at(i) = self.at(i) * scaling;
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_times_equals_scalar);

static void bench_times_equals_full(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto scaling = f.scaling;
    for (auto _ : state) {
        f.reset_self(state);
        self *= scaling;
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_times_equals_full);

BENCHMARK_MAIN();
