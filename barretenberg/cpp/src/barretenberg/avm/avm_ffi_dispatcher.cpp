/**
 * @file avm_ffi_dispatcher.cpp
 * @brief Names the context the AVM handlers run over in the in-process FFI entry (avm_ipc_ffi_entry), the entry
 * bb-avm-sim.wasm exports.
 *
 * The in-process build has no route to a world state or contract DB yet, so it serves SimulateWithHints, whose hints
 * answer every read, and answers Simulate with an error.
 */
#include "barretenberg/avm/avm_simulate_with_hints.hpp"
#include "barretenberg/avm/generated/avm_ffi.hpp"

namespace bb::avm {

namespace {
struct AvmFfiRequest {};
} // namespace

template <>
void handle_simulate(AvmFfiRequest& /*request*/,
                     wire::AvmSimulate&& /*command*/,
                     Responder<wire::AvmSimulateResponse> respond)
{
    respond.error("Simulate needs a world state and contract DB, which the in-process bb-avm-sim cannot reach yet; "
                  "SimulateWithHints needs neither");
}

template <>
void handle_simulate_with_hints(AvmFfiRequest& /*request*/,
                                wire::AvmSimulateWithHints&& command,
                                Responder<wire::AvmSimulateWithHintsResponse> respond)
{
    respond.ok(wire::AvmSimulateWithHintsResponse{ .result = simulate_with_hints(command.inputs) });
}

/**
 * @brief The dispatcher behind the generated in-process FFI entry (see avm_ffi.hpp). The context is stateless, so one
 * serves every call.
 */
AsyncDispatchHandler& ipc_ffi_dispatcher()
{
    static AvmFfiRequest request;
    static AsyncDispatchHandler handler = make_avm_handler(request);
    return handler;
}

} // namespace bb::avm
