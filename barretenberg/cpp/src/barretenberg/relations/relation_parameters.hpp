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

    T eta{ 0 };                // Aux Memory (eta)
    T eta_two{ 0 };            // Aux Memory (eta²)
    T eta_three{ 0 };          // Aux Memory (eta³)
    T beta{ 0 };               // Permutation + Lookup
    T gamma{ 0 };              // Permutation + Lookup
    T gamma_two{ 0 };          // Lookup (γ²)
    T gamma_three{ 0 };        // Lookup (γ³)
    T gamma_four{ 0 };         // Lookup (γ⁴)
    T public_input_delta{ 0 }; // Permutation
    T beta_sqr{ 0 };
    T beta_cube{ 0 };

    // Compute eta powers from a single eta challenge
    void compute_eta_powers()
    {
        eta_two = eta * eta;
        eta_three = eta_two * eta;
    }

    // Compute gamma powers for lookup encoding
    void compute_gamma_powers()
    {
        gamma_two = gamma * gamma;
        gamma_three = gamma_two * gamma;
        gamma_four = gamma_three * gamma;
    }
    // `eccvm_set_permutation_delta` is used in the set membership gadget in eccvm/ecc_set_relation.hpp, specifically to
    // constrain (pc, round, wnaf_slice) to match between the MSM table and the Precomputed table. The number of rows we
    // add per short scalar `mul` is slightly less in the Precomputed table as in the MSM table, so to get the
    // permutation argument to work out, when `precompute_select == 0`, we must implicitly _remove_ (0, 0, 0) as a tuple
    // on the wNAF side. This corresponds to dividing by (γ)·(γ + β²)·(γ + 2β²)·(γ + 3β²).
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
        result.eta = T::random_element();
        result.compute_eta_powers(); // eta_two = eta², eta_three = eta³
        result.beta = T::random_element();
        result.beta_sqr = result.beta * result.beta;
        result.beta_cube = result.beta_sqr * result.beta;
        result.gamma = T::random_element();
        result.compute_gamma_powers(); // gamma_two = γ², gamma_three = γ³, gamma_four = γ⁴
        result.public_input_delta = T::random_element();
        result.eccvm_set_permutation_delta = result.gamma * (result.gamma + result.beta_sqr) *
                                             (result.gamma + result.beta_sqr + result.beta_sqr) *
                                             (result.gamma + result.beta_sqr + result.beta_sqr + result.beta_sqr);
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
