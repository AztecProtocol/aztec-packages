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
            sink += a.eq(b);
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
            sink += a.is_zero();
            DoNotOptimize(sink);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_is_zero);

// ---------------------------------------------------------------------------
// dot_product<K> — one batched Karatsuba product phase per pair, ONE Yuval
// reduction across the K-sum. Each iteration does ITERATIONS batch calls, each
// producing 5 fused dot-products (one per lane). Compared to K * ITERATIONS
// independent muls + (K-1) * ITERATIONS adds.
// ---------------------------------------------------------------------------

static void bench_vector_dot_product_K2(State& state)
{
    std::array<fr, 5> a0{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b0{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> a1{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b1{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec va0(a0), vb0(b0), va1(a1), vb1(b1);
    // Rotate the accumulator into one of the next iteration's slots so LLVM
    // can't hoist the call out of the loop.
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 2> pairs{ { { va0, vb0 }, { va1, vb1 } } };
            va0 = Vec::dot_product<2>(pairs);
            DoNotOptimize(va0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K2);

static void bench_vector_dot_product_K3(State& state)
{
    std::array<fr, 5> a0{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b0{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> a1{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b1{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> a2{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    std::array<fr, 5> b2{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec va0(a0), vb0(b0), va1(a1), vb1(b1), va2(a2), vb2(b2);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 3> pairs{ { { va0, vb0 }, { va1, vb1 }, { va2, vb2 } } };
            va0 = Vec::dot_product<3>(pairs);
            DoNotOptimize(va0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K3);

static void bench_vector_dot_product_K4(State& state)
{
    std::array<Vec, 4> a, b;
    for (size_t k = 0; k < 4; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 4> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] } }
            };
            a[0] = Vec::dot_product<4>(pairs);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K4);

static void bench_vector_dot_product_K5(State& state)
{
    std::array<Vec, 5> a, b;
    for (size_t k = 0; k < 5; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 5> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] }, { a[4], b[4] } }
            };
            a[0] = Vec::dot_product<5>(pairs);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K5);

static void bench_vector_dot_product_K6(State& state)
{
    std::array<Vec, 6> a, b;
    for (size_t k = 0; k < 6; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 6> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] }, { a[4], b[4] }, { a[5], b[5] } }
            };
            a[0] = Vec::dot_product<6>(pairs);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K6);

// ---------------------------------------------------------------------------
// dot_product<K, M> — K pair muls + M linear adds folded into one kernel's
// post-Yuval carry chain. Compared against the naive alternative of
// dot_product<K> followed by M independent operator+ calls.
// ---------------------------------------------------------------------------

static void bench_vector_dot_product_K3_M2(State& state)
{
    std::array<Vec, 3> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 3; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 3> pairs{ { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] } } };
            std::array<Vec, 2> linears{ c[0], c[1] };
            a[0] = Vec::dot_product<3, 2>(pairs, linears);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K3_M2);

static void bench_vector_dot_product_K2_M4(State& state)
{
    std::array<Vec, 2> a, b;
    std::array<Vec, 4> c;
    for (size_t k = 0; k < 2; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 4; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 2> pairs{ { { a[0], b[0] }, { a[1], b[1] } } };
            std::array<Vec, 4> linears{ c[0], c[1], c[2], c[3] };
            a[0] = Vec::dot_product<2, 4>(pairs, linears);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K2_M4);

static void bench_vector_dot_product_K1_M5(State& state)
{
    Vec a0, b0;
    std::array<Vec, 5> c;
    {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a0 = Vec(av);
        b0 = Vec(bv);
    }
    for (size_t j = 0; j < 5; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 1> pairs{ { { a0, b0 } } };
            std::array<Vec, 5> linears{ c[0], c[1], c[2], c[3], c[4] };
            a0 = Vec::dot_product<1, 5>(pairs, linears);
            DoNotOptimize(a0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K1_M5);

// Baselines: same work done as dot_product<K> followed by M independent
// operator+ calls (what callers would write without the K,M fused kernel).

static void bench_vector_dot_product_K3_plus_M2_addops(State& state)
{
    std::array<Vec, 3> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 3; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 3> pairs{ { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] } } };
            Vec r = Vec::dot_product<3>(pairs);
            r = r + c[0];
            r = r + c[1];
            a[0] = r;
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K3_plus_M2_addops);

static void bench_vector_dot_product_K2_plus_M4_addops(State& state)
{
    std::array<Vec, 2> a, b;
    std::array<Vec, 4> c;
    for (size_t k = 0; k < 2; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 4; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 2> pairs{ { { a[0], b[0] }, { a[1], b[1] } } };
            Vec r = Vec::dot_product<2>(pairs);
            r = r + c[0];
            r = r + c[1];
            r = r + c[2];
            r = r + c[3];
            a[0] = r;
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K2_plus_M4_addops);

static void bench_vector_dot_product_K1_plus_M5_addops(State& state)
{
    Vec a0, b0;
    std::array<Vec, 5> c;
    {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a0 = Vec(av);
        b0 = Vec(bv);
    }
    for (size_t j = 0; j < 5; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 1> pairs{ { { a0, b0 } } };
            Vec r = Vec::dot_product<1>(pairs);
            r = r + c[0];
            r = r + c[1];
            r = r + c[2];
            r = r + c[3];
            r = r + c[4];
            a0 = r;
            DoNotOptimize(a0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K1_plus_M5_addops);

// Additional (K, M) grid for Round-2 binary-search normalization coverage.

static void bench_vector_dot_product_K5_M1(State& state)
{
    std::array<Vec, 5> a, b;
    for (size_t k = 0; k < 5; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    std::array<fr, 5> cv{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec c0(cv);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 5> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] }, { a[4], b[4] } }
            };
            std::array<Vec, 1> linears{ c0 };
            a[0] = Vec::dot_product<5, 1>(pairs, linears);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K5_M1);

static void bench_vector_dot_product_K5_plus_M1_addops(State& state)
{
    std::array<Vec, 5> a, b;
    for (size_t k = 0; k < 5; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    std::array<fr, 5> cv{
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    Vec c0(cv);
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 5> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] }, { a[4], b[4] } }
            };
            Vec r = Vec::dot_product<5>(pairs);
            r = r + c0;
            a[0] = r;
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K5_plus_M1_addops);

static void bench_vector_dot_product_K4_M2(State& state)
{
    std::array<Vec, 4> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 4; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 4> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] } }
            };
            std::array<Vec, 2> linears{ c[0], c[1] };
            a[0] = Vec::dot_product<4, 2>(pairs, linears);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K4_M2);

