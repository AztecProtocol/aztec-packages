#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

#include "barretenberg/numeric/uint256/uint256.hpp"

namespace crypto {

/**
 * @brief Implements a cryptographic sponge over prime fields.
 *        Implements the sponge specification from the Community Cryptographic Specification Project
 *        see https://github.com/C2SP/C2SP/blob/792c1254124f625d459bfe34417e8f6bdd02eb28/poseidon-sponge.md
 *        (Note: this spec was not accepted into the C2SP repo, we might want to reference something else!)
 *
 * @tparam FF
 * @tparam rate
 * @tparam capacity
 * @tparam t
 * @tparam Permutation
 */
template <typename FF, size_t rate, size_t capacity, size_t t, typename Permutation> class FieldSponge {
  public:
    enum Mode {
        ABSORB,
        SQUEEZE,
    };
    std::array<FF, t> state;
    std::array<FF, rate> cache;
    size_t cache_size = 0;
    Mode mode = Mode::ABSORB;

    FieldSponge(FF domain_iv = 0)
    {
        for (size_t i = 0; i < rate; ++i) {
            state[i] = 0;
        }
        state[rate] = domain_iv;
    }

    std::array<FF, rate> perform_duplex()
    {
        for (size_t i = cache_size; i < rate; ++i) {
            cache[i] = 0;
        }
        for (size_t i = 0; i < rate; ++i) {
            state[i] += cache[i];
        }
        // todo unify types between SPonge and permutation
        std::vector<FF> in(state.begin(), state.end());
        auto res = Permutation::permutation(in);
        std::array<FF, rate> output;
        for (size_t i = 0; i < t; ++i) {
            state[i] = res[i];
        }
        for (size_t i = 0; i < rate; ++i) {
            output[i] = state[i];
        }

        return output;
    }

    void absorb(const FF& input)
    {
        if (mode == Mode::ABSORB && cache_size == rate) {
            perform_duplex();
            cache[0] = input;
            cache_size = 1;
        } else if (mode == Mode::ABSORB && cache_size < rate) {
            cache[cache_size] = input;
            cache_size += 1;
        } else if (mode == Mode::SQUEEZE) {
            cache[0] = input;
            cache_size = 1;
            mode = Mode::ABSORB;
        }
    }

    FF squeeze()
    {
        if (mode == Mode::SQUEEZE && cache_size == 0) {
            mode = Mode::ABSORB;
            cache_size = 0;
        }
        if (mode == Mode::ABSORB) {
            auto new_output_elements = perform_duplex();
            mode = Mode::SQUEEZE;
            for (size_t i = 0; i < rate; ++i) {
                cache[i] = new_output_elements[i];
            }
            cache_size = rate;
        }
        FF result = cache[0];
        for (size_t i = 1; i < cache_size; ++i) {
            cache[i - 1] = cache[i];
        }
        cache_size -= 1;
        return result;
    }

    template <size_t out_len, bool is_variable_length> static std::array<FF, out_len> hash_internal(std::span<FF> input)
    {
        size_t in_len = input.size();
        const uint256_t iv = (static_cast<uint256_t>(in_len) << 64) + out_len - 1;
        FieldSponge sponge(iv);

        for (size_t i = 0; i < in_len; ++i) {
            sponge.absorb(input[i]);
        }

        if constexpr (is_variable_length) {
            sponge.absorb(1);
        }

        std::array<FF, out_len> output;
        for (size_t i = 0; i < out_len; ++i) {
            output[i] = sponge.squeeze();
        }
        return output;
    }

    template <size_t out_len> static std::array<FF, out_len> hash_fixed_length(std::span<FF> input)
    {
        return hash_internal<out_len, false>(input);
    }
    static FF hash_fixed_length(std::span<FF> input) { return hash_fixed_length<1>(input)[0]; }

    template <size_t out_len> static std::array<FF, out_len> hash_variable_length(std::span<FF> input)
    {
        return hash_internal<out_len, true>(input);
    }
    static FF hash_variable_length(std::span<FF> input) { return hash_variable_length<1>(input)[0]; }
};
} // namespace crypto