/**
 * @file avm_service.cpp
 * @brief The AVM service's one factory and its handlers, for bb-avm-sim and the in-process FFI alike.
 *
 * Simulate reaches the world state and the contract DB through its host, as the targets "wsdb" and "cdb": in-process
 * the host binds them (ipc-runtime's `hostCall` option); bb-avm-sim connects to them itself, at the paths its
 * `--host-call wsdb=<path>` and `--host-call cdb=<path>` name. SimulateWithHints reads neither: its hints answer
 * every read.
 */
#include "barretenberg/avm/avm_service.hpp"
#include "barretenberg/avm/avm_simulate.hpp"
#include "barretenberg/avm/avm_simulate_with_hints.hpp"
#include "barretenberg/avm/generated/avm_dispatch.hpp"
#include "ipc_codegen/host_call_backend.hpp"

#include <memory>

namespace bb::avm {

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token{ nullptr };
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> g_cancel_simulations_on_signal{ false };

namespace {

/** The host's world state and contract DB, bound once: a HostCallBackend holds only its target's name. */
struct AvmContext {
    wsdb::WsdbIpcClient wsdb{ ipc_codegen::AnyBackend(ipc_codegen::HostCallBackend("wsdb")) };
    cdb::CdbIpcContractDB cdb{ ipc_codegen::AnyBackend(ipc_codegen::HostCallBackend("cdb")) };
    /**
     * Reused across simulations and cleared of any prior cancellation, and it lives as long as the instance: a
     * per-request token could be freed while a signal handler still dereferences it.
     */
    avm2::simulation::CancellationTokenPtr cancellation = std::make_shared<avm2::simulation::CancellationToken>();
};

} // namespace

template <>
void handle_simulate(AvmContext& ctx, wire::AvmSimulate&& command, Responder<wire::AvmSimulateResponse> respond)
{
    // NOTE: cancellation is process-scoped (a signal), not request-scoped. A signal delivered late, after its target
    // finished and the next simulation began, would cancel the wrong one. The pool runs one simulation per process
    // and signals only the in-flight one, so this isn't exercised today; hardening it would need a request-scoped
    // cancel channel rather than a signal.
    ctx.cancellation->reset();
    const bool on_signal = g_cancel_simulations_on_signal.load(std::memory_order_acquire);
    if (on_signal) {
        g_active_cancellation_token.store(ctx.cancellation.get(), std::memory_order_release);
    }
    try {
        auto result = simulate(ctx.cdb, ctx.wsdb, command.inputs, ctx.cancellation);
        if (on_signal) {
            g_active_cancellation_token.store(nullptr, std::memory_order_release);
        }
        respond.ok(wire::AvmSimulateResponse{ .result = std::move(result) });
    } catch (const std::exception& e) {
        if (on_signal) {
            g_active_cancellation_token.store(nullptr, std::memory_order_release);
        }
        respond.error(e.what());
    }
}

template <>
void handle_simulate_with_hints(AvmContext& /*ctx*/,
                                wire::AvmSimulateWithHints&& command,
                                Responder<wire::AvmSimulateWithHintsResponse> respond)
{
    respond.ok(wire::AvmSimulateWithHintsResponse{ .result = simulate_with_hints(command.inputs) });
}

/** One instance of the AVM: no state of its own beyond the targets its host calls reach. */
std::unique_ptr<Service> make_service()
{
    return std::make_unique<ContextService<AvmContext>>();
}

} // namespace bb::avm
