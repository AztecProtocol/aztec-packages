#include "./pedersen_refactor.hpp"
#include <iostream>
#ifndef NO_OMP_MULTITHREADING
#include <omp.h>
#endif

namespace crypto::pedersen_hash {

using namespace generators;

/**
 * Given a vector of fields, generate a pedersen hash using the indexed generators.
 */
grumpkin::fq hash_multiple(const std::vector<grumpkin::fq>& inputs,
                           const size_t hash_index,
                           const std::string& domain_separator)
{
    const auto length_generator = pedersen_commitment_refactor::generator_info_temp::get_length_generator();
    const auto base_points =
        pedersen_commitment_refactor::generator_info_temp::get_generators(inputs.size(), hash_index, domain_separator);

    grumpkin::g1::element result = length_generator * grumpkin::fr(inputs.size());

    for (size_t i = 0; i < inputs.size(); ++i) {
        result += base_points[i] * grumpkin::fr(static_cast<uint256_t>(inputs[i]));
    }
    return result.x;
}

} // namespace crypto::pedersen_hash