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

// The response to a command.
template <typename T> struct BBRpcResponse {
    /** The response object. Default-constructed if there was an error. */
    CommandResponse response;
    /* If present, this command had an error. This describes it. */
    std::string error_message;
};

inline BBRpcResponse<CircuitLoad::Reponse> execute(BBRpcRequest& request, CircuitLoad&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement CircuitLoad command");
}

inline BBRpcResponse<CircuitDrop::Reponse> execute(BBRpcRequest& request, CircuitDrop&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement CircuitDrop command");
}

inline BBRpcResponse<CircuitProve::Response> execute(BBRpcRequest& request, CircuitProve&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement CircuitProve command");
}

inline BBRpcResponse<ClientIvcStart::Reponse> execute(BBRpcRequest& request, ClientIvcStart&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement ClientIvcStart command");
}

inline BBRpcResponse<ClientIvcProve::Reponse> execute(BBRpcRequest& request, ClientIvcProve&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement ClientIvcProve command");
}

inline BBRpcResponse<ClientIvcAccumulate::Reponse> execute(BBRpcRequest& request, ClientIvcAccumulate&& command)
{
    (void)request;
    (void)command;
    throw std::runtime_error("TODO: Implement ClientIvcAccumulate command");
}

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline BBRpcResponse<CommandResponse> execute(BBRpcRequest& request, Command&& command)
{
    return std::visit(
        [&request](auto&& cmd) -> BBRpcResponse<CommandResponse> {
            auto response = execute(request, std::forward<decltype(cmd)>(cmd));
            return { response.response, response.error_message };
        },
        std::move(command));
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<BBRpcResponse<CommandResponse>> execute_request(BBRpcRequest&& request)
{
    std::vector<BBRpcResponse<CommandResponse>> responses;
    responses.reserve(request.commands.size());
    for (Command& command : request.commands) {
        responses.push_back(execute(request, std::move(command)));
        if (!responses.back().error_message.empty()) {
            // If there was an error, we stop processing further commands.
            break;
        }
    }
    return responses;
}

} // namespace bb::bbrpc
