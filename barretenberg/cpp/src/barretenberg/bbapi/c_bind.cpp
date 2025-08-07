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
#ifndef NO_MULTITHREADING
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::mutex request_mutex;
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
#ifndef NO_MULTITHREADING
    // Try to lock, but error if it would block (indicating concurrent access)
    std::unique_lock<std::mutex> lock(request_mutex, std::try_to_lock);
    if (!lock.owns_lock()) {
        throw_or_abort("BB API is meant for single-threaded (queued) use only");
    }
#endif

    // Execute the command using the global request and return the response
    return execute(global_request, std::move(command));
}

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND_NOSCHEMA(bbapi, bb::bbapi::bbapi)
