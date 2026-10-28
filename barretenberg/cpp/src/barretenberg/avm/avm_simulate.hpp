#pragma once

#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/vm2/simulation/lib/cancellation_token.hpp"
#include "barretenberg/vm2_wsdb/wsdb_ipc_client.hpp"

#include <cstdint>
#include <vector>

namespace bb::avm {

/**
 * @brief Simulate a transaction against a world state and contract DB the caller reaches through `wsdb` and `cdb`.
 *
 * The caller owns the fork: the inputs name it, the world state reads go to it at its latest uncommitted state, and
 * the contract DB requests carry its id so the host routes them to that fork's contracts DB.
 *
 * @param inputs A msgpack AvmFastSimulationInputs.
 * @return The msgpack TxSimulationResult.
 */
std::vector<uint8_t> simulate(cdb::CdbIpcContractDB& cdb,
                              wsdb::WsdbIpcClient& wsdb,
                              const std::vector<uint8_t>& inputs,
                              const avm2::simulation::CancellationTokenPtr& cancellation_token = nullptr);

} // namespace bb::avm
