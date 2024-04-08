#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "sha256.hpp"

using namespace bb;

WASM_EXPORT void sha256__hash(uint8_t const* in, uint32_t const* length_ptr, out_buf32 r)
{
    auto length = ntohl(*length_ptr);
    std::vector<uint8_t> message;
    message.reserve(length);
    for (size_t i = 0; i < length; ++i) {
        message.emplace_back(in[i]);
    }
    const auto output = crypto::sha256(message);
    std::copy(output.begin(), output.end(), r);
}
