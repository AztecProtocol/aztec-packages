#include <benchmark/benchmark.h>

#include "barretenberg/bigfield_translator/bigfield_translator_prover.hpp"
#include "barretenberg/srs/global_crs.hpp"

using namespace benchmark;
using namespace bb;

namespace {

using Fr = curve::BN254::ScalarField;
using Fq = curve::BN254::BaseField;

std::shared_ptr<ECCOpQueue> create_op_queue(size_t num_ops)
{
    auto op_queue = std::make_shared<ECCOpQueue>();

    MegaCircuitBuilder builder;
    builder.op_queue = op_queue;

    for (size_t i = 0; i < num_ops; i++) {
        auto point = curve::BN254::Group::affine_one * Fr::random_element();
        auto scalar = Fr::random_element();
        builder.queue_ecc_mul_accum(point, scalar);
    }

    // Pad to OP_QUEUE_SIZE (power of 2) as the translator expects
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    return op_queue;
}

void bigfield_translator_prove(State& state) noexcept
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    size_t num_ops = static_cast<size_t>(state.range(0));
    auto op_queue = create_op_queue(num_ops);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    for (auto _ : state) {
        BigfieldTranslatorProver prover(op_queue, x_native, v_native);
        auto proof = prover.construct_proof();
    }
}

BENCHMARK(bigfield_translator_prove)->Unit(kMillisecond)->Arg(100)->Arg(500)->Arg(1000)->Arg(2000)->Arg(4096);

} // namespace

BENCHMARK_MAIN();
