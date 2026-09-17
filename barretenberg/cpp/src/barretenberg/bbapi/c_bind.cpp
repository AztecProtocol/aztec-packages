#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <exception>

namespace bb::bbapi {

// Global BBApiRequest object in anonymous namespace
namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BBApiRequest global_request;

#ifndef BB_NO_EXCEPTIONS
void write_error_response(const char* message, uint8_t** output_out, size_t* output_len_out)
{
    CommandResponse response = ErrorResponse{ .message = message };
    auto [output, output_len] = msgpack_encode_buffer(response, *output_out, *output_len_out);
    *output_out = output;
    *output_len_out = output_len;
}
#endif
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

} // namespace bb::bbapi

WASM_EXPORT void bbapi(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out)
{
#ifndef BB_NO_EXCEPTIONS
    try {
#endif
        msgpack_cbind_impl(bb::bbapi::bbapi, input_in, input_len_in, output_out, output_len_out);
#ifndef BB_NO_EXCEPTIONS
    } catch (const std::exception& e) {
        bb::bbapi::write_error_response(e.what(), output_out, output_len_out);
    } catch (...) {
        bb::bbapi::write_error_response("bbapi: unknown exception", output_out, output_len_out);
    }
#endif
}
