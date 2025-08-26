// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib {

/**
 * @brief Implements the circuit form of a cryptographic sponge over prime fields.
 *        Implements the sponge specification from the Community Cryptographic Specification Project
 *        see https://github.com/C2SP/C2SP/blob/792c1254124f625d459bfe34417e8f6bdd02eb28/poseidon-sponge.md
 *        (Note: this spec was not accepted into the C2SP repo, we might want to reference something else!)
 *
 *        Note: If we ever use this sponge class for more than 1 hash functions, we should move this out of `poseidon2`
 *              and into its own directory
 * @tparam field_t
 * @tparam rate
 * @tparam capacity
 * @tparam t
 * @tparam Permutation
 */
template <typename Builder> class FieldSponge {
  public:
    using Permutation = Poseidon2Permutation<Builder>;
    static constexpr size_t t = crypto::Poseidon2Bn254ScalarFieldParams::t;
    static constexpr size_t capacity = 1;
    static constexpr size_t rate = t - capacity; // =3

    using field_t = stdlib::field_t<Builder>;

    // sponge state. t = rate + capacity. capacity = 1 field element (~256 bits)
    std::array<field_t, t> state;

    // cached elements that have been absorbed.
    std::array<field_t, rate> cache;
    size_t cache_size = 0;
    Builder* builder;

    FieldSponge(Builder& builder_, size_t in_len)
        : builder(&builder_)
    {
        for (size_t i = 0; i < rate; ++i) {
            // The witness at idx = 0 is constrained to be 0.
            state[i] = field_t::from_witness_index(builder, 0);
        }

        const field_t iv(static_cast<uint256_t>(in_len) << 64);

        state[rate] = iv.convert_constant_to_fixed_witness(builder);
    }

    void perform_duplex()
    {
        // zero-pad the cache
        for (size_t i = cache_size; i < rate; ++i) {
            cache[i] = field_t::from_witness_index(builder, 0);
        }
        // add the cache into sponge state
        for (size_t i = 0; i < rate; ++i) {
            state[i] += cache[i];
        }
        state = Permutation::permutation(builder, state);

        // variables with indices from rate to size of state - 1 won't be used anymore
        // after permutation. But they aren't dangerous and needed to put in used witnesses
        if constexpr (IsUltraBuilder<Builder>) {
            for (size_t i = rate; i < t; i++) {
                builder->update_used_witnesses(state[i].witness_index);
            }
        }
    }

    void absorb(const field_t& input)
    {
        if (cache_size == rate) {
            // If we're absorbing, and the cache is full, apply the sponge permutation to compress the cache
            perform_duplex();
            cache[0] = input;
            cache_size = 1;
        } else if (cache_size < rate) {
            // If we're absorbing, and the cache is not full, add the input into the cache
            cache[cache_size] = input;
            cache_size += 1;
        }
    }

    field_t squeeze()
    {

        perform_duplex();
        for (size_t i = 0; i < rate; ++i) {
            cache[i] = state[i];
        }
        cache_size = rate;

        // By this point, we should have a non-empty cache. Pop one item off the top of the cache and return it.
        field_t result = cache[0];
        for (size_t i = 1; i < cache_size; ++i) {
            cache[i - 1] = cache[i];
        }
        cache_size -= 1;
        cache[cache_size] = field_t::from_witness_index(builder, 0);
        return result;
    }

    /**
     * @brief Use the sponge to hash an input string
     *
     * @tparam out_len
     * @tparam is_variable_length. Distinguishes between hashes where the preimage length is constant/not constant
     * @param input
     * @return std::array<field_t, out_len>
     */

    static field_t hash_internal(Builder& builder, std::span<const field_t> input)
    {
        size_t in_len = input.size();
        FieldSponge sponge(builder, in_len);

        for (size_t i = 0; i < in_len; ++i) {
            BB_ASSERT_EQ(input[i].is_constant(), false, "Sponge inputs should not be stdlib constants.");
            sponge.absorb(input[i]);
        }

        field_t output = sponge.squeeze();

        // variables with indices won't be used in the circuit.
        // but they aren't dangerous and needed to put in used witnesses
        if constexpr (IsUltraBuilder<Builder>) {
            for (const auto& elem : sponge.cache) {
                if (!elem.is_constant()) {
                    builder.update_used_witnesses(elem.witness_index);
                }
            }
        }
        return output;
    }
};
} // namespace bb::stdlib
