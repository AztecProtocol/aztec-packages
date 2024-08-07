
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

    // static auto precompute_verification_keys(AztecIVC& ivc, const size_t num_function_circuits)
    // {
    //     // Populate the set of mock function and kernel circuits to be accumulated in the IVC
    //     std::vector<Builder> circuits;
    //     Builder function_circuit{ ivc.goblin.op_queue };
    //     GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
    //     circuits.emplace_back(function_circuit);

    //     for (size_t idx = 1; idx < num_function_circuits; ++idx) {
    //         Builder function_circuit{ ivc.goblin.op_queue };
    //         GoblinMockCircuits::construct_mock_function_circuit(function_circuit);
    //         circuits.emplace_back(function_circuit);

    //         Builder kernel_circuit{ ivc.goblin.op_queue };
    //         GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit);
    //         circuits.emplace_back(kernel_circuit);
    //     }

    //     // Compute and return the verfication keys corresponding to this set of circuits
    //     return ivc.precompute_folding_verification_keys(circuits);
    // }

    class MockCircuitMaker {
      public:
        size_t circuit_counter = 0;

        Builder create_next_circuit(AztecIVC& ivc)
        {
            circuit_counter++;

            bool is_kernel = (circuit_counter % 2 == 0);
            if (is_kernel) {
                // return mock kernel circuit
                return create_mock_circuit(ivc);
            } else {
                // return mock app circuit
                return create_mock_circuit(ivc);
            }
            return Builder();
        }
    };

    /**
     * @brief Perform a specified number of function circuit accumulation rounds
     * @details
     *
     * @param NUM_CIRCUITS Number of function circuits to accumulate
     */
    static void perform_ivc_accumulation_rounds(size_t NUM_CIRCUITS, AztecIVC& ivc)
    {
        MockCircuitMaker mock_circuit_maker;

        for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {
            Builder circuit;
            {
                BB_OP_COUNT_TIME_NAME("construct_circuits");
                circuit = mock_circuit_maker.create_next_circuit(ivc);
            }

            ivc.accumulate(circuit);
        }
    }
    // /**
    //  * @brief Perform a specified number of function circuit accumulation rounds
    //  * @details
    //  *
    //  * @param NUM_CIRCUITS Number of function circuits to accumulate
    //  */
    // static void perform_ivc_accumulation_rounds(size_t NUM_CIRCUITS, AztecIVC& ivc, auto& precomputed_vks)
    // {
    //     ASSERT(precomputed_vks.size() == NUM_CIRCUITS); // ensure presence of a precomputed VK for each circuit

    //     MockCircuitMaker mock_circuit_maker;

    //     for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS - 1; ++circuit_idx) {
    //         Builder circuit;
    //         {
    //             BB_OP_COUNT_TIME_NAME("construct_circuits");
    //             circuit = mock_circuit_maker.create_next_circuit(ivc);
    //         }

    //         ivc.accumulate(circuit);
    //     }
    // }
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

    for (auto _ : state) {
        perform_ivc_accumulation_rounds(num_circuits, ivc);
    }

    bool result = ivc.prove_and_verify();
    if (result) {
        info("VERIFIED!");
    } else {
        info("failure.");
    }
}

#define ARGS Arg(AztecIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)

BENCHMARK_REGISTER_F(AztecIVCBench, FullStructured)->Unit(benchmark::kMillisecond)->ARGS;

} // namespace

BENCHMARK_MAIN();
