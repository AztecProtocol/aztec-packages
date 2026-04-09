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
std::shared_ptr<ECCOpQueue> create_populated_op_queue()
{
    static constexpr size_t OP_QUEUE_TABLE_CAPACITY = 1UL << CONST_OP_QUEUE_LOG_SIZE;
    // Leave headroom for structural ops (eq_and_reset, no-ops) that chonk adds per circuit
    static constexpr size_t TARGET_OPS = OP_QUEUE_TABLE_CAPACITY - 128;

    auto op_queue = std::make_shared<ECCOpQueue>();

    // Structural ops required by the chonk flush table structure
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->eq_and_reset();

    // Fill the op queue to near capacity with add_accumulate operations
    auto point = bb::g1::affine_element::one();
    while (op_queue->get_current_subtable_size() < TARGET_OPS) {
        op_queue->add_accumulate(point);
    }

    op_queue->merge();
    return op_queue;
}

/**
 * @brief Extract merged table commitments from an op queue.
 */
MergeVerifier::TableCommitments commit_merged_table(const std::shared_ptr<ECCOpQueue>& op_queue)
{
    MergeVerifier::TableCommitments table_commitments;
    auto merged_table = op_queue->construct_ultra_ops_table_columns();
    CommitmentKey<curve::BN254> pcs_commitment_key(op_queue->get_ultra_ops_table_num_rows());
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        table_commitments[idx] = pcs_commitment_key.commit(merged_table[idx]);
    }
    return table_commitments;
}

class GoblinFlushBench : public benchmark::Fixture {
  public:
    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

/**
 * @brief Benchmark Phase 1: Prove Goblin (ECCVM + Translator, non-ZK)
 */
BENCHMARK_DEFINE_F(GoblinFlushBench, ProveGoblin)(benchmark::State& state)
{
    // Pre-populate an op queue outside the timed region
    auto op_queue = create_populated_op_queue();

    for (auto _ : state) {
        // Copy the op queue so each iteration starts from the same state
        auto op_queue_copy = std::make_shared<ECCOpQueue>(*op_queue);
        GoblinWithoutMerge flush_goblin(op_queue_copy, /*is_zk=*/false);
        benchmark::DoNotOptimize(flush_goblin.prove());
    }
}

/**
 * @brief Benchmark Phase 2: Build and prove the flush verification circuit (Circuit C) with Ultra Honk
 */
BENCHMARK_DEFINE_F(GoblinFlushBench, ProveFlushCircuit)(benchmark::State& state)
{
    // Pre-compute the Goblin proof and table commitments outside the timed region
    auto op_queue = create_populated_op_queue();
    auto table_commitments = commit_merged_table(op_queue);
    GoblinWithoutMerge flush_goblin(op_queue, /*is_zk=*/false);
    auto flush_proof = flush_goblin.prove();

    for (auto _ : state) {
        // Build Circuit C (ECCVM + Translator recursive verifier)
        auto builder = build_goblin_flush_circuit(flush_proof, table_commitments);

        // Prove Circuit C with Ultra Honk
        using Flavor = UltraFlavor;
        using ProverInstance = ProverInstance_<Flavor>;
        using Prover = UltraProver_<Flavor>;

        auto prover_instance = std::make_shared<ProverInstance>(builder);
        auto vk = std::make_shared<Flavor::VerificationKey>(prover_instance->get_precomputed());
        Prover prover(prover_instance, vk);
        benchmark::DoNotOptimize(prover.construct_proof());
    }
}

BENCHMARK_REGISTER_F(GoblinFlushBench, ProveGoblin)->Unit(benchmark::kMillisecond)->Iterations(1);
BENCHMARK_REGISTER_F(GoblinFlushBench, ProveFlushCircuit)->Unit(benchmark::kMillisecond)->Iterations(1);

} // namespace

BENCHMARK_MAIN();
