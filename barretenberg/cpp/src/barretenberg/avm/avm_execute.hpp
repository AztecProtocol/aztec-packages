#pragma once
/**
 * @file avm_execute.hpp
 * @brief AvmCommand NamedUnion, AvmRequest context, and dispatch function.
 */

#include "barretenberg/avm/avm_commands.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/wsdb/wsdb_ipc_client_generated.hpp"

namespace bb::avm {

/**
 * @brief Context passed to each command's execute() method.
 * Provides access to WSDB and CDB IPC clients.
 */
struct AvmRequest {
    cdb::CdbIpcContractDB& cdb_client;
    wsdb::WsdbIpcClient& wsdb_client;
};

/**
 * @brief Error response returned when a command fails.
 */
struct AvmErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AvmErrorResponse";
    std::string message;
    SERIALIZATION_FIELDS(message);
    bool operator==(const AvmErrorResponse&) const = default;
};

/**
 * @brief Union of all AVM commands (request types).
 */
using AvmCommand = NamedUnion<AvmSimulate, AvmSimulateWithHints, AvmShutdown>;

/**
 * @brief Union of all AVM response types.
 */
using AvmCommandResponse =
    NamedUnion<AvmErrorResponse, AvmSimulate::Response, AvmSimulateWithHints::Response, AvmShutdown::Response>;

/**
 * @brief Execute an AVM command using the visitor pattern.
 */
inline AvmCommandResponse execute(AvmRequest& request, AvmCommand&& command)
{
    return std::move(command).visit([&request](auto&& cmd) -> AvmCommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });
}

/**
 * @brief Top-level AVM API entry point. Takes an AvmRequest and dispatches the command.
 */
AvmCommandResponse avm_dispatch(AvmRequest& request, AvmCommand&& command);

} // namespace bb::avm
