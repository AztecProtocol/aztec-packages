#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <cstring>
#include <map>
#include <mutex>

namespace bb::bbapi {

// Global map to store BBApiRequest objects by request ID
namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::map<uint128_t, BBApiRequest> request_map;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::mutex request_map_mutex;

/**
 * @brief Convert a vector of bytes to uint128_t
 * @param bytes Vector of 16 bytes
 * @return uint128_t representation
 */
uint128_t bytes_to_uint128(const std::vector<uint8_t>& bytes)
{
    if (bytes.size() != 16) {
        throw_or_abort("Request ID must be exactly 16 bytes");
    }
    uint128_t result = 0;
    for (size_t i = 0; i < 16; ++i) {
        result = (result << 8) | bytes[i];
    }
    return result;
}
} // namespace

/**
 * @brief Main API function that processes commands and returns responses
 *
 * @param request_id_bytes The request ID as a vector of 16 bytes
 * @param command The command to execute
 * @return CommandResponse The response from executing the command
 */
CommandResponse bbapi(const std::vector<uint8_t>& request_id_bytes, Command&& command)
{
    uint128_t request_id = bytes_to_uint128(request_id_bytes);

    std::lock_guard<std::mutex> lock(request_map_mutex);

    // Get or create the BBApiRequest for this request ID
    auto& request = request_map[request_id];

    // Execute the command and return the response
    return execute(request, std::move(command));
}

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND_NOSCHEMA(bbapi, bb::bbapi::bbapi)
