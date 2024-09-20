
#include <benchmark/benchmark.h>

#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
 *
 */
class ClientIVCBench : public benchmark::Fixture {
  public:
    using Builder = MegaCircuitBuilder;
    using DeciderVerificationKey = DeciderVerificationKey_<MegaFlavor>;
    using Proof = ClientIVC::Proof;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

    // Number of function circuits to accumulate(based on Zacs target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    /**
     * @brief Verify an IVC proof
     *
     */
    static bool verify_ivc(Proof& proof, ClientIVC& ivc)
    {
        auto verifier_inst = std::make_shared<DeciderVerificationKey>(ivc.verification_queue[0].honk_verification_key);
        bool verified = ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });

        // This is a benchmark, not a test, so just print success or failure to the log
        if (verified) {
            info("IVC successfully verified!");
        } else {
            info("IVC failed to verify.");
        }
        return verified;
    }

    /**
     * @brief Perform a specified number of circuit accumulation rounds
     *
     * @param NUM_CIRCUITS Number of circuits to accumulate (apps + kernels)
     */
    static void perform_ivc_accumulation_rounds(size_t NUM_CIRCUITS, ClientIVC& ivc, auto& precomputed_vks)
    {
        ASSERT(precomputed_vks.size() == NUM_CIRCUITS); // ensure presence of a precomputed VK for each circuit

        MockCircuitProducer circuit_producer;

        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            Builder circuit;
            {
                BB_OP_COUNT_TIME_NAME("construct_circuits");
                circuit = circuit_producer.create_next_circuit(ivc);
            }

            ivc.accumulate(circuit, precomputed_vks[circuit_idx]);
        }
    }
};

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 *
 */
BENCHMARK_DEFINE_F(ClientIVCBench, Full)(benchmark::State& state)
{
    ClientIVC ivc;
    ivc.trace_structure = TraceStructure::CLIENT_IVC_BENCH;

    auto total_num_circuits = 2 * static_cast<size_t>(state.range(0)); // 2x accounts for kernel circuits

    // Precompute the verification keys for the benchmark circuits
    MockCircuitProducer circuit_producer;
    auto precomputed_vkeys = circuit_producer.precompute_verification_keys(total_num_circuits, ivc.trace_structure);

    Proof proof;
    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        perform_ivc_accumulation_rounds(total_num_circuits, ivc, precomputed_vkeys);
        proof = ivc.prove();
    }

    // For good measure, ensure the IVC verifies
    verify_ivc(proof, ivc);
}

#define ARGS Arg(ClientIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)

BENCHMARK_REGISTER_F(ClientIVCBench, Full)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
