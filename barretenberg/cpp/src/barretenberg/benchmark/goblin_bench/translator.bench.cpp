#include <benchmark/benchmark.h>

#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

using namespace benchmark;
using namespace bb;

namespace {

using Builder = TranslatorCircuitBuilder;
using G1 = g1::affine_element;
using Fr = curve::BN254::ScalarField;
using Fq = curve::BN254::BaseField;

std::shared_ptr<ECCOpQueue> create_op_queue(size_t num_ops)
{
    auto op_queue = std::make_shared<ECCOpQueue>();

    auto P1 = G1::random_element();
    auto P2 = G1::random_element();
    auto z = Fr::random_element();

    // Add required random ops at start
    op_queue->no_op_ultra_only();
    for (size_t i = 0; i < Builder::NUM_RANDOM_OPS_START; i++) {
        op_queue->random_op_ultra_only();
    }

    // Add mixed operations
    for (size_t i = 0; i < num_ops / 2; i++) {
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
    }
    op_queue->eq_and_reset();
    op_queue->merge();

    for (size_t i = 0; i < num_ops / 2; i++) {
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
    }
    op_queue->eq_and_reset();

    // Add required random ops at end
    for (size_t i = 0; i < Builder::NUM_RANDOM_OPS_END; i++) {
        op_queue->random_op_ultra_only();
    }

    // Pad to OP_QUEUE_SIZE (power of 2) as the translator expects
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    return op_queue;
}

void translator_prove(State& state) noexcept
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    size_t num_ops = static_cast<size_t>(state.range(0));
    auto op_queue = create_op_queue(num_ops);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    for (auto _ : state) {
        Builder circuit_builder(x_native, v_native, op_queue);
        auto proving_key = std::make_shared<TranslatorProvingKey>(circuit_builder);
        auto transcript = std::make_shared<TranslatorFlavor::Transcript>();
        TranslatorProver prover(proving_key, transcript);
        auto proof = prover.construct_proof();
    }
}

BENCHMARK(translator_prove)->Unit(kMillisecond)->Arg(100)->Arg(500)->Arg(1000)->Arg(2000)->Arg(4096);

} // namespace

BENCHMARK_MAIN();
