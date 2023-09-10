#pragma once

namespace proof_system {

/**
 * @brief Container for parameters used by the grand product (permutation, lookup) Honk relations
 *
 * @tparam FF
 */
template <typename FF> struct RelationParameters {
    FF eta = FF(0);                        // Lookup
    FF beta = FF(0);                       // Permutation + Lookup
    FF gamma = FF(0);                      // Permutation + Lookup
    FF public_input_delta = FF(0);         // Permutation
    FF lookup_grand_product_delta = FF(0); // Lookup
    FF eta_sqr = 0;
    FF eta_cube = 0;
    // eccvm_set_permutation_delta is used in the set membership gadget in eccvm/ecc_set_relation.hpp
    // We can remove this by modifying the relation, but increases complexity
    FF eccvm_set_permutation_delta = 0;

    static RelationParameters get_random()
    {
        RelationParameters result;
        result.eta = FF::random_element();
        result.eta_sqr = result.eta.sqr();
        result.eta_cube = result.eta_sqr * result.eta;
        result.beta = FF::random_element();
        result.gamma = FF::random_element();
        result.public_input_delta = FF::random_element();
        result.lookup_grand_product_delta = FF::random_element();
        result.eccvm_set_permutation_delta = result.gamma * (result.gamma + result.eta_sqr) *
                                             (result.gamma + result.eta_sqr + result.eta_sqr) *
                                             (result.gamma + result.eta_sqr + result.eta_sqr + result.eta_sqr);
        return result;
    }
};
} // namespace proof_system
