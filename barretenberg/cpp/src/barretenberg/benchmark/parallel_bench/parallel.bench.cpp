#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace barretenberg;
namespace {
using Curve = curve::BN254;
using Fr = Curve::ScalarField;
#define MAX_REPETITION_LOG 12

/**
 * @brief Benchmark for evaluating the cost of starting parallel_for
 *
 * @details It seems parallel_for takes ~400 microseconds to start
 * @param state
 */
void parallel_for_field_element_addition(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    size_t num_cpus = get_num_cpus();
    std::vector<std::vector<Fr>> copy_vector(num_cpus);
    for (size_t i = 0; i < num_cpus; i++) {
        for (size_t j = 0; j < 2; j++) {
            copy_vector[i].emplace_back(Fr::random_element(&engine));
            copy_vector[i].emplace_back(Fr::random_element(&engine));
        }
    }
    for (auto _ : state) {
        state.PauseTiming();
        size_t num_external_cycles = 1 << static_cast<size_t>(state.range(0));
        size_t num_internal_cycles = 1 << (MAX_REPETITION_LOG - static_cast<size_t>(state.range(0)));
        state.ResumeTiming();
        for (size_t i = 0; i < num_external_cycles; i++) {
            parallel_for(num_cpus, [num_internal_cycles, &copy_vector](size_t index) {
                for (size_t i = 0; i < num_internal_cycles; i++) {
                    copy_vector[index][i & 1] += copy_vector[index][1 - (i & 1)];
                }
            });
        }
    }
}

/**
 * @brief Evaluate how much finite addition costs (in cache)
 *
 *@details ~4 ns if we subtract  i++ operation
 * @param state
 */
void ff_addition(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Fr> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Fr::random_element(&engine));
        copy_vector.emplace_back(Fr::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[i & 1] += copy_vector[1 - (i & 1)];
        }
    }
}

/**
 * @brief Evaluate how much finite field multiplication costs (in cache)
 *
 *@details ~25 ns if we subtract i++ operation
 * @param state
 */
void ff_multiplication(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Fr> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Fr::random_element(&engine));
        copy_vector.emplace_back(Fr::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[i & 1] *= copy_vector[1 - (i & 1)];
        }
    }
}

/**
 * @brief Evaluate how much finite field squaring costs (in cache)
 *
 *@details ~19 ns if we subtract i++ operation
 * @param state
 */
void ff_sqr(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Fr> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Fr::random_element(&engine));
        copy_vector.emplace_back(Fr::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[0] = copy_vector[0].sqr();
        }
    }
}

/**
 * @brief Evaluate how much projective point addition costs (in cache)
 *
 *@details ~350 ns if we subtract  i++ operation
 * @param state
 */
void projective_point_addition(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Curve::Element> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[i & 1] += copy_vector[1 - (i & 1)];
        }
    }
}

/**
 * @brief Evaluate how much projective point doubling costs when we trigger it through addition (in cache)
 *
 *@details ~354 ns if we subtract  i++ operation
 * @param state
 */
void projective_point_accidental_doubling(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Curve::Element> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[0] += copy_vector[0];
        }
    }
}

/**
 * @brief Evaluate how much projective point doubling costs (in cache)
 *
 *@details ~195 ns if we subtract  i++ operation
 * @param state
 */
void projective_point_doubling(State& state)
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    std::vector<Curve::Element> copy_vector(2);
    for (size_t j = 0; j < 2; j++) {
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
        copy_vector.emplace_back(Curve::Element::random_element(&engine));
    }

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (size_t i = 0; i < num_cycles; i++) {
            copy_vector[0] = copy_vector[0].dbl();
        }
    }
}
/**
 * @brief Evaluate how much running the loop costs in benchmarks
 *
 * @details 0.6~0.7 ns per cycle
 * @param state
 */
void cycle_waste(State& state)
{

    for (auto _ : state) {
        state.PauseTiming();
        size_t num_cycles = 1 << static_cast<size_t>(state.range(0));
        state.ResumeTiming();
        for (volatile size_t i = 0; i < num_cycles;) {
            i = i + 1;
        }
    }
}
} // namespace

BENCHMARK(parallel_for_field_element_addition)->Unit(kMicrosecond)->DenseRange(0, MAX_REPETITION_LOG);
BENCHMARK(ff_addition)->Unit(kMicrosecond)->DenseRange(12, 30);
BENCHMARK(ff_multiplication)->Unit(kMicrosecond)->DenseRange(12, 27);
BENCHMARK(ff_sqr)->Unit(kMicrosecond)->DenseRange(12, 27);
BENCHMARK(projective_point_addition)->Unit(kMicrosecond)->DenseRange(12, 22);
BENCHMARK(projective_point_accidental_doubling)->Unit(kMicrosecond)->DenseRange(12, 22);
BENCHMARK(projective_point_doubling)->Unit(kMicrosecond)->DenseRange(12, 22);
BENCHMARK(cycle_waste)->Unit(kMicrosecond)->DenseRange(20, 30);
BENCHMARK_MAIN();