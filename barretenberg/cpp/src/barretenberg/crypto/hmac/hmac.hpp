// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"
#include <algorithm>
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace bb::crypto {
inline void secure_erase_bytes(void* ptr, size_t size)
{
    volatile uint8_t* p = static_cast<volatile uint8_t*>(ptr);
    while (size-- > 0) {
        *p++ = 0;
    }
}

template <typename T, size_t N> inline void secure_erase(std::array<T, N>& buffer)
{
    secure_erase_bytes(buffer.data(), buffer.size() * sizeof(T));
}

template <typename T> inline void secure_erase(std::vector<T>& buffer)
{
    if (!buffer.empty()) {
        secure_erase_bytes(buffer.data(), buffer.size() * sizeof(T));
    }
}

/**
 * @brief Compute an HMAC given a secret key and a message, see https://datatracker.ietf.org/doc/html/rfc2104
 *
 * @tparam Hash hasher being used
 * @tparam MessageContainer a byte container (std::vector<uint8_t>, std::array<uint8_t, ...>, std::string)
 * @tparam KeyContainer a byte container
 * @param message the message
 * @param key the key
 * @return std::array<uint8_t, Hash::OUTPUT_SIZE> the HMAC output
 */
template <typename Hash, typename MessageContainer, typename KeyContainer>
std::array<uint8_t, Hash::OUTPUT_SIZE> hmac(const MessageContainer& message, const KeyContainer& key)
{
    constexpr size_t B = Hash::BLOCK_SIZE;
    // ensures truncated_key fits into k_prime
    static_assert(Hash::OUTPUT_SIZE <= B);
    constexpr uint8_t IPAD_CONST = 0x36;
    constexpr uint8_t OPAD_CONST = 0x5c;
    std::array<uint8_t, B> ipad;
    std::array<uint8_t, B> opad;
    ipad.fill(IPAD_CONST);
    opad.fill(OPAD_CONST);

    // initialize k_prime to 0x00,...,0x00
    // copy key or truncated key to start.
    std::array<uint8_t, B> k_prime{};
    if (key.size() > B) {
        std::vector<uint8_t> key_buffer(key.begin(), key.end());
        auto truncated_key = Hash::hash(key_buffer);
        std::copy(truncated_key.begin(), truncated_key.end(), k_prime.begin());
        secure_erase(key_buffer);
        secure_erase(truncated_key);
    } else {
        std::copy(key.begin(), key.end(), k_prime.begin());
    }

    std::array<uint8_t, B> h1;
    for (size_t i = 0; i < B; ++i) {
        h1[i] = k_prime[i] ^ opad[i];
    }

    std::array<uint8_t, B> h2;
    for (size_t i = 0; i < B; ++i) {
        h2[i] = k_prime[i] ^ ipad[i];
    }
    secure_erase(k_prime);

    std::vector<uint8_t> message_buffer;
    message_buffer.reserve(B + message.size());
    std::copy(h2.begin(), h2.end(), std::back_inserter(message_buffer));
    std::copy(message.begin(), message.end(), std::back_inserter(message_buffer));

    auto h3 = Hash::hash(message_buffer);
    secure_erase(h2);
    secure_erase(message_buffer);

    std::vector<uint8_t> hmac_buffer;
    hmac_buffer.reserve(B + Hash::OUTPUT_SIZE);
    std::copy(h1.begin(), h1.end(), std::back_inserter(hmac_buffer));
    std::copy(h3.begin(), h3.end(), std::back_inserter(hmac_buffer));

    auto hmac_key = Hash::hash(hmac_buffer);
    secure_erase(h1);
    secure_erase(h3);
    secure_erase(hmac_buffer);

    std::array<uint8_t, Hash::OUTPUT_SIZE> result;
    std::copy(hmac_key.begin(), hmac_key.end(), result.begin());
    secure_erase(hmac_key);
    return result;
}

/**
 * @brief Deterministic nonce derivation according to RFC6979 specification
 * (https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-5.pdf, A.3.3)
 *
 * @tparam Hash the hash function we're using
 * @tparam Fr field type
 * @tparam MessageContainer a byte container (std::vector<uint8_t>, std::array<uint8_t, ...>, std::string)
 * @tparam KeyContainer a byte container
 * @param message the input buffer used to derive the nonce
 * @param key key used to derive the nonce
 */
template <typename Hash, typename Fr, typename MessageContainer, typename KeyContainer>
Fr deterministic_nonce_rfc6979(const MessageContainer& message, const KeyContainer& key)
    requires(Hash::OUTPUT_SIZE == 32)
{
    using serialize::read;
    using serialize::write;

    static_assert(Hash::OUTPUT_SIZE == 32,
                  "Hash output size must be 32 bytes for our implementation of RFC6979 nonce generation");
    static constexpr size_t INITIAL_BUFFER_SIZE = 32; // Equal to 8 * (Hash::OUTPUT_SIZE + 7/ 8)
    static constexpr size_t MODULUS_BIT_LENGTH = Fr::modulus.get_msb() + 1;

    // Hash the message
    std::vector<uint8_t> message_buffer(message.begin(), message.end());
    auto hashed_message = Hash::hash(message_buffer);
    secure_erase(message_buffer);
    // Round trip reduces the hash modulo Fr::modulus
    Fr hashed_message_fr = Fr::serialize_from_buffer(hashed_message.data());
    secure_erase(hashed_message);
    Fr::serialize_to_buffer(hashed_message_fr, hashed_message.data());

    // Concatenate the private key and the hashed message
    std::vector<uint8_t> seed_material;
    seed_material.reserve(key.size() + hashed_message.size());
    std::ranges::copy(key, std::back_inserter(seed_material));
    std::ranges::copy(hashed_message, std::back_inserter(seed_material));
    secure_erase(hashed_message);

    // Initialize the buffers V and K
    std::array<uint8_t, INITIAL_BUFFER_SIZE> v_buffer;
    v_buffer.fill(0x01);
    std::array<uint8_t, INITIAL_BUFFER_SIZE> key_buffer;
    key_buffer.fill(0x00);

    // Temporary buffer for first HMAC round: V || 0x00 || seed_material
    std::vector<uint8_t> tmp_buffer;
    tmp_buffer.reserve(INITIAL_BUFFER_SIZE + 1 + seed_material.size());
    std::ranges::copy(v_buffer, std::back_inserter(tmp_buffer));
    tmp_buffer.emplace_back(0x00);
    std::ranges::copy(seed_material, std::back_inserter(tmp_buffer));

    // First HMAC round: K = HMAC(K, V || 0x00 || seed_material), V = HMAC(K, V)
    key_buffer = hmac<Hash, std::vector<uint8_t>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(tmp_buffer, key_buffer);
    v_buffer = hmac<Hash, std::array<uint8_t, INITIAL_BUFFER_SIZE>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(
        v_buffer, key_buffer);

    // Temporary buffer for second HMAC round: V || 0x01 || seed_material
    tmp_buffer.clear();
    tmp_buffer.reserve(INITIAL_BUFFER_SIZE + 1 + seed_material.size());
    std::ranges::copy(v_buffer, std::back_inserter(tmp_buffer));
    tmp_buffer.emplace_back(0x01);
    std::ranges::copy(seed_material, std::back_inserter(tmp_buffer));

    // Second HMAC round: K = HMAC(K, V || 0x01 || seed_material), V = HMAC(K, V)
    key_buffer = hmac<Hash, std::vector<uint8_t>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(tmp_buffer, key_buffer);
    v_buffer = hmac<Hash, std::array<uint8_t, INITIAL_BUFFER_SIZE>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(
        v_buffer, key_buffer);

    // Loop until we get a valid k: 0 < k < Fr::modulus
    uint256_t k = 0;
    while (k == 0 || k >= static_cast<uint256_t>(Fr::modulus)) {
        v_buffer = hmac<Hash, std::array<uint8_t, INITIAL_BUFFER_SIZE>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(
            v_buffer, key_buffer);

        // Trim the output if required
        if (Hash::OUTPUT_SIZE * 8 > MODULUS_BIT_LENGTH) {
            std::vector<uint8_t> trimmed_v_buffer(v_buffer.begin(), v_buffer.end());
            // Read the hash output
            const uint8_t* ptr = trimmed_v_buffer.data();
            uint256_t trimmed_v;
            read(ptr, trimmed_v);

            // Bit shift the output
            trimmed_v = trimmed_v >> (Hash::OUTPUT_SIZE * 8 - MODULUS_BIT_LENGTH);

            // Set k
            k = trimmed_v;
        } else {
            const uint8_t* ptr = v_buffer.data();
            read(ptr, k);
        }

        if ((k > 0) && (k < static_cast<uint256_t>(Fr::modulus))) {
            break;
        }

        std::vector<uint8_t> tmp_buffer;
        tmp_buffer.reserve(INITIAL_BUFFER_SIZE + 1);
        std::ranges::copy(v_buffer, std::back_inserter(tmp_buffer));
        tmp_buffer.emplace_back(0x00);
        key_buffer = hmac<Hash, std::vector<uint8_t>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(tmp_buffer, key_buffer);
        secure_erase(tmp_buffer);
        v_buffer = hmac<Hash, std::array<uint8_t, INITIAL_BUFFER_SIZE>, std::array<uint8_t, INITIAL_BUFFER_SIZE>>(
            v_buffer, key_buffer);
    }

    secure_erase(seed_material);
    secure_erase(tmp_buffer);
    secure_erase(v_buffer);
    secure_erase(key_buffer);

    return Fr(k);
}
} // namespace bb::crypto
