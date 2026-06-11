#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <cstdlib>
#include <cstring>
#include <vector>

namespace bb::bbapi {

namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BBApiRequest global_request;
} // namespace

} // namespace bb::bbapi

// WASM-exported bbapi entry point. Takes msgpack-encoded `[ [name, payload] ]`
// (tuple-wrapped command in NamedUnion shape), returns msgpack-encoded
// `[name, payload]` (response in NamedUnion shape). The codegen-emitted
// dispatcher owns the command-name → handle_<method> table and runs the
// per-call deserialize / serialize / exception → ErrorResponse plumbing.
WASM_EXPORT void bbapi(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out)
{
    auto handler = bb::bbapi::make_bb_handler(bb::bbapi::global_request);
    std::vector<uint8_t> input(input_in, input_in + input_len_in);
    std::vector<uint8_t> response = handler(input);

    *output_out = static_cast<uint8_t*>(aligned_alloc(64, response.size() + 1));
    std::memcpy(*output_out, response.data(), response.size());
    *output_len_out = response.size();
}
