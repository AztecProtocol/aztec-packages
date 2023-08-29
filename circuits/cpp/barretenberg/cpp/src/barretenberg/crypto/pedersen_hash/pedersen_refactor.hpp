#pragma once
#include "../generators/fixed_base_scalar_mul.hpp"
#include "../generators/generator_data.hpp"
#include "../pedersen_commitment/pedersen_refactor.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>

namespace crypto::pedersen_hash_refactor {

grumpkin::fq hash_multiple(
    const std::vector<grumpkin::fq>& inputs,
    size_t hash_index = 0,
    const std::string& domain_separator = pedersen_commitment_refactor::generator_info_temp::DEFAULT_DOMAIN_SEPARATOR);

inline grumpkin::fq hash(
    const std::vector<grumpkin::fq>& inputs,
    size_t hash_index = 0,
    const std::string& domain_separator = pedersen_commitment_refactor::generator_info_temp::DEFAULT_DOMAIN_SEPARATOR)
{
    return hash_multiple(inputs, hash_index, domain_separator);
}

} // namespace crypto::pedersen_hash_refactor
