#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include <benchmark/benchmark.h>
#include <cstdlib>
#include <filesystem>
#include <string>

using namespace bb;

namespace {

using Flavor = MegaFlavor;
using FF = Flavor::FF;
using ProverInstance = ProverInstance_<Flavor>;
using VerificationKey = Flavor::VerificationKey;

// Path to a pinned Chonk flow's inputs. Flow defaults to the ecdsar1 private transfer flow and can be
// overridden with MEGA_SUMCHECK_FLOW; the directory holding the flows can be set with CHONK_FLOWS_DIR
// (defaults to the location populated by `barretenberg/cpp/scripts/chonk_inputs.sh download`).
std::filesystem::path flow_inputs_path()
{
    const char* flow_env = std::getenv("MEGA_SUMCHECK_FLOW");
    const std::string flow = flow_env != nullptr ? flow_env : "ecdsar1+transfer_1_recursions+sponsored_fpc";
    const char* dir_env = std::getenv("CHONK_FLOWS_DIR");
    const std::filesystem::path dir = dir_env != nullptr ? dir_env : "../chonk-pinned-flows";
    return dir / flow / "ivc-inputs.msgpack";
}

// Kernel circuits carry the recursive-verifier constraints and are the largest, most expensive Mega circuits
// in a flow. Select them by function name.
bool is_kernel(const std::string& function_name)
{
    return function_name.find("kernel") != std::string::npos;
}

// A real Mega kernel circuit, ready for sumcheck: its proving instance with oink-derived witnesses
// (z_perm, logderiv inverses), relation parameters, alpha, and gate challenges all populated.
struct SumcheckFixture {
    std::shared_ptr<ProverInstance> instance;
    size_t virtual_log_n = 0;
    std::string circuit_name;
};

// Drive the real Chonk IVC accumulation over the flow (so kernels are built with the IVC context their
// recursive-verifier constraints require), keep the largest kernel's proving instance, then run oink + gate
// challenges on it so it is ready to feed a standalone Mega sumcheck.
SumcheckFixture build_biggest_kernel_fixture()
{
    auto raw_steps = PrivateExecutionStepRaw::load_and_decompress(flow_inputs_path());
    PrivateExecutionSteps steps;
    steps.parse(std::move(raw_steps));

    auto ivc = std::make_shared<Chonk>(steps.folding_stack.size());
    const acir_format::ProgramMetadata metadata{ ivc };

    std::shared_ptr<ProverInstance> biggest;
    std::string biggest_name;
    for (auto [program, precomputed_vk, function_name] :
         zip_view(steps.folding_stack, steps.precomputed_vks, steps.function_names)) {
        auto circuit = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);

        if (is_kernel(function_name)) {
            // Build the proving instance from a copy: ivc->accumulate below finalizes the original circuit,
            // and we must keep accumulating subsequent circuits to build later kernels correctly.
            MegaCircuitBuilder circuit_copy = circuit;
            auto candidate = std::make_shared<ProverInstance>(circuit_copy);
            if (!biggest || candidate->dyadic_size() > biggest->dyadic_size()) {
                biggest = candidate;
                biggest_name = function_name;
            }
        }
        ivc->accumulate(circuit, precomputed_vk);
    }
    if (!biggest) {
        throw_or_abort("No kernel circuit found in flow " + flow_inputs_path().string());
    }

    // Run oink to populate derived witnesses, relation parameters and alpha (mirrors UltraProver setup).
    auto verification_key = std::make_shared<VerificationKey>(biggest->get_precomputed());
    auto transcript = std::make_shared<Flavor::Transcript>();
    OinkProver<Flavor> oink(biggest, verification_key, transcript);
    oink.prove();

    const size_t virtual_log_n =
        Flavor::USE_PADDING ? Flavor::VIRTUAL_LOG_N : static_cast<size_t>(biggest->log_dyadic_size());
    biggest->gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", virtual_log_n);

    info("mega_sumcheck: torturing kernel '", biggest_name, "' (dyadic_size=", biggest->dyadic_size(), ")");
    return SumcheckFixture{ .instance = biggest, .virtual_log_n = virtual_log_n, .circuit_name = biggest_name };
}

void mega_kernel_sumcheck(benchmark::State& state)
{
    // Building the IVC fixture is expensive; do it once and reuse across benchmark invocations. Sumcheck reads the
    // (unmutated) full polynomials, so the instance is safe to reuse.
    static SumcheckFixture fixture = build_biggest_kernel_fixture();
    auto& instance = *fixture.instance;

    for (auto _ : state) {
        // Round 0 reads the (unmutated) full polynomials and builds a fresh partially-evaluated table, so the
        // instance can be reused across iterations; only the transcript must be fresh per run.
        auto transcript = std::make_shared<Flavor::Transcript>();
        SumcheckProver<Flavor> sumcheck(instance.dyadic_size(),
                                        instance.polynomials,
                                        transcript,
                                        instance.alpha,
                                        instance.gate_challenges,
                                        instance.relation_parameters,
                                        fixture.virtual_log_n);
        auto output = sumcheck.prove();
        benchmark::DoNotOptimize(output);
    }
}

BENCHMARK(mega_kernel_sumcheck)->Unit(benchmark::kMillisecond)->MinTime(2.0);

} // namespace

int main(int argc, char** argv)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    benchmark::Initialize(&argc, argv);
    benchmark::RunSpecifiedBenchmarks();
    benchmark::Shutdown();
    return 0;
}
