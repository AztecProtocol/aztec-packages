#pragma once
#include "../generators/fixed_base_scalar_mul.hpp"
#include "../generators/generator_data.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>

namespace crypto::pedersen_hash {

struct generator_info {
    inline static const grumpkin::g1::affine_element lhs_generator =
        grumpkin::g1::get_secure_generator_from_index(0, "default_domain_separator");
    inline static const grumpkin::g1::affine_element rhs_generator =
        grumpkin::g1::get_secure_generator_from_index(1, "default_domain_separator");

    static grumpkin::g1::affine_element get_lhs_generator();
    static grumpkin::g1::affine_element get_rhs_generator();
};

grumpkin::g1::element hash_single(const barretenberg::fr& in, generators::generator_index_t const& index);

grumpkin::fq hash_multiple(const std::vector<grumpkin::fq>& inputs, size_t hash_index = 0);

} // namespace crypto::pedersen_hash
