#include "c_bind.hpp"
#include "../pedersen_hash/pedersen.hpp"
#include "barretenberg/common/serialize.hpp"
#include "pedersen.hpp"

WASM_EXPORT void pedersen__init() {}

WASM_EXPORT void pedersen__commit(uint8_t const* inputs_buffer, uint8_t* output)
{
    std::vector<grumpkin::fq> to_compress;
    read(inputs_buffer, to_compress);
    grumpkin::g1::affine_element pedersen_hash = crypto::pedersen_commitment::commit_native(to_compress);

    serialize::write(output, pedersen_hash);
}

WASM_EXPORT void pedersen__buffer_to_field(uint8_t const* data, size_t length, uint8_t* r)
{
    std::vector<uint8_t> to_compress(data, data + length);
    auto output = crypto::pedersen_hash::hash_buffer(to_compress);
    write(r, output);
}
