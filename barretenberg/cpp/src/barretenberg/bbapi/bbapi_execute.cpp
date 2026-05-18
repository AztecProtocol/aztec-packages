#include "bbapi_execute.hpp"

#include <exception>
#include <utility>

namespace bb::bbapi {

namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BBApiRequest global_request;
} // namespace

BBApiRequest& get_global_request()
{
    return global_request;
}

CommandResponse execute(BBApiRequest& request, Command&& command)
{
    // Reset error state before execution
    request.error_message.clear();

    CommandResponse response = std::move(command).visit([&request](auto&& cmd) -> CommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        auto command_response = std::forward<CmdType>(cmd).execute(request);
        using ResponseType = std::decay_t<decltype(command_response)>;
        return CommandResponse(std::in_place_type<ResponseType>, std::move(command_response));
    });

    // Check if an error occurred during execution
    if (!request.error_message.empty()) {
        return CommandResponse(std::in_place_type<ErrorResponse>,
                               ErrorResponse{ .message = std::move(request.error_message) });
    }

    return response;
}

CommandResponse bbapi(Command&& command)
{
#ifndef BB_NO_EXCEPTIONS
    try {
#endif
        return execute(get_global_request(), std::move(command));
#ifndef BB_NO_EXCEPTIONS
    } catch (const std::exception& e) {
        return CommandResponse(std::in_place_type<ErrorResponse>, ErrorResponse{ .message = e.what() });
    }
#endif
}
} // namespace bb::bbapi
