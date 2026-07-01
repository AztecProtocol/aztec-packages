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
using bb::crypto::merkle_tree::WorldStateRevision;

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

template <>
void handle_simulate(AvmRequest& request, wire::AvmSimulate&& command, Responder<wire::AvmSimulateResponse> respond)
{
    // Reuse the process-lifetime token (cleared of any prior cancellation) instead
    // of allocating a per-request one the signal handler could outlive.
    g_sim_cancellation_token->reset();
    const avm2::simulation::CancellationTokenPtr& cancellation_token = g_sim_cancellation_token;
    try {
        auto sim_inputs = deserialize_from_msgpack<AvmFastSimulationInputs>(command.inputs);

        // The caller owns fork lifecycle and registers the matching contracts DB
        // on the CDB server before invoking AvmSimulate. Fork ID 0 is valid.
        uint64_t fork_id = sim_inputs.ws_revision.forkId;
        vinfo("Using external WSDB fork ", fork_id, " for AVM simulation");

        request.cdb_client.set_fork_id(fork_id);

        g_active_cancellation_token.store(cancellation_token.get(), std::memory_order_release);

        // Create revision pointing to the fork. blockNumber = LATEST sentinel routes the WSDB
        // through its non-historical path so the fork's uncommitted leaves are visible.
        WorldStateRevision revision = {
            .forkId = fork_id,
            .blockNumber = WorldStateRevision::LATEST,
            .includeUncommitted = true,
        };

        bb::avm2::simulation::WsdbIpcMerkleDB merkle_db(request.wsdb_client, revision);

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

        respond.ok(wire::AvmSimulateResponse{ .result = serialize_to_msgpack(result) });
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
        auto proving_inputs = deserialize_from_msgpack<AvmProvingInputs>(command.inputs);

        AvmSimAPI api;
        auto result = api.simulate_with_hinted_dbs(proving_inputs);

        respond.ok(wire::AvmSimulateWithHintsResponse{ .result = serialize_to_msgpack(result) });
    } catch (const std::exception& e) {
        respond.error(e.what());
    }
}

} // namespace bb::avm
