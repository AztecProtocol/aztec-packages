#pragma once

#include "barretenberg/api/bbrpc_circuit_registry.hpp"
#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include <queue>

namespace bb::bbrpc {

struct BBRpcRequest {
    RequestId request_id;
    std::shared_ptr<BBRpcCircuitRegistry> circuit_registry;
    std::unique_ptr<ClientIVC> ivc_in_progress;
    std::vector<Command> commands;

    BBRpcRequest(RequestId request_id, std::vector<Command>&& commands)
        : request_id(request_id)
        , commands(std::move(commands))
    {}
};

const std::string& get_error_message(const CommandResponse& response)
{
    return std::visit([](const auto& resp) -> const std::string& { return resp.error_message; }, response);
}

inline CircuitProve::Response execute(BBRpcRequest& request, CircuitProve&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement CircuitLoad command");
}

// ... etc

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBRpcRequest& request, Command&& command)
{
    return std::visit(
        [&request](auto&& cmd) -> CommandResponse { return execute(request, std::forward<decltype(cmd)>(cmd)); },
        std::move(command));
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBRpcRequest&& request)
{
    std::vector<CommandResponse> responses;
    responses.reserve(request.commands.size());
    for (Command& command : request.commands) {
        responses.push_back(execute(request, std::move(command)));
        if (!get_error_message(responses.back()).empty()) {
            // If there was an error, we stop processing further commands.
            break;
        }
    }
    return responses;
}

} // namespace bb::bbrpc
