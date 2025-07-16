#include "c_bind.hpp"
#include "barretenberg/api/bbapi_execute.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {

/**
 * @brief Main API function that processes commands and returns responses
 *
 * @param command The command to execute
 * @return CommandResponse The response from executing the command
 */
CommandResponse bbapi(const Command& command)
{
    // Create a request context - in the real implementation this might need to be managed differently
    BBApiRequest request;

    // Execute the command and return the response
    return execute(request, command);
}

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND(bbapi, bb::bbapi::bbapi)
