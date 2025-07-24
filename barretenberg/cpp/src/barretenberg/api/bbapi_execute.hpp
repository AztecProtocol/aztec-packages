#pragma once

#include "barretenberg/api/bbapi.hpp"
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
        if constexpr (RequiresBBApiRequest<CmdType>) {
            return cmd.execute(request);
        } else {
            return cmd.execute(request);
        }
    });
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBApiRequest&& request, std::vector<Command>&& commands)
{
    std::vector<CommandResponse> responses;
    responses.reserve(commands.size());
    for (Command& command : commands) {
        try {
            responses.push_back(execute(request, std::move(command)));
        } catch (const std::exception& e) {
            // If there was an error, we stop processing further commands.
            throw_or_abort(e.what());
        }
    }
    return responses;
}

} // namespace bb::bbapi

namespace bb {
template <typename T>
inline typename T::Response do_bbapi(T&& command)
    requires(!bbapi::RequiresBBApiRequest<T>)
{
    bbapi::BBApiRequest request;
    return command.execute(request);
}

template <bbapi::RequiresBBApiRequest T> inline typename T::Response do_bbapi(bbapi::BBApiRequest& request, T&& command)
{
    return command.execute(request);
}
} // namespace bb