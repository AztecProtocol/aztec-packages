// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

/* ethash: C/C++ implementation of Ethash, the Ethereum Proof of Work algorithm.
 * Copyright 2018-2019 Pawel Bylica.
 * Licensed under the Apache License, Version 2.0.
 */

#pragma once

#include "./hash_types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <stddef.h>
#include <vector>

#ifdef __cplusplus
#define NOEXCEPT noexcept
#else
#define NOEXCEPT
#endif

#ifdef __cplusplus
extern "C" {
#endif

/**
 * The Keccak-f[1600] function.
 *
 * The implementation of the Keccak-f function with 1600-bit width of the permutation (b).
 * The size of the state is also 1600 bit what gives 25 64-bit words.
 *
 * @param state  The state of 25 64-bit words on which the permutation is to be performed.
 */
void ethash_keccakf1600(uint64_t state[25]) NOEXCEPT;

struct keccak256 ethash_keccak256(const uint8_t* data, size_t size) NOEXCEPT;

struct keccak256 hash_field_elements(const uint64_t* limbs, size_t num_elements);

struct keccak256 hash_field_element(const uint64_t* limb);

namespace bb::crypto {
/**
 * @brief A wrapper class used to construct `KeccakTranscript`.
 *
 */
class Keccak {
  public:
    static bb::fr hash(std::vector<uint256_t> const& data)
    // Losing 2 bits of this is not an issue -> we can just reduce mod p
    {
        // cast into uint256_t
        std::vector<uint8_t> buffer = to_buffer(data);

        keccak256 hash_result = ethash_keccak256(&buffer[0], buffer.size());
        for (auto& word : hash_result.word64s) {
            if (is_little_endian()) {
                word = __builtin_bswap64(word);
            }
        }
        std::array<uint8_t, 32> result;

        for (size_t i = 0; i < 4; ++i) {
            for (size_t j = 0; j < 8; ++j) {
                uint8_t byte = static_cast<uint8_t>(hash_result.word64s[i] >> (56 - (j * 8)));
                result[i * 8 + j] = byte;
            }
        }

        return from_buffer<bb::fr>(result);
    }
};
} // namespace bb::crypto

#ifdef __cplusplus
}
#endif
