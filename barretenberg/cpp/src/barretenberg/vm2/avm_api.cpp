#include "barretenberg/vm2/avm_api.hpp"

#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

std::pair<AvmAPI::AvmProof, AvmAPI::AvmVerificationKey> AvmAPI::prove(const AvmAPI::ProvingInputs& inputs)
{
    // Simulate.
    info("Simulating...");
    AvmSimulationHelper simulation_helper(inputs.hints);
    auto events = AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate());

    // Generate trace.
    info("Generating trace...");
    AvmTraceGenHelper tracegen_helper;
    auto trace =
        AVM_TRACK_TIME_V("tracegen/all", tracegen_helper.generate_trace(std::move(events), inputs.publicInputs));

    // Prove.
    info("Proving...");
    AvmProvingHelper proving_helper;
    auto [proof, vk] = AVM_TRACK_TIME_V("proving/all", proving_helper.prove(std::move(trace)));

    info("Done!");
    return { std::move(proof), std::move(vk) };
}

bool AvmAPI::check_circuit(const AvmAPI::ProvingInputs& inputs)
{
    // Simulate.
    info("Simulating...");
    AvmSimulationHelper simulation_helper(inputs.hints);
    auto events = AVM_TRACK_TIME_V("simulation/all", simulation_helper.simulate());

    // Generate trace.
    // In contrast to proving, we do this step by step since it's usually more useful to debug
    // before trying to run the interaction builders.
    info("Generating trace...");
    AvmTraceGenHelper tracegen_helper;
    tracegen::TraceContainer trace;
    AVM_TRACK_TIME("tracegen/all", tracegen_helper.fill_trace_columns(trace, std::move(events), inputs.publicInputs));

    // Go into interactive debug mode if requested.
    if (getenv("AVM_DEBUG") != nullptr) {
        InteractiveDebugger debugger(trace);
        debugger.run();
    }

    AVM_TRACK_TIME("tracegen/all", tracegen_helper.fill_trace_interactions(trace));

    // Check circuit.
    info("Checking circuit...");
    AvmProvingHelper proving_helper;
    return proving_helper.check_circuit(std::move(trace));
}

bool AvmAPI::verify(const AvmProof& proof, const PublicInputs& pi, const AvmVerificationKey& vk_data)
{
    info("Verifying...");
    AvmProvingHelper proving_helper;
    return AVM_TRACK_TIME_V("verifing/all", proving_helper.verify(proof, pi, vk_data));
}

} // namespace bb::avm2
