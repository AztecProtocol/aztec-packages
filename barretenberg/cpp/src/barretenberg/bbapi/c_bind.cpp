#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <string>
#ifndef NO_MULTITHREADING
#include <mutex>
#endif

namespace bb::bbapi {

// Global BBApiRequest object in anonymous namespace
namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BBApiRequest global_request;
} // namespace

/**
 * @brief Main API function that processes commands and returns responses
 *
 * @param command The command to execute
 * @return CommandResponse The response from executing the command
 */
CommandResponse bbapi(Command&& command)
{
#ifndef BB_NO_EXCEPTIONS
    try {
#endif
        // Execute the command using the global request and return the response
        return execute(global_request, std::move(command));
#ifndef BB_NO_EXCEPTIONS
    } catch (const std::exception& e) {
        return ErrorResponse{ .message = e.what() };
    }
#endif
}

namespace {

std::vector<uint8_t> encode_response(const CommandResponse& response)
{
    msgpack::sbuffer response_buffer;
    msgpack::pack(response_buffer, response);
    return { response_buffer.data(), response_buffer.data() + response_buffer.size() };
}

} // namespace

std::string_view msgpack_command_error_message(MsgpackCommandError error, bool cli_context)
{
    switch (error) {
    case MsgpackCommandError::None:
        return "";
    case MsgpackCommandError::ExpectedArgumentTuple:
        if (cli_context) {
            return "Expected an array of size 1 (tuple of arguments) for bbapi command deserialization";
        }
        return "Expected an array of size 1 (tuple of arguments)";
    case MsgpackCommandError::ExpectedCommandTuple:
        return "Expected Command to be an array of size 2 [command-name, payload]";
    case MsgpackCommandError::ExpectedCommandName:
        return "Expected first element of Command to be a string (type name)";
    }
    return "Unknown msgpack command error";
}

MsgpackCommandResult execute_msgpack_command_buffer(std::span<const uint8_t> request)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
    auto obj = unpacked.get();

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
        return { .error = MsgpackCommandError::ExpectedArgumentTuple };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    auto& command_obj = obj.via.array.ptr[0];

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    if (command_obj.type != msgpack::type::ARRAY || command_obj.via.array.size != 2) {
        return { .error = MsgpackCommandError::ExpectedCommandTuple };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    auto& command_arr = command_obj.via.array;
    if (command_arr.ptr[0].type != msgpack::type::STR) {
        return { .error = MsgpackCommandError::ExpectedCommandName };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    const std::string command_name(command_arr.ptr[0].via.str.ptr, command_arr.ptr[0].via.str.size);

    Command command;
    command_obj.convert(command);

    auto response = bbapi(std::move(command));
    return { .response = encode_response(response), .shutdown = command_name == "Shutdown" };
}

std::vector<uint8_t> encode_msgpack_error_response(std::string_view message)
{
    ErrorResponse error_response{ .message = std::string(message) };
    CommandResponse response = error_response;
    return encode_response(response);
}

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND_NOSCHEMA(bbapi, bb::bbapi::bbapi)
