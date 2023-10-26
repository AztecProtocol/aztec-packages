#include "c_bind.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/serialize.hpp"
#include "pedersen.hpp"

extern "C" {

WASM_EXPORT void pedersen_hash__init() {}

WASM_EXPORT void pedersen__hash_with_hash_index(uint8_t const* inputs_buffer, uint32_t hash_index, uint8_t* output)
{
    std::vector<grumpkin::fq> to_compress;
    read(inputs_buffer, to_compress);
    crypto::GeneratorContext<curve::Grumpkin> ctx; // todo fix
    ctx.offset = static_cast<size_t>(hash_index);
    auto r = crypto::pedersen_hash::hash(to_compress, ctx);
    barretenberg::fr::serialize_to_buffer(r, output);
}

/**
 * Given a buffer containing 32 byte pedersen leaves, return a new buffer containing the leaves and all pairs of
 * nodes that define a merkle tree.
 * e.g.
 * input:  [1][2][3][4]
 * output: [1][2][3][4][compress(1,2)][compress(3,4)][compress(5,6)]
 */
WASM_EXPORT uint8_t* pedersen__hash_to_tree(uint8_t const* data)
{
    auto fields = from_buffer<std::vector<grumpkin::fq>>(data);
    auto num_outputs = fields.size() * 2 - 1;
    fields.reserve(num_outputs);

    for (size_t i = 0; fields.size() < num_outputs; i += 2) {
        fields.push_back(crypto::pedersen_hash::hash({ fields[i], fields[i + 1] }));
    }

    auto buf_size = 4 + num_outputs * sizeof(grumpkin::fq);
    auto buf = (uint8_t*)aligned_alloc(64, buf_size);
    auto dst = &buf[0];
    write(dst, fields);

    return buf;
}
}