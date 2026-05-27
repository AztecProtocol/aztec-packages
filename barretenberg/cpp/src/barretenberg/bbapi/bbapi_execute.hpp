#pragma once

#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <vector>

namespace bb::bbapi {

using Command = NamedUnion<ChonkComputeVk,
                           ChonkStart,
                           ChonkLoad,
                           ChonkAccumulate,
                           ChonkProve,
                           ChonkVerify,
                           ChonkVerifyFromFields,
                           ChonkBatchVerify,
                           ChonkCheckPrecomputedVk,
                           ChonkStats,
                           ChonkCompressProof,
                           ChonkDecompressProof,
                           ChonkBatchVerifierStart,
                           ChonkBatchVerifierQueue,
                           ChonkBatchVerifierStop,
                           Shutdown>;

using CommandResponse = NamedUnion<ErrorResponse,
                                   ChonkComputeVk::Response,
                                   ChonkStart::Response,
                                   ChonkLoad::Response,
                                   ChonkAccumulate::Response,
                                   ChonkProve::Response,
                                   ChonkVerify::Response,
                                   ChonkVerifyFromFields::Response,
                                   ChonkBatchVerify::Response,
                                   ChonkCheckPrecomputedVk::Response,
                                   ChonkStats::Response,
                                   ChonkCompressProof::Response,
                                   ChonkDecompressProof::Response,
                                   ChonkBatchVerifierStart::Response,
                                   ChonkBatchVerifierQueue::Response,
                                   ChonkBatchVerifierStop::Response,
                                   Shutdown::Response>;

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBApiRequest& request, Command&& command)
{
    // Reset error state before execution
    request.error_message.clear();

    CommandResponse response = std::move(command).visit([&request](auto&& cmd) -> CommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });

    // Check if an error occurred during execution
    if (!request.error_message.empty()) {
        return ErrorResponse{ .message = std::move(request.error_message) };
    }

    return response;
}

// The msgpack scheme is an ad-hoc format that allows for cbind/compiler.ts to
// generate TypeScript bindings for the API.
std::string get_msgpack_schema_as_json();

} // namespace bb::bbapi
