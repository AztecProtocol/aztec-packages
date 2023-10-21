// TODO(@zac-wiliamson #2341 delete this file once we migrate to new hash standard

#include "./pedersen_lookup.hpp"
#include "../pedersen_hash/pedersen_lookup.hpp"
#include "./convert_buffer_to_field.hpp"

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"

using namespace crypto::pedersen_hash::lookup;

namespace crypto::pedersen_hash::lookup {
extern std::array<std::vector<grumpkin::g1::affine_element>, NUM_PEDERSEN_TABLES> pedersen_tables;
extern std::vector<grumpkin::g1::affine_element> pedersen_iv_table;
extern std::array<grumpkin::g1::affine_element, NUM_PEDERSEN_TABLES> generators;
} // namespace crypto::pedersen_hash::lookup

namespace crypto {
namespace pedersen_commitment {
namespace lookup {

grumpkin::g1::element merkle_damgard_compress(const std::vector<grumpkin::fq>& inputs, const size_t iv)
{
    if (inputs.size() == 0) {
        auto result = grumpkin::g1::affine_one;
        result.self_set_infinity();
        return result;
    }
    init();
    const size_t num_inputs = inputs.size();

    grumpkin::fq result = (pedersen_iv_table[iv]).x;
    result = hash_pair(result, num_inputs);
    for (size_t i = 0; i < num_inputs - 1; i++) {
        result = hash_pair(result, inputs[i]);
    }

    return (hash_single(result, false) + hash_single(inputs[num_inputs - 1], true));
}

grumpkin::g1::affine_element commit_native(const std::vector<grumpkin::fq>& inputs, const size_t hash_index)
{
    return grumpkin::g1::affine_element(merkle_damgard_compress(inputs, hash_index));
}

grumpkin::fq compress_native(const std::vector<grumpkin::fq>& inputs, const size_t hash_index)
{
    return commit_native(inputs, hash_index).x;
}

grumpkin::fq compress_native_buffer_to_field(const std::vector<uint8_t>& input, const size_t hash_index)
{
    const auto elements = convert_buffer_to_field(input);
    grumpkin::fq result_fq = compress_native(elements, hash_index);
    return result_fq;
}

std::vector<uint8_t> compress_native(const std::vector<uint8_t>& input, const size_t hash_index)
{
    const auto result_fq = compress_native_buffer_to_field(input, hash_index);
    uint256_t result_u256(result_fq);
    const size_t num_bytes = input.size();

    bool is_zero = true;
    for (const auto byte : input) {
        is_zero = is_zero && (byte == static_cast<uint8_t>(0));
    }
    if (is_zero) {
        result_u256 = num_bytes;
    }
    std::vector<uint8_t> result_buffer;
    result_buffer.reserve(32);
    for (size_t i = 0; i < 32; ++i) {
        const uint64_t shift = (31 - i) * 8;
        uint256_t shifted = result_u256 >> uint256_t(shift);
        result_buffer.push_back(static_cast<uint8_t>(shifted.data[0]));
    }
    return result_buffer;
}

} // namespace lookup
} // namespace pedersen_commitment
} // namespace crypto