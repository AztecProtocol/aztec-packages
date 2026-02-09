// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <array>

namespace bb {

/**
 * @brief Container for parameters used by the grand product (permutation, lookup) Honk relations
 *
 * @tparam T, either a native field type or a Univariate.
 */
template <typename T> struct RelationParameters {
    using DataType = T;
    static constexpr int NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR = 4;
    static constexpr int NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR = 1;
    static constexpr int NUM_CHALLENGE_POWERS_IN_GOBLIN_TRANSLATOR = 4;

    T eta{ 0 };       // Aux Memory (eta)
    T eta_two{ 0 };   // Aux Memory (eta²)
    T eta_three{ 0 }; // Aux Memory (eta³)
    T beta{ 0 };      // Permutation + Lookup (column batching)
    T gamma{ 0 };     // Permutation + Lookup

    T public_input_delta{ 0 }; // Permutation
    T beta_sqr{ 0 };
    T beta_cube{ 0 };
    T beta_quartic{ 0 };

    // Compute eta powers from a single eta challenge
    void compute_eta_powers(const T& eta_challenge)
    {
        eta = eta_challenge;
        eta_two = eta * eta;
        eta_three = eta_two * eta;
    }

    void compute_beta_powers(const T& beta_challenge)
    {
        beta = beta_challenge;
        beta_sqr = beta * beta;
        beta_cube = beta_sqr * beta;
        beta_quartic = beta_sqr * beta_sqr;
    }
    // `eccvm_set_permutation_delta` is used in the set membership gadget in eccvm/ecc_set_relation.hpp, specifically to
    // constrain (pc, round, wnaf_slice) to match between the MSM table and the Precomputed table. The number of rows we
    // add per short scalar `mul` is slightly less in the Precomputed table as in the MSM table, so to get the
    // permutation argument to work out, when `precompute_select == 0`, we must implicitly _remove_ (0, 0, 0) as a tuple
    // on the wNAF side. This corresponds to dividing by (γ+t·β⁴)·(γ+β²+t·β⁴)·(γ+2β²+t·β⁴)·(γ+3β²+t·β⁴), where
    // t = FIRST_TERM_TAG (the domain separation tag for WNAF slice tuples).
    //
    // We can remove this by modifying the relation, but this would increase the complexity.
    T eccvm_set_permutation_delta = T(0);
    std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR> accumulated_result = { T(0), T(0), T(0), T(0) }; // Translator
    std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR> evaluation_input_x = {
        T(0), T(0), T(0), T(0), T(0)
    }; // Translator
    std::array<std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR>,
               NUM_CHALLENGE_POWERS_IN_GOBLIN_TRANSLATOR>
        batching_challenge_v = { { { T(0), T(0), T(0), T(0), T(0) },
                                   { T(0), T(0), T(0), T(0), T(0) },
                                   { T(0), T(0), T(0), T(0), T(0) },
                                   { T(0), T(0), T(0), T(0), T(0) } } };

    static RelationParameters get_random()
    {
        RelationParameters result;
        result.compute_eta_powers(T::random_element());  // eta, eta_two = eta², eta_three = eta³
        result.compute_beta_powers(T::random_element()); // beta, beta_sqr = beta², beta_cube = beta³
        result.gamma = T::random_element();
        result.public_input_delta = T::random_element();
        auto first_term_tag = result.beta_quartic; // FIRST_TERM_TAG (= 1) * beta_quartic
        result.eccvm_set_permutation_delta =
            (result.gamma + first_term_tag) * (result.gamma + result.beta_sqr + first_term_tag) *
            (result.gamma + result.beta_sqr + result.beta_sqr + first_term_tag) *
            (result.gamma + result.beta_sqr + result.beta_sqr + result.beta_sqr + first_term_tag);
        result.accumulated_result = {
            T::random_element(), T::random_element(), T::random_element(), T::random_element()
        };

        result.evaluation_input_x = {
            T::random_element(), T::random_element(), T::random_element(), T::random_element(), T::random_element()
        };
        result.batching_challenge_v = {
            std::array{ T::random_element(),
                        T::random_element(),
                        T::random_element(),
                        T::random_element(),
                        T::random_element() },
            { T::random_element(), T::random_element(), T::random_element(), T::random_element(), T::random_element() },
            { T::random_element(), T::random_element(), T::random_element(), T::random_element(), T::random_element() },
            { T::random_element(), T::random_element(), T::random_element(), T::random_element(), T::random_element() },
        };

        return result;
    }
};
} // namespace bb
