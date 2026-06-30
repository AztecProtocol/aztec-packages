// Diagnostic benchmarks for Polynomial::add_scaled.
//
// Four variants all doing self[i] = self[i] + other[i] * scaling for
// i in [0, N), same inputs, same pre-randomized reference buffer copied
// into self at the start of each iteration so accumulating values don't
// drift across iterations:
//
//   bench_add_scaled_scalar              — raw scalar for-loop, no
//                                          vectorized_for, no parallel_for.
//   bench_add_scaled_vectorized_inline   — single vectorized_for<bb::VECTOR_FIELD_WIDTH> call
//                                          over [0, N), uses Polynomial's
//                                          token overloads. Routes through
//                                          ContiguousVectorIndex<5> /
//                                          load_contiguous /
//                                          store_contiguous (NOT gather).
//   bench_add_scaled_vector_field_raw    — ceiling: hand-written loop on
//                                          raw bb::fr* calling
//                                          load_contiguous /
//                                          store_contiguous directly,
//                                          mirroring what
//                                          ContiguousVectorIndex emits.
//                                          The delta vs vectorized_inline
//                                          is the abstraction tax.
//   bench_add_scaled_full                — Polynomial::add_scaled, which
//                                          routes through add_scaled_chunk
//                                          + parallel_for + vectorized_for<bb::VECTOR_FIELD_WIDTH>.
//
// Ratios of interest:
//   scalar / vectorized_inline           — real vectorization speedup
//   scalar / vector_field_raw            — ceiling speedup
//   vectorized_inline / vector_field_raw — abstraction tax (target: ~1.0x)
//   full / vectorized_inline             — parallel_for overhead
//
// Last measured (wasmtime 20, BN254 Fr, N = 1<<16):
//   scalar            ~ 3.99 ms
//   vectorized_inline ~ 4.37 ms  (0.91× scalar)
//   vector_field_raw  ~ 4.36 ms  (0.91× scalar — ceiling)
//   full              ~ 4.65 ms  (0.86× scalar — parallel_for ~5% overhead)
// Abstraction tax: vectorized_inline / vector_field_raw ≈ 1.00× (no tax).
// The 0.91× ratio vs scalar is the irreducible AoS↔interleaved transpose
// cost over a 1-op-per-block kernel (mul + add); on V8/Zen3 the underlying
// primitive speedups are larger so add_scaled vectorized comfortably exceeds
// scalar there.

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"
#include "barretenberg/ecc/fields/vectorized_for.hpp"
#include "barretenberg/polynomials/broadcast.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <array>
#include <benchmark/benchmark.h>
#include <cstring>

using namespace benchmark;
using bb::fr;
using bb::Polynomial;
using bb::PolynomialSpan;
using bb::VectorField;
using bb::vectorized_for;

// Polynomial size for each benchmark. 2^16 gives a reasonably sized inner
// loop while keeping the total benchmark time modest.
constexpr size_t N = 1 << 16;

namespace {

// Pre-populate once: `self_ref` and `other` hold random data; each bench
// iteration starts by memcpy'ing `self_ref -> self` so accumulating values
// don't saturate across iterations.
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

    // Reset self to the pre-randomized reference state without timing.
    void reset_self(State& state)
    {
        state.PauseTiming();
        std::memcpy(self.data(), self_ref.data(), N * sizeof(fr));
        state.ResumeTiming();
    }
};

// Correctness check (NOT timed): compute add_scaled via the scalar loop and
// via Polynomial::add_scaled (the vectorised production path) on identical
// inputs, then assert all 65k field outputs match. If the bulk-transpose
// rewrite has a bit-level error this aborts before any benchmark runs.
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
        std::memcpy(a_ref.data(), a.data(), M * sizeof(fr));
        const fr s = fr::random_element();

        // Production path.
        a.add_scaled(PolynomialSpan<const fr>{ 0, { b.data(), M } }, s);

        // Reference scalar path.
        for (size_t i = 0; i < M; ++i) {
            a_ref.at(i) = a_ref.at(i) + b.at(i) * s;
        }

        for (size_t i = 0; i < M; ++i) {
            if (!(a.at(i) == a_ref.at(i))) {
                std::fprintf(stderr, "[ADD_SCALED CORRECTNESS] mismatch at i=%zu\n", i);
                std::abort();
            }
        }
    }
};
static const CorrectnessGuard correctness_guard;
} // namespace

