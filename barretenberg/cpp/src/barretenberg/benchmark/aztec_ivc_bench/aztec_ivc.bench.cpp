
#include <benchmark/benchmark.h>

#include "barretenberg/aztec_ivc/aztec_ivc.hpp"
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
class AztecIVCBench : public benchmark::Fixture {
  public:
    using Builder = MegaCircuitBuilder;
    using VerifierInstance = VerifierInstance_<MegaFlavor>;
    using Proof = AztecIVC::Proof;

    // Number of function circuits to accumulate(based on Zacs target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 6;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    static Builder create_mock_circuit(AztecIVC& ivc, size_t log2_num_gates = 16)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other MegaHonk
        // circuits (where we don't explicitly need to add goblin ops), in AztecIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    static bool verify_ivc(Proof& proof, AztecIVC& ivc)
    {
        auto verifier_inst = std::make_shared<VerifierInstance>(ivc.verification_queue[0].instance_vk);
        bool verified = ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });

        if (verified) {
            info("IVC successfully verified!");
        } else {
            info("IVC failed to verify.");
        }

        return verified;
    }

    static auto precompute_verification_keys(AztecIVC& ivc, const size_t num_function_circuits)
    {
        MockCircuitMaker mock_circuit_maker;

        size_t total_num_circuits = num_function_circuits;
        // size_t total_num_circuits = num_function_circuits * 2;

        std::vector<Builder> circuits;
        for (size_t circuit_idx = 0; circuit_idx < total_num_circuits; ++circuit_idx) {
            circuits.emplace_back(mock_circuit_maker.create_next_circuit(ivc));
        }

        // Compute and return the verfication keys corresponding to this set of circuits
        return ivc.precompute_folding_verification_keys(circuits);
    }

    class MockCircuitMaker {
      public:
        size_t circuit_counter = 0;

        Builder create_next_circuit(AztecIVC& ivc)
        {
            circuit_counter++;
            bool is_kernel = (circuit_counter % 2 == 0);

            Builder circuit{ ivc.goblin.op_queue };
            if (is_kernel) { // construct mock kernel
                GoblinMockCircuits::construct_mock_folding_kernel(circuit);
            } else { // construct mock app
                bool use_large_circuit = (circuit_counter == 1);
                GoblinMockCircuits::construct_mock_function_circuit_new(circuit, use_large_circuit);
            }
            return circuit;
        }
    };

    /**
     * @brief Perform a specified number of function circuit accumulation rounds
     * @details
     *
     * @param NUM_CIRCUITS Number of function circuits to accumulate
     */
    static void perform_ivc_accumulation_rounds(size_t NUM_CIRCUITS, AztecIVC& ivc, auto& precomputed_vks)
    {
        ASSERT(precomputed_vks.size() == NUM_CIRCUITS); // ensure presence of a precomputed VK for each circuit

        MockCircuitMaker mock_circuit_maker;

        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            Builder circuit;
            {
                BB_OP_COUNT_TIME_NAME("construct_circuits");
                circuit = mock_circuit_maker.create_next_circuit(ivc);
            }

            ivc.accumulate(circuit, precomputed_vks[circuit_idx]);
        }
    }
};

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 *
 */
BENCHMARK_DEFINE_F(AztecIVCBench, FullStructured)(benchmark::State& state)
{
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::AZTEC_IVC_BENCH;

    auto num_circuits = static_cast<size_t>(state.range(0));
    auto precomputed_vkeys = precompute_verification_keys(ivc, num_circuits);

    Proof proof;

    for (auto _ : state) {
        perform_ivc_accumulation_rounds(num_circuits, ivc, precomputed_vkeys);
        proof = ivc.prove();
    }

    verify_ivc(proof, ivc);
}

#define ARGS Arg(AztecIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)

BENCHMARK_REGISTER_F(AztecIVCBench, FullStructured)->Unit(benchmark::kMillisecond)->Repetitions(1)->ARGS;

} // namespace

BENCHMARK_MAIN();
