#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <cstring>
#include <vector>
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
    // Execute the command using the global request and return the response
    return execute(global_request, std::move(command));
}

} // namespace bb::bbapi

// Use CBIND macro to export the bbapi function for WASM
CBIND_NOSCHEMA(bbapi, bb::bbapi::bbapi)

// C wrapper for ClientIVC VK generation
extern "C" {

/**
 * @brief Generate standalone verification key for ClientIVC circuit
 *
 * @param bytecode Pointer to circuit bytecode
 * @param bytecode_len Length of bytecode
 * @param out_vk Pointer to store allocated VK data
 * @param out_vk_len Pointer to store VK data length
 * @return int 0 on success, non-zero on error
 */
int bbapi_compute_standalone_vk(const uint8_t* bytecode, size_t bytecode_len, uint8_t** out_vk, size_t* out_vk_len)
{
    try {
        // Convert bytecode to vector
        std::vector<uint8_t> bytecode_vec(bytecode, bytecode + bytecode_len);

        // Execute the command
        bb::bbapi::BBApiRequest request{ .trace_settings = { bb::TraceSettings{ bb::AZTEC_TRACE_STRUCTURE } } };
        auto response = bb::bbapi::ClientIvcComputeStandaloneVk{
            .circuit = { .name = "standalone_circuit", .bytecode = std::move(bytecode_vec) }
        }.execute(request);

        // Allocate memory for output
        *out_vk_len = response.bytes.size();
        *out_vk = static_cast<uint8_t*>(malloc(*out_vk_len));
        if (*out_vk == nullptr) {
            return -1; // Memory allocation failed
        }

        // Copy the VK data
        std::memcpy(*out_vk, response.bytes.data(), *out_vk_len);

        return 0; // Success
    } catch (...) {
        return -1; // Error
    }
}

} // extern "C"
