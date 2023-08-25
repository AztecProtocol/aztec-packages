#pragma once

#include <cstddef>
namespace proof_system::honk::sumcheck {

/**
 * @brief Container for parameters used by the grand product (permutation, lookup) Honk relations
 *
 * @tparam FF
 */
template <typename FF> struct RelationParameters {
    FF eta = 0;                        // Lookup
    FF beta = 0;                       // Permutation + Lookup
    FF gamma = 0;                      // Permutation + Lookup
    FF public_input_delta = 0;         // Permutation
    FF lookup_grand_product_delta = 0; // Lookup
    FF eta_sqr = 0;
    FF eta_cube = 0;
    // eccvm_set_permutation_delta is used in the set membership gadget in eccvm/ecc_set_relation.hpp
    // We can remove this by modifying the relation, but increases complexity
    FF eccvm_set_permutation_delta = 0;
};
} // namespace proof_system::honk::sumcheck
