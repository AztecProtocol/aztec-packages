#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
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

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND_NOSCHEMA(bbapi, bb::bbapi::bbapi)
