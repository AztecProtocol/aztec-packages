/**
 * @brief Benchmarks for ChonkV2 IVC with deferred Poseidon2 hash verification.
 * @details Mirrors chonk.bench.cpp but uses ChonkV2 (MegaV2Flavor) with the Poseidon2 op queue.
 */
#include <benchmark/benchmark.h>

#include "barretenberg/chonk/chonk_v2.hpp"
#include "barretenberg/chonk/mock_circuit_producer_v2.hpp"
#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;
using namespace bb;

namespace {

using Flavor = MegaV2Flavor;
using VerificationKey = Flavor::VerificationKey;

std::vector<std::shared_ptr<VerificationKey>> precompute_v2_vks(const size_t num_app_circuits)
{
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    std::vector<std::shared_ptr<VerificationKey>> vkeys;
    for (size_t j = 0; j < NUM_CIRCUITS; ++j) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        auto vk = PrivateFunctionExecutionMockCircuitProducerV2::get_verification_key(circuit);
        vkeys.push_back(vk);
        ivc.accumulate_v2(circuit, vk);
    }
    return vkeys;
}

ChonkV2::ChonkV2Proof accumulate_and_prove_v2(size_t num_app_circuits,
                                               const std::vector<std::shared_ptr<VerificationKey>>& precomputed_vks)
{
    PrivateFunctionExecutionMockCircuitProducerV2 circuit_producer(num_app_circuits, /*large_first_app=*/false);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ChonkV2 ivc{ NUM_CIRCUITS };

    for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
        MegaCircuitBuilder circuit;
        {
            BB_BENCH_NAME("construct_circuits");
            circuit = circuit_producer.create_next_circuit(ivc);
        }
        ivc.accumulate_v2(circuit, precomputed_vks[circuit_idx]);
    }
    return ivc.prove();
}

class ChonkV2Bench : public benchmark::Fixture {
  public:
    // static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 5;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

BENCHMARK_DEFINE_F(ChonkV2Bench, Full)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_v2_vks(NUM_APP_CIRCUITS);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        accumulate_and_prove_v2(NUM_APP_CIRCUITS, precomputed_vks);
    }
}

BENCHMARK_REGISTER_F(ChonkV2Bench, Full)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1)
    ->Arg(2);

} // namespace

BENCHMARK_MAIN();
