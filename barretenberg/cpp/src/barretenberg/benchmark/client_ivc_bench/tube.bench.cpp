
#include <benchmark/benchmark.h>

#include "barretenberg/bb/file_io.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC recursive verifier ("tube" circuit)
 *
 */
class TubeBench : public benchmark::Fixture {
  public:
    using Builder = MegaCircuitBuilder;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Currently default sized to 2^16 to match kernel. (Note: dummy op gates added to avoid non-zero
     * polynomials will bump size to next power of 2)
     *
     */
    static Builder create_mock_circuit(ClientIVC& ivc, size_t log2_num_gates = 15)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other MegaHonk
        // circuits (where we don't explicitly need to add goblin ops), in ClientIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }
};

/**
 * @brief Benchmark the prover work for the recursive client IVC/tube.
 *
 */
BENCHMARK_DEFINE_F(TubeBench, Full)(benchmark::State& state)
{
    // TODO(AD) dedupe this
    ClientIVC ivc;

    // Construct a set of arbitrary circuits
    size_t NUM_CIRCUITS = 2;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        circuits.emplace_back(create_mock_circuit(ivc));
    }

    // Accumulate each circuit
    for (auto& circuit : circuits) {
        ivc.accumulate(circuit);
    }

    auto proof = ivc.prove();

    auto verifier_inst = std::make_shared<ClientIVC::VerifierInstance>(ivc.instance_vk);
    bool verified = ivc.verify(proof, { ivc.verifier_accumulator, verifier_inst });

    info("ClientIVC::verify(): ", verified);

    for (auto _ : state) {
        // BB_REPORT_OP_COUNT_IN_BENCH(state);
        using Tube = stdlib::recursion::honk::ClientIVCRecursiveVerifier;
        auto eccvm_vk = std::make_shared<ECCVMFlavor::VerificationKey>(ivc.goblin.get_eccvm_proving_key());
        auto translator_vk =
            std::make_shared<TranslatorFlavor::VerificationKey>(ivc.goblin.get_translator_proving_key());
        Tube::FoldVerifierInput fold_verifier_input{ ivc.verifier_accumulator, { ivc.instance_vk } };
        Tube::GoblinVerifierInput goblin_verifier_input{ eccvm_vk, translator_vk };
        Tube::VerifierInput input{ fold_verifier_input, goblin_verifier_input };
        auto builder = std::make_shared<UltraCircuitBuilder>();

        // Padding needed for sending the right number of public inputs
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1048): INSECURE - make this tube proof actually
        // use these public inputs by turning proof into witnesses and call set_public on each witness auto
        auto num_public_inputs = static_cast<size_t>(proof.folding_proof[1]);
        for (size_t i = 0; i < num_public_inputs; i++) {
            // We offset 3
            builder->add_public_variable(proof.folding_proof[i + 3]);
        }
        Tube verifier{ builder, input };
        verifier.verify(proof);
        info("num gates in tube circuit: ", builder->get_num_gates());
        using Prover = UltraProver_<UltraFlavor>;
        Prover tube_prover{ *builder };
        tube_prover.construct_proof();
    }
}
BENCHMARK_REGISTER_F(TubeBench, Full)->Unit(benchmark::kSecond);
} // namespace

BENCHMARK_MAIN();
