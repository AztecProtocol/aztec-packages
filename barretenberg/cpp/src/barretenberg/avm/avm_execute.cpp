#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/avm_sim_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2_wsdb/wsdb_ipc_merkle_db.hpp"

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
// AvmSimulate
// ---------------------------------------------------------------------------

template <> wire::AvmSimulateResponse handle_simulate(AvmRequest& request, wire::AvmSimulate&& command)
{
    // Deserialize AvmFastSimulationInputs from opaque bytes
    auto sim_inputs = deserialize_from_msgpack<AvmFastSimulationInputs>(command.inputs);

    // Always use the externally-provided forkId. The caller (TXE / PublicProcessor) is
    // responsible for creating the WSDB fork AND registering its contractsDB on the CDB
    // server before invoking AvmSimulate. Previously we treated forkId == 0 as
    // "no fork provided, create one here" — but 0 is a valid forkId (the genesis fork),
    // and creating a fresh fork here meant CDB had no contractsDB registered for it,
    // producing "no contracts DB registered for forkId N" errors at lookup time.
    uint64_t fork_id = sim_inputs.ws_revision.forkId;
    vinfo("Using external WSDB fork ", fork_id, " for AVM simulation");

    // Route CDB requests to the correct PublicContractsDB via fork ID
    request.cdb_client.set_fork_id(fork_id);

    // Create a cancellation token for this simulation and expose it globally
    // so the SIGUSR1 handler can signal cancellation from TypeScript.
    auto cancellation_token = std::make_shared<avm2::simulation::CancellationToken>();
    g_active_cancellation_token.store(cancellation_token.get(), std::memory_order_release);

    try {
        // Create revision pointing to the fork. blockNumber = LATEST sentinel routes the WSDB
        // through its non-historical (current-state) path so the fork's uncommitted leaves are
        // visible. Using 0 here makes the WSDB treat the query as historical against the empty
        // genesis tree, missing any in-fork uncommitted state (e.g. contracts deployed by an
        // earlier tx in the same block).
        WorldStateRevision revision = {
            .forkId = fork_id,
            .blockNumber = WorldStateRevision::LATEST,
            .includeUncommitted = true,
        };

        // Create IPC-backed MerkleDB and ContractDB
        bb::avm2::simulation::WsdbIpcMerkleDB merkle_db(request.wsdb_client, revision);

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

        // Fork lifecycle is owned by the caller; nothing to clean up here.

        return wire::AvmSimulateResponse{ .result = serialize_to_msgpack(result) };
    } catch (...) {
        g_active_cancellation_token.store(nullptr, std::memory_order_release);
        throw;
    }
}

// ---------------------------------------------------------------------------
// AvmSimulateWithHints
// ---------------------------------------------------------------------------

template <>
wire::AvmSimulateWithHintsResponse handle_simulate_with_hints(AvmRequest& request, wire::AvmSimulateWithHints&& command)
{
    (void)request;

    // Deserialize AvmProvingInputs from opaque bytes
    auto proving_inputs = deserialize_from_msgpack<AvmProvingInputs>(command.inputs);

    // Run simulation with hinted DBs (self-contained, no external DB needed)
    AvmSimAPI api;
    auto result = api.simulate_with_hinted_dbs(proving_inputs);

    return wire::AvmSimulateWithHintsResponse{ .result = serialize_to_msgpack(result) };
}

} // namespace bb::avm
