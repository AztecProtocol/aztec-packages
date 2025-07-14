#pragma once

#include "barretenberg/api/bbapi_client_ivc.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/api/bbapi_ultra_honk.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <vector>

namespace bb::bbapi {

using Command = NamedUnion<CircuitProve,
                           CircuitComputeVk,
                           CircuitInfo,
                           CircuitCheck,
                           CircuitVerify,
                           ClientIvcComputeStandaloneVk,
                           ClientIvcComputeIvcVk,
                           ClientIvcStart,
                           ClientIvcLoad,
                           ClientIvcAccumulate,
                           ClientIvcProve,
                           ProofAsFields,
                           VkAsFields,
                           CircuitWriteSolidityVerifier,
                           CircuitProveAndVerify,
                           CircuitBenchmark,
                           ClientIvcCheckPrecomputedVk>;

using CommandResponse = NamedUnion<CircuitProve::Response,
                                   CircuitComputeVk::Response,
                                   CircuitInfo::Response,
                                   CircuitCheck::Response,
                                   CircuitVerify::Response,
                                   ClientIvcComputeStandaloneVk::Response,
                                   ClientIvcComputeIvcVk::Response,
                                   ClientIvcStart::Response,
                                   ClientIvcLoad::Response,
                                   ClientIvcAccumulate::Response,
                                   ClientIvcProve::Response,
                                   ProofAsFields::Response,
                                   VkAsFields::Response,
                                   CircuitWriteSolidityVerifier::Response,
                                   CircuitProveAndVerify::Response,
                                   CircuitBenchmark::Response,
                                   ClientIvcCheckPrecomputedVk::Response>;

// Specifically check for ClientIvcStart, ClientIvcLoad, ClientIvcAccumulate, and ClientIvcProve
// Helps type-check C++ code, but we don't use this distinction for RPC commands or WASM.
template <typename T>
concept RequiresBBApiRequest = std::is_same_v<T, ClientIvcStart> || std::is_same_v<T, ClientIvcLoad> ||
                               std::is_same_v<T, ClientIvcAccumulate> || std::is_same_v<T, ClientIvcProve>;

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBApiRequest& request, Command&& command)
{
    return std::move(command).visit([&request](auto&& cmd) -> CommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBApiRequest&& request, std::vector<Command>&& commands)
{
    std::vector<CommandResponse> responses;
    responses.reserve(commands.size());
    for (Command& command : commands) {
        responses.push_back(execute(request, std::move(command)));
    }
    return responses;
}

} // namespace bb::bbapi
