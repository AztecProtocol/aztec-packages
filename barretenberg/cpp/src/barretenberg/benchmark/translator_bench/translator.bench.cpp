#include <benchmark/benchmark.h>

#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/translator_vm/translator_circuit_builder.hpp"
#include "barretenberg/translator_vm/translator_prover.hpp"

using namespace benchmark;
using namespace bb;

namespace {

using CircuitBuilder = TranslatorFlavor::CircuitBuilder;
using Fq = TranslatorFlavor::BF;
using Transcript = TranslatorFlavor::Transcript;

void add_random_ops(const std::shared_ptr<ECCOpQueue>& op_queue, size_t count)
{
    for (size_t i = 0; i < count; ++i) {
        op_queue->random_op_ultra_only();
    }
}

void add_mixed_ops(const std::shared_ptr<ECCOpQueue>& op_queue, size_t count)
{
    auto point_a = g1::affine_element::random_element();
    auto point_b = g1::affine_element::random_element();
    auto scalar = fr::random_element();

    for (size_t i = 0; i < count; ++i) {
        op_queue->add_accumulate(point_a);
        op_queue->mul_accumulate(point_b, scalar);
    }
    op_queue->eq_and_reset();
}

CircuitBuilder generate_translator_circuit(size_t capacity_percent)
{
    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->construct_zk_columns();

    constexpr size_t usable_rows =
        TranslatorProvingKey::dyadic_mini_circuit_size_without_masking - TranslatorFlavor::RESULT_ROW - 2;
    const size_t target_rows = usable_rows * capacity_percent / 100;
    const size_t mixed_op_count = std::max<size_t>(1, target_rows / 4);

    add_mixed_ops(op_queue, mixed_op_count);
    add_random_ops(op_queue, TranslatorCircuitBuilder::NUM_RANDOM_OPS_END);
    op_queue->merge_fixed_append(op_queue->get_append_offset_for_prover());

    return CircuitBuilder{ Fq::random_element(), Fq::random_element(), op_queue };
}

template <typename Prover, typename ProvingKey> void construct_proof(State& state)
{
    const size_t capacity_percent = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        auto circuit = generate_translator_circuit(capacity_percent);
        auto transcript = std::make_shared<Transcript>();
        auto proving_key = std::make_shared<ProvingKey>(circuit);
        Prover prover{ proving_key, transcript };
        benchmark::DoNotOptimize(prover.construct_proof());
    }
    state.counters["capacity_percent"] = static_cast<double>(capacity_percent);
}

template <typename Prover, typename ProvingKey> void execute_sumcheck(State& state)
{
    const size_t capacity_percent = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        state.PauseTiming();
        auto circuit = generate_translator_circuit(capacity_percent);
        auto transcript = std::make_shared<Transcript>();
        auto proving_key = std::make_shared<ProvingKey>(circuit);
        Prover prover{ proving_key, transcript };
        prover.execute_preamble_round();
        prover.execute_wire_and_sorted_constraints_commitments_round();
        prover.execute_grand_product_computation_round();
        state.ResumeTiming();

        prover.execute_relation_check_rounds();
        benchmark::DoNotOptimize(prover.sumcheck_output);
    }
    state.counters["capacity_percent"] = static_cast<double>(capacity_percent);
}

void translator_full_prove(State& state)
{
    construct_proof<TranslatorProver, TranslatorProvingKey>(state);
}

void translator_full_sumcheck(State& state)
{
    execute_sumcheck<TranslatorProver, TranslatorProvingKey>(state);
}

BENCHMARK(translator_full_prove)->Unit(kMillisecond)->Arg(25)->Arg(50)->Arg(75);
BENCHMARK(translator_full_sumcheck)->Unit(kMillisecond)->Arg(25)->Arg(50)->Arg(75);

} // namespace

int main(int argc, char** argv)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    benchmark::Initialize(&argc, argv);
    benchmark::RunSpecifiedBenchmarks();
    benchmark::Shutdown();
    return 0;
}
