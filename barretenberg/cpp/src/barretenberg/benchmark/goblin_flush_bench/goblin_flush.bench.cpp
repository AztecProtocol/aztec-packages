/**
 * @brief Benchmarks for the Goblin flush pipeline.
 *
 * Measures the individual phases of a Goblin flush:
 *   1. Prove Goblin (ECCVM + Translator, non-ZK)
 *   2. Build + prove the flush verification circuit (Circuit C, Ultra Honk)
 *   3. Accumulate the Goblin app (which recursively verifies C's proof)
 *   4. Accumulate the Goblin kernel
 */

#include <benchmark/benchmark.h>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/dsl/acir_format/goblin_flush_recursion_constraint.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_without_merge/goblin_flush_circuit.hpp"
#include "barretenberg/goblin_without_merge/goblin_without_merge.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Populate an op queue to near-Translator capacity, mimicking a real flush scenario.
 * @details The tighter constraint is the Translator's op queue table (2^CONST_OP_QUEUE_LOG_SIZE = 4096 entries),
 *          not the ECCVM (2^CONST_ECCVM_LOG_N = 32768 rows). Fills until near the Translator limit.
 */
void create_populated_op_queue(std::shared_ptr<ECCOpQueue>& op_queue)
{
    static constexpr size_t OP_QUEUE_TABLE_CAPACITY = 1UL << CONST_OP_QUEUE_LOG_SIZE;
    // Leave headroom for structural ops (eq_and_reset, no-ops) that chonk adds per circuit
    static constexpr size_t TARGET_OPS = OP_QUEUE_TABLE_CAPACITY - 128;

    // Structural ops required by the chonk flush table structure
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->eq_and_reset();

    // Fill the op queue to near capacity with add_accumulate operations
    auto point = bb::g1::affine_element::one();
    while (op_queue->get_current_subtable_size() < TARGET_OPS - 1) {
        op_queue->add_accumulate(point);
    }
    op_queue->eq_and_reset();

    op_queue->merge();
}

class GoblinFlushBench : public benchmark::Fixture {
  public:
    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};
/**
 * @brief Benchmark: build flush recursion constraints
 */
BENCHMARK_DEFINE_F(GoblinFlushBench, ProveFlushCircuit)(benchmark::State& state)
{
    // Pre-compute the Goblin proof and table commitments outside the timed region
    auto ivc = std::make_shared<Chonk>(/*num_circuits=*/4);
    create_populated_op_queue(ivc->get_goblin().op_queue);
    acir_format::RecursionConstraint recursion_constraint = {
        {}, {}, {}, 0, acir_format::ULTRA_GOBLIN, acir_format::WitnessOrConstant<bb::fr>::from_constant(0)
    };

    for (auto _ : state) {
        auto op_queue_copy = std::make_shared<ECCOpQueue>(*ivc->get_goblin().op_queue);
        MegaCircuitBuilder builder(op_queue_copy);
        benchmark::DoNotOptimize(
            acir_format::create_goblin_flush_recursion_constraints(builder, recursion_constraint, ivc));
    }
}

BENCHMARK_REGISTER_F(GoblinFlushBench, ProveFlushCircuit)->Unit(benchmark::kMillisecond)->Iterations(1);

} // namespace

BENCHMARK_MAIN();
