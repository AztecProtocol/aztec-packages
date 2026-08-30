#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include <cstdlib>
#include <cstring>
#include <exception>
#include <span>
#include <utility>
#include <vector>

namespace {
// One request context for the process so stateful command sequences
// (ChonkStart/Load/Accumulate/Prove) share IVC state, mirroring a serve loop's
// single connection context.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
bb::bbapi::BBApiRequest global_request;
} // namespace

/**
 * @brief In-process FFI/wasm entrypoint: the ipc-codegen FFI backend contract.
 *
 * Takes exactly the msgpack command payload a transport client would put inside
 * a frame (no length/id envelope — framing is transport-level and an in-process
 * call has none) and answers through the same generated dispatch the pipe /
 * socket / shared-memory servers use. The output buffer is aligned_alloc'd and
 * owned by the caller (free()-compatible), matching the cbind buffer contract.
 */
WASM_EXPORT void ipc_ffi_entry(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len)
{
    static auto handler = bb::bbapi::make_bb_handler(global_request);
    std::vector<uint8_t> response;
    // The dispatch answers a malformed envelope, an unknown command and a
    // throwing handler with an error frame, but an unpack or convert failure
    // still escapes it. There is no frame to carry an exception across an FFI
    // boundary, so anything that gets this far has to become a response.
#ifndef BB_NO_EXCEPTIONS
    try {
#endif
        handler(std::span<const uint8_t>(input, input_len),
                [&response](std::vector<uint8_t> r) { response = std::move(r); });
#ifndef BB_NO_EXCEPTIONS
    } catch (const std::exception& e) {
        response = bb::bbapi::detail::make_error(e.what());
    } catch (...) {
        response = bb::bbapi::detail::make_error("bbapi: unknown exception");
    }
#endif
    // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
    auto* out = static_cast<uint8_t*>(aligned_alloc(64, response.size()));
    std::memcpy(out, response.data(), response.size());
    *output = out;
    *output_len = response.size();
}