static void bench_vector_dot_product_K4_plus_M2_addops(State& state)
{
    std::array<Vec, 4> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 4; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 4> pairs{
                { { a[0], b[0] }, { a[1], b[1] }, { a[2], b[2] }, { a[3], b[3] } }
            };
            Vec r = Vec::dot_product<4>(pairs);
            r = r + c[0];
            r = r + c[1];
            a[0] = r;
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K4_plus_M2_addops);

static void bench_vector_dot_product_K2_M2(State& state)
{
    std::array<Vec, 2> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 2; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 2> pairs{ { { a[0], b[0] }, { a[1], b[1] } } };
            std::array<Vec, 2> linears{ c[0], c[1] };
            a[0] = Vec::dot_product<2, 2>(pairs, linears);
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K2_M2);

static void bench_vector_dot_product_K2_plus_M2_addops(State& state)
{
    std::array<Vec, 2> a, b;
    std::array<Vec, 2> c;
    for (size_t k = 0; k < 2; ++k) {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a[k] = Vec(av);
        b[k] = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 2> pairs{ { { a[0], b[0] }, { a[1], b[1] } } };
            Vec r = Vec::dot_product<2>(pairs);
            r = r + c[0];
            r = r + c[1];
            a[0] = r;
            DoNotOptimize(a[0]);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K2_plus_M2_addops);

static void bench_vector_dot_product_K1_M2(State& state)
{
    Vec a0, b0;
    std::array<Vec, 2> c;
    {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a0 = Vec(av);
        b0 = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 1> pairs{ { { a0, b0 } } };
            std::array<Vec, 2> linears{ c[0], c[1] };
            a0 = Vec::dot_product<1, 2>(pairs, linears);
            DoNotOptimize(a0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K1_M2);

static void bench_vector_dot_product_K1_plus_M2_addops(State& state)
{
    Vec a0, b0;
    std::array<Vec, 2> c;
    {
        std::array<fr, 5> av{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        std::array<fr, 5> bv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        a0 = Vec(av);
        b0 = Vec(bv);
    }
    for (size_t j = 0; j < 2; ++j) {
        std::array<fr, 5> cv{
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        c[j] = Vec(cv);
    }
    for (auto _ : state) {
        for (int64_t it = 0; it < ITERATIONS; ++it) {
            std::array<std::pair<Vec, Vec>, 1> pairs{ { { a0, b0 } } };
            Vec r = Vec::dot_product<1>(pairs);
            r = r + c[0];
            r = r + c[1];
            a0 = r;
            DoNotOptimize(a0);
        }
    }
    state.SetItemsProcessed(static_cast<int64_t>(state.iterations()) * ITERATIONS * 5);
}
BENCHMARK(bench_vector_dot_product_K1_plus_M2_addops);

BENCHMARK_MAIN();
