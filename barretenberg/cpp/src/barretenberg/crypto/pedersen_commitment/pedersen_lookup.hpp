#pragma once

// TODO(@zac-wiliamson #2341 delete this file once we migrate to new hash standard

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace crypto {
namespace pedersen_commitment {
namespace lookup {

grumpkin::g1::element merkle_damgard_compress(const std::vector<grumpkin::fq>& inputs, const size_t iv);

grumpkin::fq compress_native(const std::vector<grumpkin::fq>& inputs, const size_t hash_index = 0);
grumpkin::fq compress_native(const std::vector<uint8_t>& input, const size_t hash_index = 0);
grumpkin::fq compress_native_buffer_to_field(const std::vector<uint8_t>& input, const size_t hash_index = 0);

grumpkin::g1::affine_element commit_native(const std::vector<grumpkin::fq>& inputs, const size_t hash_index = 0);

} // namespace lookup
} // namespace pedersen_commitment
} // namespace crypto