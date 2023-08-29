#pragma once
#include "../generators/fixed_base_scalar_mul.hpp"
#include "../generators/generator_data.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>

namespace crypto::pedersen_commitment_refactor {

struct generator_info_temp {
    inline static constexpr size_t DEFAULT_NUM_GENERATORS = 32;
    inline static const std::string DEFAULT_DOMAIN_SEPARATOR = "default_domain_separator";
    inline static const grumpkin::g1::affine_element lhs_generator =
        grumpkin::g1::get_secure_generator_from_index(0, DEFAULT_DOMAIN_SEPARATOR);
    inline static const grumpkin::g1::affine_element rhs_generator =
        grumpkin::g1::get_secure_generator_from_index(1, DEFAULT_DOMAIN_SEPARATOR);

    inline static const grumpkin::g1::affine_element length_generator =
        grumpkin::g1::get_secure_generator_from_index(0, "pedersen_hash_length");

    static std::vector<grumpkin::g1::affine_element> get_default_generators();

    static std::vector<grumpkin::g1::affine_element> get_generators(
        size_t num_generators,
        size_t starting_index = 0,
        const std::string& domain_separator = DEFAULT_DOMAIN_SEPARATOR);
    static grumpkin::g1::affine_element get_generator(size_t generator_index,
                                                      const std::string& domain_separator = DEFAULT_DOMAIN_SEPARATOR);
    inline static const std::vector<grumpkin::g1::affine_element> default_generators = get_default_generators();

    static grumpkin::g1::affine_element get_lhs_generator();
    static grumpkin::g1::affine_element get_rhs_generator();
    static grumpkin::g1::affine_element get_length_generator();
};

grumpkin::g1::affine_element commit_native(
    const std::vector<grumpkin::fq>& inputs,
    size_t hash_index = 0,
    const std::string& domain_separator = generator_info_temp::DEFAULT_DOMAIN_SEPARATOR);

grumpkin::g1::affine_element commit_native(
    const std::vector<grumpkin::fr>& inputs,
    size_t hash_index = 0,
    const std::string& domain_separator = generator_info_temp::DEFAULT_DOMAIN_SEPARATOR);

// grumpkin::fq compress_native(const std::vector<grumpkin::fq>& inputs,
//                              size_t hash_index = 0,
//                              const std::vector<uint8_t>& domain_separator = {});

// grumpkin::fq compress_native(const std::vector<uint8_t>& input,
//                              size_t hash_index = 0,
//                              const std::vector<uint8_t>& domain_separator = {});

// template <size_t T>
// grumpkin::fq compress_native(const std::array<grumpkin::fq, T>& inputs,
//                              const size_t hash_index = 0,
//                              const std::vector<uint8_t>& domain_separator = {})
// {
//     std::vector<grumpkin::fq> converted(inputs.begin(), inputs.end());
//     return compress_native(converted, hash_index, domain_separator);
// }

} // namespace crypto::pedersen_commitment_refactor
