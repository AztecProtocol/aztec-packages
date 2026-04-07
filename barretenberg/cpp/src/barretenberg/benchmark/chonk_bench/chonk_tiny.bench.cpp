/**
 * @brief Benchmarks comparing Chonk (V1) and ChonkV2 with tiny app circuits.
 * @details App circuits contain only a handful of gates (ECC ops + minimal arithmetic).
 *          This isolates the IVC overhead from the application circuit cost.
 */
#include <benchmark/benchmark.h>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_v2.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/mock_circuit_producer_v2.hpp"
#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;
using namespace bb;

namespace {

// ─── V1 (Chonk) tiny benchmark ───────────────────────────────────────────────

using V1VK = MegaFlavor::VerificationKey;

std::vector<std::shared_ptr<V1VK>> precompute_v1_tiny_vks(size_t num_app_circuits)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    Chonk ivc{ NUM_CIRCUITS };

    std::vector<std::shared_ptr<V1VK>> vkeys;
    for (size_t j = 0; j < NUM_CIRCUITS; ++j) {
        // log2_num_gates=4 → ~16 arithmetic gates (tiny)
        auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/4);
        auto vk = PrivateFunctionExecutionMockCircuitProducer::get_verification_key(circuit);
        vkeys.push_back(vk);
        ivc.accumulate(circuit, vk);
    }
    return vkeys;
}

void accumulate_and_prove_v1_tiny(size_t num_app_circuits,
                                  const std::vector<std::shared_ptr<V1VK>>& precomputed_vks)
{
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    Chonk ivc{ NUM_CIRCUITS };

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            BB_BENCH_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/4);
        }
        ivc.accumulate(circuit, precomputed_vks[circuit_idx]);
    }
    ivc.prove();
}

// ─── V2 (ChonkV2) tiny benchmark ─────────────────────────────────────────────

using V2VK = MegaV2Flavor::VerificationKey;

std::vector<std::shared_ptr<V2VK>> precompute_v2_tiny_vks(size_t num_app_circuits)
{
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    std::vector<std::shared_ptr<V2VK>> vkeys;
    for (size_t j = 0; j < NUM_CIRCUITS; ++j) {
        auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/4);
        auto vk = PrivateFunctionExecutionMockCircuitProducerV2::get_verification_key(circuit);
        vkeys.push_back(vk);
        ivc.accumulate_v2(circuit, vk);
    }
    return vkeys;
}

void accumulate_and_prove_v2_tiny(size_t num_app_circuits,
                                  const std::vector<std::shared_ptr<V2VK>>& precomputed_vks)
{
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            BB_BENCH_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/4);
        }
        ivc.accumulate_v2(circuit, precomputed_vks[circuit_idx]);
    }
    ivc.prove();
}

// ─── Fixture & benchmarks ────────────────────────────────────────────────────

class ChonkTinyBench : public benchmark::Fixture {
  public:
    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

BENCHMARK_DEFINE_F(ChonkTinyBench, V1)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_v1_tiny_vks(NUM_APP_CIRCUITS);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        accumulate_and_prove_v1_tiny(NUM_APP_CIRCUITS, precomputed_vks);
    }
}

BENCHMARK_DEFINE_F(ChonkTinyBench, V2)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_v2_tiny_vks(NUM_APP_CIRCUITS);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        accumulate_and_prove_v2_tiny(NUM_APP_CIRCUITS, precomputed_vks);
    }
}

BENCHMARK_REGISTER_F(ChonkTinyBench, V1)->Unit(benchmark::kMillisecond)->Arg(2);
BENCHMARK_REGISTER_F(ChonkTinyBench, V2)->Unit(benchmark::kMillisecond)->Arg(2);

} // namespace

BENCHMARK_MAIN();
