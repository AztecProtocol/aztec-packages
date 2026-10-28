#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/avm/avm_simulate.hpp"
#include "barretenberg/avm/avm_simulate_with_hints.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"

namespace bb::avm {

// Cancellation for the single in-flight simulation. bb-avm-sim runs exactly one
// simulation at a time; the SIGUSR1 handler (which may run on any thread) cancels
// it through g_active_cancellation_token.
//
// The token is process-lifetime and never freed. A per-request token would let
// the signal handler dereference a pointer to a token the completing request had
// already freed (use-after-free), since the handler can run concurrently with the
// request thread unwinding. g_active_cancellation_token points at this token only
// while a simulation runs and is null otherwise, so a signal between simulations
// is a safe no-op.
//
// NOTE: cancellation is process-scoped (a signal), not request-scoped. A signal
// delivered late — after its target finished and the next simulation began on this
// process — would cancel the wrong simulation. The pool runs one simulation per
// process and signals only the in-flight one, so this isn't exercised today;
// hardening it would need a request-scoped cancel channel rather than a signal.
const avm2::simulation::CancellationTokenPtr g_sim_cancellation_token =
    std::make_shared<avm2::simulation::CancellationToken>();
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token{ nullptr };

template <>
void handle_simulate(AvmRequest& request, wire::AvmSimulate&& command, Responder<wire::AvmSimulateResponse> respond)
{
    if (request.cdb_client == nullptr || request.wsdb_client == nullptr) {
        respond.error("Simulate needs bb-avm-sim started with --wsdb and --cdb");
        return;
    }
    // Reuse the process-lifetime token (cleared of any prior cancellation) instead
    // of allocating a per-request one the signal handler could outlive.
    g_sim_cancellation_token->reset();
    g_active_cancellation_token.store(g_sim_cancellation_token.get(), std::memory_order_release);
    try {
        auto result = simulate(*request.cdb_client, *request.wsdb_client, command.inputs, g_sim_cancellation_token);
        g_active_cancellation_token.store(nullptr, std::memory_order_release);
        respond.ok(wire::AvmSimulateResponse{ .result = std::move(result) });
    } catch (const std::exception& e) {
        g_active_cancellation_token.store(nullptr, std::memory_order_release);
        respond.error(e.what());
    }
}

template <>
void handle_simulate_with_hints(AvmRequest& request,
                                wire::AvmSimulateWithHints&& command,
                                Responder<wire::AvmSimulateWithHintsResponse> respond)
{
    (void)request;

    try {
        respond.ok(wire::AvmSimulateWithHintsResponse{ .result = simulate_with_hints(command.inputs) });
    } catch (const std::exception& e) {
        respond.error(e.what());
    }
}

} // namespace bb::avm
