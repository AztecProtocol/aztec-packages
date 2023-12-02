#include "rust_bind.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/serialize.hpp"
#include "pedersen.hpp"

extern "C" {

using namespace barretenberg;

WASM_EXPORT const char* rust_pedersen_hash(uint8_t const* inputs_buffer, uint32_t const* hash_index, uint8_t* output)
{
    try {
    std::vector<grumpkin::fq> to_hash;
    read(inputs_buffer, to_hash);
    crypto::GeneratorContext<curve::Grumpkin> ctx;
    ctx.offset = static_cast<size_t>(*hash_index);
    auto r = crypto::pedersen_hash::hash(to_hash, ctx);
    barretenberg::fr::serialize_to_buffer(r, output);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}

WASM_EXPORT const char* rust_pedersen_hash_buffer(uint8_t const* input_buffer, uint32_t const* hash_index, uint8_t* output)
{
    try {
    std::vector<uint8_t> to_hash;
    read(input_buffer, to_hash);
    crypto::GeneratorContext<curve::Grumpkin> ctx;
    ctx.offset = static_cast<size_t>(*hash_index);
    auto r = crypto::pedersen_hash::hash_buffer(to_hash, ctx);
    barretenberg::fr::serialize_to_buffer(r, output);
        return nullptr;
    } catch (const std::exception& e) {
        return e.what(); // return the exception message
    }
}
}