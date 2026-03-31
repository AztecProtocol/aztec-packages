#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {
namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BbRequest global_request;
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
auto global_handler = make_bb_handler(global_request);
} // namespace
} // namespace bb::bbapi

// WASM entrypoint: raw msgpack bytes in → raw msgpack bytes out.
// Uses the same generated string-based dispatch as the IPC server.
// The input is [[CommandName, {payload}]], the output is [ResponseName, {payload}].
WASM_EXPORT void bbapi(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out)
{
    std::vector<uint8_t> input(input_in, input_in + input_len_in);
    auto output = bb::bbapi::global_handler(input);

    // Allocate output buffer (caller frees)
    *output_len_out = output.size();
    // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
    *output_out = static_cast<uint8_t*>(aligned_alloc(64, output.size()));
    memcpy(*output_out, output.data(), output.size());
}
