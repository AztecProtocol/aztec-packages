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

namespace bb::stdlib {

/**
 * @brief Implements the circuit form of a cryptographic sponge over prime fields.
 *
 * @tparam Builder A circuit builder class. Can be Ultra- or MegaCircuitBuilder.
 */
template <typename Builder> class FieldSponge {
  private:
    using Permutation = Poseidon2Permutation<Builder>;
    static constexpr size_t t = crypto::Poseidon2Bn254ScalarFieldParams::t; // = 4
    static constexpr size_t capacity = 1;
    static constexpr size_t rate = t - capacity; // = 3

    using field_t = stdlib::field_t<Builder>;

    // sponge state. t = rate + capacity. capacity = 1 field element (~256 bits)
    std::array<field_t, t> state{};

    // cached elements that have been absorbed.
    std::array<field_t, rate> cache{};
    size_t cache_size = 0;
    Builder* builder;

    FieldSponge(Builder* builder_, size_t in_len)
        : builder(builder_)
    {
        // Add the domain separation to the initial state.
        field_t iv(static_cast<uint256_t>(in_len) << 64);
        iv.convert_constant_to_fixed_witness(builder);
        state[rate] = iv;
    }

    void perform_duplex()
    {
        // Add the cache into sponge state
        for (size_t i = 0; i < rate; ++i) {
            state[i] += cache[i];
        }

        // Apply Poseidon2 permutation
        state = Permutation::permutation(builder, state);

        // Reset the cache
        cache = {};
    }

    void absorb(const field_t& input)
    {
        if (cache_size == rate) {
            // If we're absorbing, and the cache is full, apply the sponge permutation to compress the cache
            perform_duplex();
            cache[0] = input;
            cache_size = 1;
        } else {
            // If we're absorbing, and the cache is not full, add the input into the cache
            cache[cache_size] = input;
            cache_size += 1;
        }
    }

    field_t squeeze()
    {

        perform_duplex();

        return state[0];
    }

  public:
    /**
     * @brief Use the sponge to hash an input vector.
     *
     * @param input Circuit witnesses (a_0, ..., a_{N-1})
     * @return Hash of the input, a single witness field element.
     */
    static field_t hash_internal(std::span<const field_t> input)
    {
        // Ensure that all inputs belong to the same circuit and extract a pointer to the circuit object.
        Builder* builder = validate_context<Builder>(input);

        // Ensure that the pointer is not a `nullptr`
        ASSERT(builder);

        // Initialize the sponge state. Input length is used for domain separation.
        const size_t in_len = input.size();
        FieldSponge sponge(builder, in_len);

        // Absorb inputs in blocks of size r = 3. Make sure that all inputs are witneesses.
        for (size_t i = 0; i < in_len; ++i) {
            BB_ASSERT_EQ(input[i].is_constant(), false, "Sponge inputs should not be stdlib constants.");
            sponge.absorb(input[i]);
        }

        // Perform final duplex call. At this point, cache contains `m = in_len % 3` input elements and 3 - m constant
        // zeroes served as padding.
        field_t output = sponge.squeeze();

        // The final state consists of 4 elements, we only use the first element, which means that the remaining
        // 3 witnesses are only used in a single gate.
        for (const auto& elem : sponge.state) {
            builder->update_used_witnesses(elem.witness_index);
        }
        return output;
    }
};
} // namespace bb::stdlib
