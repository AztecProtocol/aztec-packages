#include <benchmark/benchmark.h>

#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_prover.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"

using namespace benchmark;
using namespace bb;

using Flavor = ECCVMFlavor;
using Builder = ECCVMCircuitBuilder;

namespace {

Builder generate_trace(size_t target_num_gates)
{
    std::shared_ptr<ECCOpQueue> op_queue = std::make_shared<ECCOpQueue>();
    using G1 = typename Flavor::CycleGroup;
    using Fr = typename G1::Fr;

    auto generators = G1::derive_generators("test generators", 2);

    typename G1::element a = generators[0];
    typename G1::element b = generators[1];
    Fr x = Fr::random_element();
    Fr y = Fr::random_element();

    // Each loop adds 163 gates. Note: builder.get_estimated_num_finalized_gates() is very expensive here (bug?) and
    // it's actually painful to use a `while` loop
    size_t num_iterations = target_num_gates / 163;
    for (size_t _ = 0; _ < num_iterations; _++) {
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(a, x);
        op_queue->mul_accumulate(b, x);
        op_queue->mul_accumulate(b, y);
        op_queue->add_accumulate(a);
        op_queue->mul_accumulate(b, x);
        op_queue->eq_and_reset();
    }

    Builder builder{ op_queue };
    return builder;
}

void eccvm_generate_prover(State& state) noexcept
{
    bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());

    size_t target_num_gates = 1 << static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        Builder builder = generate_trace(target_num_gates);
        ECCVMProver prover(builder);
    };
}

void eccvm_prove(State& state) noexcept
{
    bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());

    size_t target_num_gates = 1 << static_cast<size_t>(state.range(0));
    Builder builder = generate_trace(target_num_gates);
    ECCVMProver prover(builder);
    for (auto _ : state) {
        ECCVMProof proof = prover.construct_proof();
    };
}

BENCHMARK(eccvm_generate_prover)->Unit(kMillisecond)->DenseRange(12, 18);
BENCHMARK(eccvm_prove)->Unit(kMillisecond)->DenseRange(12, 18);
} // namespace

BENCHMARK_MAIN();
