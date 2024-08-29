#pragma once
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <array>

namespace bb {

template <typename T> T initialize_relation_parameter()
{
    if constexpr (requires(T a) { a.get_origin_tag(); }) {
        auto temp = T(0);
        auto origin_tag = temp.get_origin_tag();
        origin_tag.poison();
        temp.set_origin_tag(origin_tag);
        return temp;
    } else {
        return T{ 0 };
    }
}
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
    static constexpr int NUM_TO_FOLD = 6;

    T eta = initialize_relation_parameter<T>();                // Lookup + Aux Memory
    T eta_two = initialize_relation_parameter<T>();            // Lookup + Aux Memory
    T eta_three = initialize_relation_parameter<T>();          // Lookup + Aux Memory
    T beta = initialize_relation_parameter<T>();               // Permutation + Lookup
    T gamma = initialize_relation_parameter<T>();              // Permutation + Lookup
    T public_input_delta = initialize_relation_parameter<T>(); // Permutation
    T beta_sqr = initialize_relation_parameter<T>();
    T beta_cube = initialize_relation_parameter<T>();
    // eccvm_set_permutation_delta is used in the set membership gadget in eccvm/ecc_set_relation.hpp
    // We can remove this by modifying the relation, but increases complexity
    T eccvm_set_permutation_delta = initialize_relation_parameter<T>();
    std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR> accumulated_result = {
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>()
    }; // Translator
    std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR> evaluation_input_x = {
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>(),
        initialize_relation_parameter<T>()
    }; // Translator
    std::array<std::array<T, NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR>,
               NUM_CHALLENGE_POWERS_IN_GOBLIN_TRANSLATOR>
        batching_challenge_v = { { { initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>() },
                                   { initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>() },
                                   { initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>() },
                                   { initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>(),
                                     initialize_relation_parameter<T>() } } };

    void unpoison()
    {
        if constexpr (requires { eta.get_origin_tag(); }) {
            auto unpoison_element = [&](auto& element) {
                auto origin_tag = element.get_origin_tag();
                origin_tag.unpoison();
                element.set_origin_tag(origin_tag);
            };
            unpoison_element(eta);
            unpoison_element(eta_two);
            unpoison_element(eta_three);
            unpoison_element(beta);
            unpoison_element(gamma);
            unpoison_element(public_input_delta);
            unpoison_element(beta_sqr);
            unpoison_element(beta_cube);
            unpoison_element(eccvm_set_permutation_delta);
            for (size_t i = 0; i < NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR; i++) {
                unpoison_element(accumulated_result[i]);
            }
            for (size_t i = 0; i < NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR; i++) {
                unpoison_element(evaluation_input_x[i]);
            }
            for (size_t i = 0; i < NUM_BINARY_LIMBS_IN_GOBLIN_TRANSLATOR + NUM_NATIVE_LIMBS_IN_GOBLIN_TRANSLATOR; i++) {
                for (size_t j = 0; j < NUM_CHALLENGE_POWERS_IN_GOBLIN_TRANSLATOR; j++) {
                    unpoison_element(batching_challenge_v[i][j]);
                }
            }
        }
    }

    RefArray<T, NUM_TO_FOLD> get_to_fold()
    {
        return RefArray{ eta, eta_two, eta_three, beta, gamma, public_input_delta };
    }

    RefArray<const T, NUM_TO_FOLD> get_to_fold() const
    {
        return RefArray{ eta, eta_two, eta_three, beta, gamma, public_input_delta, lookup_grand_product_delta };
    }

    static RelationParameters get_random()
    {
        RelationParameters result;
        result.eta = T::random_element();
        result.eta_two = T::random_element();
        result.eta_three = T::random_element();
        result.beta = T::random_element();
        result.beta_sqr = result.beta * result.beta;
        result.beta_cube = result.beta_sqr * result.beta;
        result.gamma = T::random_element();
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

    MSGPACK_FIELDS(eta, eta_two, eta_three, beta, gamma, public_input_delta);
};
} // namespace bb
