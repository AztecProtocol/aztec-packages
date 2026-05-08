#pragma once
/**
 * @file cdb_execute.hpp
 * @brief CdbCommand NamedUnion, CdbRequest context, and dispatch function.
 */

#include "barretenberg/cdb/cdb_commands.hpp"
#include "barretenberg/common/named_union.hpp"

namespace bb::cdb {

/**
 * @brief Error response returned when a command fails.
 */
struct CdbErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CdbErrorResponse";
    std::string message;
    SERIALIZATION_FIELDS(message);
    bool operator==(const CdbErrorResponse&) const = default;
};

/**
 * @brief Union of all cdb commands (request types).
 */
using CdbCommand = NamedUnion<CdbGetContractInstance,
                              CdbGetContractClass,
                              CdbGetBytecodeCommitment,
                              CdbGetDebugFunctionName,
                              CdbAddContracts,
                              CdbCreateCheckpoint,
                              CdbCommitCheckpoint,
                              CdbRevertCheckpoint,
                              CdbAddContractClass,
                              CdbAddContractInstance,
                              CdbRegisterFunctionSignatures,
                              CdbGetContractClassIds,
                              CdbShutdown>;

/**
 * @brief Union of all cdb response types.
 */
using CdbCommandResponse = NamedUnion<CdbErrorResponse,
                                      CdbGetContractInstance::Response,
                                      CdbGetContractClass::Response,
                                      CdbGetBytecodeCommitment::Response,
                                      CdbGetDebugFunctionName::Response,
                                      CdbAddContracts::Response,
                                      CdbCreateCheckpoint::Response,
                                      CdbCommitCheckpoint::Response,
                                      CdbRevertCheckpoint::Response,
                                      CdbAddContractClass::Response,
                                      CdbAddContractInstance::Response,
                                      CdbRegisterFunctionSignatures::Response,
                                      CdbGetContractClassIds::Response,
                                      CdbShutdown::Response>;

} // namespace bb::cdb
