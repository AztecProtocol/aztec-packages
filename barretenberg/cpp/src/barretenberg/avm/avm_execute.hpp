#pragma once
/**
 * @file avm_execute.hpp
 * @brief AVM IPC handler context.
 */

#include "barretenberg/avm/generated/avm_ipc_server.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

#include <atomic>
#include <cstdint>
#include <functional>

namespace bb::avm {

/** Global cancellation token for the active simulation. SIGUSR1 handler uses this. */
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token;

/**
 * @brief Context passed to each command's execute() method.
 *
 * Holds the world-state client and the contract-DB interface the simulation reads from — the latter as the
 * transport-agnostic `ContractDBInterface`, so the same handler serves the out-of-process (socket) CDB and
 * the in-process (host-call) CDB. `set_fork_id` routes CDB requests to the right fork; it's a closure over
 * the concrete client because fork routing is a transport concern, not part of the AVM's DB interface.
 */
struct AvmRequest {
    avm2::simulation::ContractDBInterface& cdb_client;
    wsdb::WsdbIpcClient& wsdb_client;
    std::function<void(uint64_t)> set_fork_id;
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
