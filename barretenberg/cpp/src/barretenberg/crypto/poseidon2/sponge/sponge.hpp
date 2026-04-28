// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::crypto {

/**
 * @brief Implements a cryptographic sponge over prime fields.
 *        Sponge construction follows the Duplex Sponge model (https://keccak.team/files/SpongeDuplex.pdf).
 *        Domain separation uses IV = (input_length << 64) per Section 4.2 of the Poseidon paper
 *        (https://eprint.iacr.org/2019/458.pdf). Permutation is Poseidon2
 *        (https://eprint.iacr.org/2023/323.pdf).
 *
 *        Note: If we ever use this sponge class for more than 1 hash functions, we should move this out of `poseidon2`
 *              and into its own directory
 * @tparam FF
 * @tparam rate
 * @tparam capacity
 * @tparam t
 * @tparam Permutation
 */
template <typename FF, size_t rate, size_t capacity, size_t t, typename Permutation> class FieldSponge {
  private:
    // sponge state. t = rate + capacity. capacity = 1 field element (~256 bits)
    std::array<FF, t> state{};

    // cached elements that have been absorbed.
    std::array<FF, rate> cache{};
    size_t cache_size = 0;

    FieldSponge(FF domain_iv) { state[rate] = domain_iv; }

    void perform_duplex()
    {
        // Add the cache into sponge state
        for (size_t i = 0; i < rate; ++i) {
            state[i] += cache[i];
        }

        // Apply permutation
        Permutation::permutation_inplace(state);

        // Reset the cache
        cache = {};
    }

    void absorb(const FF& input)
    {
        if (cache_size == rate) {
            // If the cache is full, apply the sponge permutation to compress the cache
            perform_duplex();
            cache[0] = input;
            cache_size = 1;
        } else {
            // If the cache is not full, add the input into the cache
            cache[cache_size] = input;
            cache_size += 1;
        }
    }

    FF squeeze()
    {
        perform_duplex();
        return state[0];
    }

  public:
    /**
     * @brief Use the sponge to hash an input vector.
     *
     * @param input Field elements (a_0, ..., a_{N-1})
     * @return Hash of the input, a single field element.
     */
    static FF hash_internal(std::span<const FF> input)
    {
        const size_t in_len = input.size();
        const uint256_t iv = (static_cast<uint256_t>(in_len) << 64);
        return hash_internal(input, iv);
    }

    /**
     * @brief Use the sponge to hash an input vector with a custom IV.
     *
     * @param input Field elements (a_0, ..., a_{N-1})
     * @param iv Initial value for domain separation
     * @return Hash of the input, a single field element.
     */
    static FF hash_internal(std::span<const FF> input, FF iv)
    {
        FieldSponge sponge(iv);

        const size_t in_len = input.size();
        for (size_t i = 0; i < in_len; ++i) {
            sponge.absorb(input[i]);
        }

        return sponge.squeeze();
    }
};
} // namespace bb::crypto
