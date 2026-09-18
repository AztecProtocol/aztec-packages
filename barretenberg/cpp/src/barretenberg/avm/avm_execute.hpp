#pragma once
/**
 * @file avm_execute.hpp
 * @brief AVM IPC handler context.
 */

#include "barretenberg/avm/generated/avm_ipc_server.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/vm2_wsdb/generated/wsdb_ipc_client.hpp"

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

} // namespace bb::avm
