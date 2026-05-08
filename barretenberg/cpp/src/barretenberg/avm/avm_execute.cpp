#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/wsdb/wsdb_commands.hpp"
#include "barretenberg/wsdb_client/wsdb_ipc_merkle_db.hpp"

namespace bb::avm {

using namespace bb::avm2;
using namespace bb::world_state;

// Global cancellation token for the currently active simulation.
// Set before simulation starts, cleared after. SIGUSR1 handler reads this to cancel.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<avm2::simulation::CancellationToken*> g_active_cancellation_token{ nullptr };

// ---------------------------------------------------------------------------
// Helper: serialize a value to msgpack bytes
// ---------------------------------------------------------------------------

template <typename T> static std::vector<uint8_t> serialize_to_msgpack(const T& value)
{
    msgpack::sbuffer buf;
    msgpack::pack(buf, value);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

template <typename T> static T deserialize_from_msgpack(const std::vector<uint8_t>& bytes)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    T value;
    unpacked.get().convert(value);
    return value;
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

AvmCommandResponse avm_dispatch(AvmRequest& request, AvmCommand&& command)
{
    return execute(request, std::move(command));
}

// ---------------------------------------------------------------------------
// AvmSimulate
// ---------------------------------------------------------------------------

AvmSimulate::Response AvmSimulate::execute(AvmRequest& request) &&
{
    // Deserialize AvmFastSimulationInputs from opaque bytes
    auto sim_inputs = deserialize_from_msgpack<AvmFastSimulationInputs>(inputs);

    // If a fork ID was provided (block builder's fork), use it directly.
    // Otherwise create a temporary fork for this simulation.
    const bool use_external_fork = sim_inputs.ws_revision.forkId != 0;
    uint64_t fork_id = sim_inputs.ws_revision.forkId;

    if (!use_external_fork) {
        auto fork_resp = request.wsdb_client.create_fork(wsdb::WsdbCreateFork{ .latest = true, .blockNumber = 0 });
        fork_id = fork_resp.forkId;
        vinfo("Created WSDB fork ", fork_id, " for AVM simulation");
    } else {
        vinfo("Using external WSDB fork ", fork_id, " for AVM simulation");
    }

    // Route CDB requests to the correct PublicContractsDB via fork ID
    request.cdb_client.set_fork_id(fork_id);

    // Create a cancellation token for this simulation and expose it globally
    // so the SIGUSR1 handler can signal cancellation from TypeScript.
    auto cancellation_token = std::make_shared<avm2::simulation::CancellationToken>();
    g_active_cancellation_token.store(cancellation_token.get(), std::memory_order_release);

    try {
        // Create revision pointing to the fork
        WorldStateRevision revision = {
            .forkId = fork_id,
            .blockNumber = 0,
            .includeUncommitted = true,
        };

        // Create IPC-backed MerkleDB and ContractDB
        bb::wsdb_client::WsdbIpcMerkleDB merkle_db(request.wsdb_client, revision);

        // Run simulation using the helper that takes raw DB interfaces.
        // Route to hint collection or fast path based on config.
        AvmSimulationHelper simulation_helper;
        auto result = sim_inputs.config.collect_hints
                          ? simulation_helper.simulate_for_hint_collection_internal(request.cdb_client,
                                                                                    merkle_db,
                                                                                    sim_inputs.config,
                                                                                    sim_inputs.tx,
                                                                                    sim_inputs.global_variables,
                                                                                    sim_inputs.protocol_contracts,
                                                                                    cancellation_token)
                          : simulation_helper.simulate_fast_internal(request.cdb_client,
                                                                     merkle_db,
                                                                     sim_inputs.config,
                                                                     sim_inputs.tx,
                                                                     sim_inputs.global_variables,
                                                                     sim_inputs.protocol_contracts,
                                                                     cancellation_token);

        g_active_cancellation_token.store(nullptr, std::memory_order_release);

        // Only clean up fork if we created it
        if (!use_external_fork) {
            request.wsdb_client.delete_fork(wsdb::WsdbDeleteFork{ .forkId = fork_id });
        }

        return Response{ .result = serialize_to_msgpack(result) };
    } catch (...) {
        g_active_cancellation_token.store(nullptr, std::memory_order_release);

        // Only clean up fork on error if we created it
        if (!use_external_fork) {
            try {
                request.wsdb_client.delete_fork(wsdb::WsdbDeleteFork{ .forkId = fork_id });
            } catch (...) {
                // Ignore cleanup errors
            }
        }
        throw;
    }
}

// ---------------------------------------------------------------------------
// AvmSimulateWithHints
// ---------------------------------------------------------------------------

AvmSimulateWithHints::Response AvmSimulateWithHints::execute(AvmRequest& request) &&
{
    (void)request;

    // Deserialize AvmProvingInputs from opaque bytes
    auto proving_inputs = deserialize_from_msgpack<AvmProvingInputs>(inputs);

    // Run simulation with hinted DBs (self-contained, no external DB needed)
    AvmSimAPI api;
    auto result = api.simulate_with_hinted_dbs(proving_inputs);

    return Response{ .result = serialize_to_msgpack(result) };
}

// ---------------------------------------------------------------------------
// AvmShutdown
// ---------------------------------------------------------------------------

AvmShutdown::Response AvmShutdown::execute(AvmRequest& request) &&
{
    (void)request;
    return Response{};
}

} // namespace bb::avm