static void bench_add_scaled_scalar(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;
    for (auto _ : state) {
        f.reset_self(state);
        for (size_t i = 0; i < N; ++i) {
            self.at(i) = self.at(i) + other.at(i) * scaling;
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_add_scaled_scalar);

static void bench_add_scaled_vectorized_inline(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;
    // Mirror Polynomial::add_scaled_chunk: hoist the scalar->VectorField
    // broadcast out of the loop via `Broadcast<Fr>`, so the same
    // `scaling_b[ctx]` expression yields the right-typed multiplicand for
    // the bulk and tail iterations.
    bb::Broadcast<fr> scaling_b(scaling);
    for (auto _ : state) {
        f.reset_self(state);
        vectorized_for<bb::VECTOR_FIELD_WIDTH, fr>(
            0, N, [&](auto ctx) { self[ctx] = self[ctx] + other[ctx] * scaling_b[ctx]; });
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_add_scaled_vectorized_inline);

static void bench_add_scaled_vector_field_raw(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;

    using Vec = VectorField<fr::Params>;
    // Inline 5-wide per-block ceiling: hand-written loop using the
    // linear-memory VectorField ctor (`Vec(fr*)`) and its matching write
    // method (`store_to`). Per-iter transpose. The bulk-transposed path
    // (Polynomial::add_scaled) has a higher ceiling.
    Vec scaling_v = Vec::broadcast(scaling);

    for (auto _ : state) {
        f.reset_self(state);
        fr* s = self.data();
        const fr* o = other.data();
        size_t i = 0;
        for (; i + 5 <= N; i += 5) {
            Vec sv(s + i);
            Vec ov(o + i);
            (sv + ov * scaling_v).store_to(s + i);
        }
        // Tail (N % 5 elements). For N = 65536 this is 1 iteration.
        for (; i < N; ++i) {
            s[i] = s[i] + o[i] * scaling;
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_add_scaled_vector_field_raw);

// Bulk-transpose variant: lift the AoS↔interleaved transpose out of the
// inner kernel so each polynomial is converted exactly once per call, and
// the inner loop runs on already-interleaved VectorField slots.
//
// The math identity is unchanged. The point of this variant is to measure
// what `Polynomial::add_scaled` looks like when transpose cost is paid in
// streaming bulk passes that V8/TurboFan can vectorize, instead of being
// folded into each 5-field iteration.
static void bench_add_scaled_bulk_transpose(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;
    constexpr size_t tail_count = N % 5;

    // Persistent scratch — one allocation, reused across bench iterations.
    // Hoist the raw data pointer outside the inner loop so V8/TurboFan
    // doesn't re-read std::vector's _M_start on every block (matches what
    // Polynomial::add_scaled_chunk does internally).
    std::vector<Vec> self_inter(bulk_count);
    std::vector<Vec> other_inter(bulk_count);
    Vec* self_buf = self_inter.data();
    Vec* other_buf = other_inter.data();
    Vec scaling_v = Vec::broadcast(scaling);

    for (auto _ : state) {
        f.reset_self(state);
        fr* s = self.data();
        const fr* o = other.data();

        // Pass 1: pre-transpose self → interleaved scratch via the
        // linear-memory ctor.
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = Vec(s + i * 5);
        }
        // Pass 2: pre-transpose other → interleaved scratch.
        for (size_t i = 0; i < bulk_count; ++i) {
            other_buf[i] = Vec(o + i * 5);
        }
        // Pass 3 (kernel): operate entirely on interleaved data — no
        // transpose in the inner loop.
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = self_buf[i] + other_buf[i] * scaling_v;
        }
        // Pass 4: post-transpose self ← interleaved scratch via store_to.
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i].store_to(s + i * 5);
        }
        // Tail.
        for (size_t i = bulk_count * 5; i < N; ++i) {
            s[i] = s[i] + o[i] * scaling;
        }
        DoNotOptimize(self.at(0));
        (void)tail_count;
    }
}
BENCHMARK(bench_add_scaled_bulk_transpose);

static void bench_add_scaled_full(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;
    for (auto _ : state) {
        f.reset_self(state);
        self.add_scaled(PolynomialSpan<const fr>{ 0, { other.data(), N } }, scaling);
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_add_scaled_full);

// Kernel-only ceiling: both self and other already in 5-wide interleaved
// layout, time only the inner mul+add pass. No AoS↔interleaved transpose
// in the timed window. This is the upper bound `Polynomial::add_scaled`
// could reach if Polynomial natively stored its data in the 5-wide
// interleaved layout (the spec's "larger architectural change").
//
// self_inter is *not* reset between iterations — the math drifts across
// iterations, but every iteration performs the exact same SIMD work, so
// per-iteration timing is meaningful. PauseTiming/ResumeTiming for a
// per-iter reset added ~17 % overhead in V8 — this bench is a CEILING
// DIAGNOSTIC only, not a correctness measurement.
static void bench_add_scaled_kernel_only(State& state)
{
    PolyFixture f;
    auto& other = f.other;
    auto scaling = f.scaling;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;

    std::vector<Vec> self_inter(bulk_count);
    std::vector<Vec> other_inter(bulk_count);
    Vec* self_buf = self_inter.data();
    Vec* other_buf = other_inter.data();
    Vec scaling_v = Vec::broadcast(scaling);
    {
        const fr* s = f.self_ref.data();
        const fr* o = other.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = Vec(s + i * 5);
            other_buf[i] = Vec(o + i * 5);
        }
    }

    for (auto _ : state) {
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = self_buf[i] + other_buf[i] * scaling_v;
        }
        DoNotOptimize(self_buf[0]);
    }
}
BENCHMARK(bench_add_scaled_kernel_only);

