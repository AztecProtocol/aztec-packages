#pragma once

#include <array>
#include <cstddef>
namespace proof_system::honk::sumcheck {

/**
 * @brief Container for parameters used by the grand product (permutation, lookup) Honk relations
 *
 * @tparam FF
 */
template <typename FF> struct RelationParameters {
    FF eta = FF::zero();                                                            // Lookup
    FF beta = FF::zero();                                                           // Permutation + Lookup
    FF gamma = FF::zero();                                                          // Permutation + Lookup
    FF public_input_delta = FF::zero();                                             // Permutation
    FF lookup_grand_product_delta = FF::zero();                                     // Lookup
    std::array<FF, 4> evaluation_input_x = { FF::zero() };                          // Goblin Translator
    std::array<std::array<FF, 4>, 4> batching_challenge_v = { { { FF::zero() } } }; // Goblin Translator
};
} // namespace proof_system::honk::sumcheck
