#include "./pedersen_refactor.hpp"
#include "./convert_buffer_to_field.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <iostream>
#ifndef NO_OMP_MULTITHREADING
#include <omp.h>
#endif

using namespace crypto::generators;

namespace crypto::pedersen_commitment_refactor {

std::vector<grumpkin::g1::affine_element> generator_info_temp::get_default_generators()
{
    const std::vector<uint8_t> default_domain_separator(DEFAULT_DOMAIN_SEPARATOR.begin(),
                                                        DEFAULT_DOMAIN_SEPARATOR.end());

    return grumpkin::g1::derive_generators_secure(default_domain_separator, DEFAULT_NUM_GENERATORS);
}

std::vector<grumpkin::g1::affine_element> generator_info_temp::get_generators(size_t num_generators,
                                                                              size_t starting_index,
                                                                              const std::string& domain_separator)
{
    std::vector<grumpkin::g1::affine_element> result;
    size_t start = starting_index;
    size_t number = num_generators;
    if (domain_separator == DEFAULT_DOMAIN_SEPARATOR && starting_index <= DEFAULT_NUM_GENERATORS) {
        const size_t default_end = starting_index + num_generators < DEFAULT_NUM_GENERATORS
                                       ? starting_index + num_generators
                                       : DEFAULT_NUM_GENERATORS;
        std::copy(default_generators.begin() + static_cast<int>(starting_index),
                  default_generators.begin() + static_cast<int>(default_end),
                  std::back_inserter(result));
        if (default_end == starting_index + num_generators) {
            return result;
        }
        start = default_end;
        number = num_generators - (default_end - starting_index);
    }

    const std::vector<uint8_t> domain_separator_bytes(domain_separator.begin(), domain_separator.end());

    auto remainder = grumpkin::g1::derive_generators_secure(domain_separator_bytes, number, start);

    std::copy(remainder.begin(), remainder.end(), std::back_inserter(result));
    return result;
}

grumpkin::g1::affine_element generator_info_temp::get_generator(size_t generator_index,
                                                                const std::string& domain_separator)
{
    return grumpkin::g1::get_secure_generator_from_index(generator_index, domain_separator);
}

grumpkin::g1::affine_element generator_info_temp::get_lhs_generator()
{
    return lhs_generator;
}
grumpkin::g1::affine_element generator_info_temp::get_rhs_generator()
{
    return rhs_generator;
}
grumpkin::g1::affine_element generator_info_temp::get_length_generator()
{
    return length_generator;
}
/**
 * Given a vector of fields, generate a pedersen commitment using the indexed generators.
 */
grumpkin::g1::affine_element commit_native(const std::vector<grumpkin::fq>& inputs,
                                           const size_t hash_index,
                                           const std::string& domain_separator)
{
    const auto base_points = generator_info_temp::get_generators(inputs.size(), hash_index, domain_separator);

    grumpkin::g1::element result = grumpkin::g1::point_at_infinity;

    for (size_t i = 0; i < inputs.size(); ++i) {
        result += grumpkin::g1::element(base_points[i]) * static_cast<uint256_t>(inputs[i]);
    }
    return result;
}

grumpkin::g1::affine_element commit_native(const std::vector<grumpkin::fr>& inputs,
                                           const size_t hash_index,
                                           const std::string& domain_separator)
{
    const auto base_points = generator_info_temp::get_generators(inputs.size(), hash_index, domain_separator);

    grumpkin::g1::element result = grumpkin::g1::point_at_infinity;

    for (size_t i = 0; i < inputs.size(); ++i) {
        std::cout << "base point[" << i << "] = " << base_points[i] << std::endl;
        result += grumpkin::g1::element(base_points[i]) * (inputs[i]);
    }
    return result;
}
} // namespace crypto::pedersen_commitment_refactor
