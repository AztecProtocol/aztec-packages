#include "barretenberg/common/wasm_export.hpp"
#include "sha256.hpp"

using namespace bb;

WASM_EXPORT void sha256__hash(uint8_t* in, const size_t length, uint8_t* r)
{
    std::vector<uint8_t> message;
    message.reserve(length);
    for (size_t i = 0; i < length; ++i) {
        message.emplace_back(in[i]);
    }
    const auto output = crypto::sha256(message);
    for (size_t i = 0; i < 32; ++i) {
        r[i] = output[i];
    }
}
