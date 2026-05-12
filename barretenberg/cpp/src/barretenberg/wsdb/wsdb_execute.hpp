#pragma once
/**
 * @file wsdb_execute.hpp
 * @brief WsdbCommand NamedUnion, WsdbRequest context, and dispatch function.
 */

#include "barretenberg/common/named_union.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/wsdb_commands.hpp"

namespace bb::wsdb {

/**
 * @brief Context passed to each command's execute() method, providing access to the WorldState.
 */
struct WsdbRequest {
    world_state::WorldState& world_state;
};

/**
 * @brief Error response returned when a command fails.
 */
struct WsdbErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "WsdbErrorResponse";
    std::string message;
    SERIALIZATION_FIELDS(message);
    bool operator==(const WsdbErrorResponse&) const = default;
};

/**
 * @brief Union of all wsdb commands (request types).
 */
using WsdbCommand = NamedUnion<WsdbGetTreeInfo,
                               WsdbGetStateReference,
                               WsdbGetInitialStateReference,
                               WsdbGetLeafValue,
                               WsdbGetLeafPreimage,
                               WsdbGetSiblingPath,
                               WsdbGetBlockNumbersForLeafIndices,
                               WsdbFindLeafIndices,
                               WsdbFindLowLeaf,
                               WsdbFindSiblingPaths,
                               WsdbAppendLeaves,
                               WsdbBatchInsert,
                               WsdbSequentialInsert,
                               WsdbUpdateArchive,
                               WsdbCommit,
                               WsdbRollback,
                               WsdbSyncBlock,
                               WsdbCreateFork,
                               WsdbDeleteFork,
                               WsdbFinalizeBlocks,
                               WsdbUnwindBlocks,
                               WsdbRemoveHistoricalBlocks,
                               WsdbGetStatus,
                               WsdbCreateCheckpoint,
                               WsdbCommitCheckpoint,
                               WsdbRevertCheckpoint,
                               WsdbCommitAllCheckpoints,
                               WsdbRevertAllCheckpoints,
                               WsdbCopyStores,
                               WsdbShutdown>;

/**
 * @brief Union of all wsdb response types.
 */
using WsdbCommandResponse = NamedUnion<WsdbErrorResponse,
                                       WsdbGetTreeInfo::Response,
                                       WsdbGetStateReference::Response,
                                       WsdbGetInitialStateReference::Response,
                                       WsdbGetLeafValue::Response,
                                       WsdbGetLeafPreimage::Response,
                                       WsdbGetSiblingPath::Response,
                                       WsdbGetBlockNumbersForLeafIndices::Response,
                                       WsdbFindLeafIndices::Response,
                                       WsdbFindLowLeaf::Response,
                                       WsdbFindSiblingPaths::Response,
                                       WsdbAppendLeaves::Response,
                                       WsdbBatchInsert::Response,
                                       WsdbSequentialInsert::Response,
                                       WsdbUpdateArchive::Response,
                                       WsdbCommit::Response,
                                       WsdbRollback::Response,
                                       WsdbSyncBlock::Response,
                                       WsdbCreateFork::Response,
                                       WsdbDeleteFork::Response,
                                       WsdbFinalizeBlocks::Response,
                                       WsdbUnwindBlocks::Response,
                                       WsdbRemoveHistoricalBlocks::Response,
                                       WsdbGetStatus::Response,
                                       WsdbCreateCheckpoint::Response,
                                       WsdbCommitCheckpoint::Response,
                                       WsdbRevertCheckpoint::Response,
                                       WsdbCommitAllCheckpoints::Response,
                                       WsdbRevertAllCheckpoints::Response,
                                       WsdbCopyStores::Response,
                                       WsdbShutdown::Response>;

/**
 * @brief Execute a wsdb command using the visitor pattern.
 */
inline WsdbCommandResponse execute(WsdbRequest& request, WsdbCommand&& command)
{
    return std::move(command).visit([&request](auto&& cmd) -> WsdbCommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });
}

/**
 * @brief Top-level wsdb API entry point. Takes a WsdbRequest and dispatches the command.
 */
WsdbCommandResponse wsdb(WsdbRequest& request, WsdbCommand&& command);

} // namespace bb::wsdb
