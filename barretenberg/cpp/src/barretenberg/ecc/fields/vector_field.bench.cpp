// Benchmarks VectorField's batched q1s1 kernels (5 fields/call: 1 scalar + 1
// quad) against the plain field<Bn254FrParams> baseline (1 field/op).
//
// Reports ns/field so the speedup number is directly comparable to the
// field-bench-v2 gist (https://gist.github.com/AztecBot/2ad5f310fd0e8a3badda33487f4536ff):
//
//   Gist s1q1 on Zen3+V8: add 4.35 ns/field (2.11×), sub 4.53 (2.04×),
//                         eq 5.53 (2.01×), is_zero 1.51 (1.24×).
//
// Run on WASM via `benchmark_wasm_remote.sh vector_field_bench` for V8
// numbers; run locally for native-x86_64 numbers (no speedup expected on
// native since there's no SIMD code path wired in for native yet).

#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <array>
#include <benchmark/benchmark.h>

using namespace benchmark;
using bb::fr;
using Vec = bb::VectorField<bb::Bn254FrParams>;

// How many ops per benchmark iteration. Loop runs ITERATIONS ops, so
// per-op time = reported time / ITERATIONS.
static constexpr int64_t ITERATIONS = 256;

// ---------------------------------------------------------------------------
// Baselines: plain field<>.  Each iteration of the outer loop does
// ITERATIONS * 5 scalar ops so the reported time is directly comparable to
// the batched kernel (which does ITERATIONS calls × 5 fields/call).
// ---------------------------------------------------------------------------

static void bench_scalar_add(State& state)
{
    fr a[5];
    fr b[5];
    for (size_t i = 0; i < 5; ++i) {
        a[i] = fr::random_element();
        b[i] = fr::random_element();
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            for (size_t i = 0; i < 5; ++i) {
                a[i] = a[i] + b[i];
                DoNotOptimize(a[i]);
            }
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_scalar_add);

static void bench_scalar_sub(State& state)
{
    fr a[5];
    fr b[5];
    for (size_t i = 0; i < 5; ++i) {
        a[i] = fr::random_element();
        b[i] = fr::random_element();
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            for (size_t i = 0; i < 5; ++i) {
                a[i] = a[i] - b[i];
                DoNotOptimize(a[i]);
            }
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_scalar_sub);

static void bench_scalar_mul(State& state)
{
    fr a[5];
    fr b[5];
    for (size_t i = 0; i < 5; ++i) {
        a[i] = fr::random_element();
        b[i] = fr::random_element();
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            for (size_t i = 0; i < 5; ++i) {
                a[i] = a[i] * b[i];
                DoNotOptimize(a[i]);
            }
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_scalar_mul);

static void bench_scalar_eq(State& state)
{
    fr a[5];
    fr b[5];
    for (size_t i = 0; i < 5; ++i) {
        a[i] = fr::random_element();
        b[i] = fr::random_element();
    }
    volatile int sink = 0;
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            int s = 0;
            for (size_t i = 0; i < 5; ++i) {
                s += (a[i] == b[i]) ? 1 : 0;
            }
            sink += s;
            DoNotOptimize(sink);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_scalar_eq);

static void bench_scalar_is_zero(State& state)
{
    fr a[5];
    for (size_t i = 0; i < 5; ++i) {
        a[i] = fr::random_element();
    }
    a[2] = fr::zero(); // make one zero to keep branch prediction honest
    volatile int sink = 0;
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            int s = 0;
            for (size_t i = 0; i < 5; ++i) {
                s += a[i].is_zero() ? 1 : 0;
            }
            sink += s;
            DoNotOptimize(sink);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_scalar_is_zero);

// ---------------------------------------------------------------------------
// VectorField batched kernels. Same total work per iteration as the
// baselines (ITERATIONS * 5 fields), but issued as ITERATIONS batch calls.
// ---------------------------------------------------------------------------

static void bench_vector_add(State& state)
{
    std::array<fr, 5> a_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec a(a_in), b(b_in);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            a = a + b;
            DoNotOptimize(a);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_add);

static void bench_vector_sub(State& state)
{
    std::array<fr, 5> a_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec a(a_in), b(b_in);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            a = a - b;
            DoNotOptimize(a);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_sub);

static void bench_vector_mul(State& state)
{
    std::array<fr, 5> a_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec a(a_in), b(b_in);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            a = a * b;
            DoNotOptimize(a);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_mul);

static void bench_vector_eq(State& state)
{
    std::array<fr, 5> a_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b_in{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec a(a_in), b(b_in);
    volatile uint32_t sink = 0;
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            sink += a.eq_mask(b);
            DoNotOptimize(sink);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_eq);

static void bench_vector_is_zero(State& state)
{
    std::array<fr, 5> a_in{ fr::zero(), fr::random_element(), fr::zero(), fr::random_element(), fr::zero() };
    Vec a(a_in);
    volatile uint32_t sink = 0;
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            sink += a.is_zero_mask();
            DoNotOptimize(sink);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_is_zero);

BENCHMARK_MAIN();