// Kernel + write-back ceiling: both self and other already in 5-wide
// interleaved layout; the timed window contains the kernel pass plus the
// AoS write-back pass that untransposes self into the Polynomial buffer.
// This is the upper bound `add_scaled` could reach if `other` is already
// interleaved (cached across many calls) and only `self` needs to be
// flushed back to AoS at the end of the call. Same ceiling-diagnostic
// caveat as `kernel_only` — self_inter drifts but per-iter SIMD work is
// constant.
static void bench_add_scaled_kernel_plus_writeback(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;
    auto scaling = f.scaling;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;

    std::vector<Vec> self_inter(bulk_count);
    std::vector<Vec> other_inter(bulk_count);
    Vec* self_buf = self_inter.data();
    Vec* other_buf = other_inter.data();
    Vec scaling_v = Vec::broadcast(scaling);
    {
        const fr* s = f.self_ref.data();
        const fr* o = other.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = Vec(s + i * 5);
            other_buf[i] = Vec(o + i * 5);
        }
    }

    for (auto _ : state) {
        fr* s = self.data();
        // Kernel pass.
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i] = self_buf[i] + other_buf[i] * scaling_v;
        }
        // Write-back pass.
        for (size_t i = 0; i < bulk_count; ++i) {
            self_buf[i].store_to(s + i * 5);
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_add_scaled_kernel_plus_writeback);

// Isolated load: time JUST the AoS → 9×29 interleaved conversion. No math,
// no kernel, no store. Each iteration runs 13107 invocations of the
// linear-memory `Vec(const fr*)` ctor over the same self/other buffers.
// This is the conversion microbench the user asked for.
static void bench_load_contiguous_only(State& state)
{
    PolyFixture f;
    auto& self = f.self;
    auto& other = f.other;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;

    std::vector<Vec> sink(bulk_count);
    Vec* sink_buf = sink.data();

    for (auto _ : state) {
        const fr* s = self.data();
        const fr* o = other.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            sink_buf[i] = Vec(s + i * 5);
        }
        for (size_t i = 0; i < bulk_count; ++i) {
            sink_buf[i] = Vec(o + i * 5);
        }
        DoNotOptimize(sink_buf[0]);
    }
}
BENCHMARK(bench_load_contiguous_only);

// Isolated store: time JUST the 9×29 interleaved → AoS conversion.
// 13107 invocations of `store_to` per iteration.
static void bench_store_contiguous_only(State& state)
{
    PolyFixture f;
    auto& self = f.self;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;

    std::vector<Vec> src(bulk_count);
    Vec* src_buf = src.data();
    {
        const fr* s = f.self_ref.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            src_buf[i] = Vec(s + i * 5);
        }
    }

    for (auto _ : state) {
        fr* s = self.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            src_buf[i].store_to(s + i * 5);
        }
        DoNotOptimize(self.at(0));
    }
}
BENCHMARK(bench_store_contiguous_only);

// Memory-bandwidth floor: pure 160-byte (5×fr) → 192-byte (sizeof Vec)
// memcpy. No bit work at all. Whatever load_contiguous costs ABOVE this is
// the conversion-compute overhead the user wants reduced.
static void bench_memcpy_only(State& state)
{
    PolyFixture f;
    auto& self = f.self;

    using Vec = VectorField<fr::Params>;
    constexpr size_t bulk_count = N / 5;

    std::vector<Vec> sink(bulk_count);
    Vec* sink_buf = sink.data();

    for (auto _ : state) {
        const fr* s = self.data();
        for (size_t i = 0; i < bulk_count; ++i) {
            std::memcpy(&sink_buf[i], s + i * 5, sizeof(fr) * 5);
        }
        DoNotOptimize(sink_buf[0]);
    }
}
BENCHMARK(bench_memcpy_only);

BENCHMARK_MAIN();
