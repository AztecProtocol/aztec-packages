#include "barretenberg/avm/avm_simulate.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2_wsdb/wsdb_ipc_merkle_db.hpp"

namespace bb::avm {

std::vector<uint8_t> simulate(cdb::CdbIpcContractDB& cdb,
                              wsdb::WsdbIpcClient& wsdb,
                              const std::vector<uint8_t>& inputs,
                              const avm2::simulation::CancellationTokenPtr& cancellation_token)
{
    auto sim_inputs = avm2::AvmFastSimulationInputs::from(inputs);

    // The caller owns fork lifecycle and registers the matching contracts DB before simulating. Fork ID 0 is valid.
    uint64_t fork_id = sim_inputs.ws_revision.forkId;
    vinfo("Using external WSDB fork ", fork_id, " for AVM simulation");
    cdb.set_fork_id(fork_id);

    // blockNumber = LATEST routes the world state through its non-historical path, so the fork's uncommitted leaves
    // are visible.
    world_state::WorldStateRevision revision = {
        .forkId = fork_id,
        .blockNumber = world_state::WorldStateRevision::LATEST,
        .includeUncommitted = true,
    };
    avm2::simulation::WsdbIpcMerkleDB merkle_db(wsdb, revision);

    avm2::AvmSimulationHelper simulation_helper;
    auto result = sim_inputs.config.collect_hints
                      ? simulation_helper.simulate_for_hint_collection_internal(cdb,
                                                                                merkle_db,
                                                                                sim_inputs.config,
                                                                                sim_inputs.tx,
                                                                                sim_inputs.global_variables,
                                                                                sim_inputs.protocol_contracts,
                                                                                cancellation_token)
                      : simulation_helper.simulate_fast_internal(cdb,
                                                                 merkle_db,
                                                                 sim_inputs.config,
                                                                 sim_inputs.tx,
                                                                 sim_inputs.global_variables,
                                                                 sim_inputs.protocol_contracts,
                                                                 cancellation_token);
    msgpack::sbuffer buf;
    msgpack::pack(buf, result);
    return { buf.data(), buf.data() + buf.size() };
}

} // namespace bb::avm
