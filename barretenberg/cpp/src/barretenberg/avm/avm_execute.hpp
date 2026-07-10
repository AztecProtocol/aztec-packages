#pragma once
/**
 * @file avm_execute.hpp
 * @brief AVM IPC handler context.
 */

#include "barretenberg/avm/generated/avm_ipc_server.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

#include <atomic>

namespace bb::avm {

/** Global cancellation token for the active simulation. SIGUSR1 handler uses this. */
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token;

/**
 * @brief Context passed to each command's execute() method.
 * Provides access to WSDB and CDB IPC clients.
 */
struct AvmRequest {
    cdb::CdbIpcContractDB& cdb_client;
    wsdb::WsdbIpcClient& wsdb_client;
};

// Explicit specialization declarations. avm_execute.cpp defines these; declaring
// them here makes them visible to every translation unit that instantiates
// make_avm_handler<AvmRequest> (the bb-avm-sim executable's socket server and the
// avm_ffi library's in-process entry), so both link against the specializations
// rather than implicitly instantiating the definition-less primary template.
template <>
void handle_simulate(AvmRequest& request, wire::AvmSimulate&& command, Responder<wire::AvmSimulateResponse> respond);
template <>
void handle_simulate_with_hints(AvmRequest& request,
                                wire::AvmSimulateWithHints&& command,
                                Responder<wire::AvmSimulateWithHintsResponse> respond);

} // namespace bb::avm
