#pragma once

#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <vector>

namespace bb::bbapi {

using Command = NamedUnion<CircuitProve,
                           CircuitComputeVk,
                           CircuitStats,
                           CircuitVerify,
                           ClientIvcComputeStandaloneVk,
                           ClientIvcComputeIvcVk,
                           ClientIvcStart,
                           ClientIvcLoad,
                           ClientIvcAccumulate,
                           ClientIvcProve,
                           ClientIvcVerify,
                           VkAsFields,
                           CircuitWriteSolidityVerifier,
                           ClientIvcCheckPrecomputedVk,
                           ClientIvcStats>;

using CommandResponse = NamedUnion<CircuitProve::Response,
                                   CircuitComputeVk::Response,
                                   CircuitStats::Response,
                                   CircuitVerify::Response,
                                   ClientIvcComputeStandaloneVk::Response,
                                   ClientIvcComputeIvcVk::Response,
                                   ClientIvcStart::Response,
                                   ClientIvcLoad::Response,
                                   ClientIvcAccumulate::Response,
                                   ClientIvcProve::Response,
                                   ClientIvcVerify::Response,
                                   VkAsFields::Response,
                                   CircuitWriteSolidityVerifier::Response,
                                   ClientIvcCheckPrecomputedVk::Response,
                                   ClientIvcStats::Response>;

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

// The msgpack scheme is an ad-hoc format that allows for cbind/compiler.ts to
// generate TypeScript bindings for the API.
std::string get_msgpack_schema_as_json();

} // namespace bb::bbapi
