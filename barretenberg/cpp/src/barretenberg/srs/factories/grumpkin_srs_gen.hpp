#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <vector>

namespace bb::srs {

/**
 * @brief Generates a monomial basis Grumpkin SRS on-the-fly.
 *
 * @details The Grumpkin SRS does not require a trusted setup and has no underlying secret generator.
 * Points are generated deterministically by hashing a protocol string with point indices.
 * ! Note that the first element will not be equal to the generator point defined in grumpkin.hpp.
 *
 * @param num_points The number of SRS points to generate
 * @return std::vector<grumpkin::g1::affine_element> The generated SRS points
 */
std::vector<grumpkin::g1::affine_element> generate_grumpkin_srs(size_t num_points);

} // namespace bb::srs
