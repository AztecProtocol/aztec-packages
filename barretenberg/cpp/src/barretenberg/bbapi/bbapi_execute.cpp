#include "bbapi_execute.hpp"
#include <type_traits>
#include <utility>

namespace bb::bbapi {

CommandResponse execute(BBApiRequest& request, Command&& command)
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

namespace { // anonymous
struct Api {
    Command commands;
    bb::bbapi::CommandResponse responses;
    SERIALIZATION_FIELDS(commands, responses);
};
} // namespace
std::string get_msgpack_schema_as_json()
{
    return msgpack_schema_to_string(Api{});
}
} // namespace bb::bbapi
