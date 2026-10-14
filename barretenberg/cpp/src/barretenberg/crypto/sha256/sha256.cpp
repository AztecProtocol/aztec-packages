// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./sha256.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/net.hpp"
#include <array>
#include <cstring>
#include <iterator>
#include <memory.h>
#include <span>

#if defined(__x86_64__) && !defined(__wasm__) && (defined(__clang__) || defined(__GNUC__))
#define BB_SHA256_X86_SHA_NI 1
#include <cpuid.h>
#include <immintrin.h>
#endif

namespace {

// Initial hash values H[0..7] (FIPS 180-4 Section 5.3.3)
// First 32 bits of the fractional parts of the square roots of the first 8 primes (2..19)
constexpr uint32_t init_constants[8]{ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };

// Round constants K[0..63] (FIPS 180-4 Section 4.2.2)
// First 32 bits of the fractional parts of the cube roots of the first 64 primes (2..311)
constexpr uint32_t round_constants[64]{
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

/**
 * @brief ROTR^n(x) - circular right rotation (FIPS 180-4 Section 3.2)
 *
 * Bits that shift off the right end wrap around to the left.
 *
 * @param val The 32-bit word to rotate
 * @param shift Number of positions to rotate right
 * @return val rotated right by shift positions
 */
constexpr uint32_t ror(uint32_t val, uint32_t shift)
{
    return (val >> (shift & 31U)) | (val << (32U - (shift & 31U)));
}

#ifdef BB_SHA256_X86_SHA_NI
/**
 * @brief Whether the CPU implements the x86 SHA extensions (and the SSSE3 / SSE4.1 shuffles the kernel uses).
 */
bool cpu_has_sha_ni()
{
    unsigned int eax = 0;
    unsigned int ebx = 0;
    unsigned int ecx = 0;
    unsigned int edx = 0;
    if (__get_cpuid(1, &eax, &ebx, &ecx, &edx) == 0) {
        return false;
    }
    const bool has_ssse3 = (ecx & (1U << 9)) != 0;
    const bool has_sse41 = (ecx & (1U << 19)) != 0;
    if (__get_cpuid_count(7, 0, &eax, &ebx, &ecx, &edx) == 0) {
        return false;
    }
    const bool has_sha = (ebx & (1U << 29)) != 0;
    return has_ssse3 && has_sse41 && has_sha;
}

const bool use_sha_ni = cpu_has_sha_ni();

/**
 * @brief SHA-256 compression of consecutive 64-byte big-endian message blocks with the x86 SHA extensions.
 * @details Computes the same function as repeated `sha256_block` calls. The state is kept in the (ABEF, CDGH) lane
 * layout that SHA256RNDS2 operates on; each SHA256RNDS2 performs two rounds, and SHA256MSG1/SHA256MSG2 extend the
 * message schedule four words at a time.
 */
__attribute__((target("sha,sse4.1,ssse3"))) void compress_blocks_sha_ni(std::array<uint32_t, 8>& state,
                                                                        const uint8_t* data,
                                                                        size_t num_blocks)
{
    // Byte-swaps each 32-bit word: message words are big-endian.
    const __m128i byte_swap_mask = _mm_set_epi64x(0x0c0d0e0f08090a0bULL, 0x0405060700010203ULL);
    const auto round_constants_at = [](size_t i) {
        return _mm_loadu_si128(reinterpret_cast<const __m128i*>(&round_constants[i]));
    };

    // (a, b, c, d), (e, f, g, h) -> (a, b, e, f), (c, d, g, h)
    __m128i tmp = _mm_loadu_si128(reinterpret_cast<const __m128i*>(&state[0]));
    __m128i state1 = _mm_loadu_si128(reinterpret_cast<const __m128i*>(&state[4]));
    tmp = _mm_shuffle_epi32(tmp, 0xB1);
    state1 = _mm_shuffle_epi32(state1, 0x1B);
    __m128i state0 = _mm_alignr_epi8(tmp, state1, 8);
    state1 = _mm_blend_epi16(state1, tmp, 0xF0);

    for (size_t block = 0; block < num_blocks; ++block) {
        const uint8_t* block_data = data + (block * 64);
        const __m128i abef_save = state0;
        const __m128i cdgh_save = state1;

        // msg[j] holds message words 4j..4j+3 of the current group of 16, extended in place.
        std::array<__m128i, 4> msg;
        for (size_t j = 0; j < 4; ++j) {
            msg[j] = _mm_shuffle_epi8(_mm_loadu_si128(reinterpret_cast<const __m128i*>(block_data + (16 * j))),
                                      byte_swap_mask);
        }

        // Group g covers rounds 4g..4g+3 and uses msg[g % 4]. While it runs, the schedule words of later groups are
        // advanced: SHA256MSG2 completes the words for group g+1 and SHA256MSG1 starts the words for group g+3.
        for (size_t g = 0; g < 16; ++g) {
            __m128i& current = msg[g % 4];
            __m128i& previous = msg[(g + 3) % 4];
            __m128i& next = msg[(g + 1) % 4];
            __m128i words = _mm_add_epi32(current, round_constants_at(4 * g));
            state1 = _mm_sha256rnds2_epu32(state1, state0, words);
            if (g >= 3 && g <= 14) {
                next = _mm_add_epi32(next, _mm_alignr_epi8(current, previous, 4));
                next = _mm_sha256msg2_epu32(next, current);
            }
            words = _mm_shuffle_epi32(words, 0x0E);
            state0 = _mm_sha256rnds2_epu32(state0, state1, words);
            if (g >= 1 && g <= 12) {
                previous = _mm_sha256msg1_epu32(previous, current);
            }
        }

        state0 = _mm_add_epi32(state0, abef_save);
        state1 = _mm_add_epi32(state1, cdgh_save);
    }

    // (a, b, e, f), (c, d, g, h) -> (a, b, c, d), (e, f, g, h)
    tmp = _mm_shuffle_epi32(state0, 0x1B);
    state1 = _mm_shuffle_epi32(state1, 0xB1);
    state0 = _mm_blend_epi16(tmp, state1, 0xF0);
    state1 = _mm_alignr_epi8(state1, tmp, 8);
    _mm_storeu_si128(reinterpret_cast<__m128i*>(&state[0]), state0);
    _mm_storeu_si128(reinterpret_cast<__m128i*>(&state[4]), state1);
}
#endif

} // namespace

namespace bb::crypto {
void prepare_constants(std::array<uint32_t, 8>& input)
{
    input[0] = init_constants[0];
    input[1] = init_constants[1];
    input[2] = init_constants[2];
    input[3] = init_constants[3];
    input[4] = init_constants[4];
    input[5] = init_constants[5];
    input[6] = init_constants[6];
    input[7] = init_constants[7];
}

/**
 * @brief SHA-256 compression function (FIPS 180-4 Section 6.2.2)
 *
 * Processes a single 512-bit (16-word) message block, updating the hash state.
 * This is the core primitive exposed to ACIR via Sha256Compression opcode.
 *
 * @param h_init Previous hash state (or initial constants for first block)
 * @param input 512-bit message block as 16 x 32-bit words (big-endian)
 * @return Updated 256-bit hash state as 8 x 32-bit words
 */
std::array<uint32_t, 8> sha256_block(const std::array<uint32_t, 8>& h_init, const std::array<uint32_t, 16>& input)
{
    std::array<uint32_t, 64> w;

    /**
     * Fill first 16 words with the message schedule
     **/
    for (size_t i = 0; i < 16; ++i) {
        w[i] = input[i];
    }

    /**
     * Extend the input data into the remaining 48 words
     **/
    for (size_t i = 16; i < 64; ++i) {
        uint32_t s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + w[i - 7] + s0 + s1;
    }

    /**
     * Initialize round variables with previous block output
     **/
    uint32_t a = h_init[0];
    uint32_t b = h_init[1];
    uint32_t c = h_init[2];
    uint32_t d = h_init[3];
    uint32_t e = h_init[4];
    uint32_t f = h_init[5];
    uint32_t g = h_init[6];
    uint32_t h = h_init[7];

    /**
     * Apply SHA-256 compression function to the message schedule
     **/
    for (size_t i = 0; i < 64; ++i) {
        uint32_t S1 = ror(e, 6U) ^ ror(e, 11U) ^ ror(e, 25U);
        uint32_t ch = (e & f) ^ (~e & g); // === (e & f) ^ (~e & g), `+` op is cheaper
        uint32_t temp1 = h + S1 + ch + round_constants[i] + w[i];
        uint32_t S0 = ror(a, 2U) ^ ror(a, 13U) ^ ror(a, 22U);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c); // (a & (b + c - (T0 * 2))) + T0; // === (a & b) ^ (a & c) ^ (b & c)
        uint32_t temp2 = S0 + maj;

        h = g;
        g = f;
        f = e;
        e = d + temp1;
        d = c;
        c = b;
        b = a;
        a = temp1 + temp2;
    }

    /**
     * Add into previous block output and return
     **/
    std::array<uint32_t, 8> output;
    output[0] = a + h_init[0];
    output[1] = b + h_init[1];
    output[2] = c + h_init[2];
    output[3] = d + h_init[3];
    output[4] = e + h_init[4];
    output[5] = f + h_init[5];
    output[6] = g + h_init[6];
    output[7] = h + h_init[7];
    return output;
}

/**
 * @brief SHA-256 hash function (FIPS 180-4)
 *
 * Computes the SHA-256 hash of an arbitrary-length message.
 * Handles padding (Section 5.1.1) and iterates the compression function.
 *
 * @param input Message bytes to hash
 * @return 256-bit hash as 32 bytes
 */
/**
 * @brief Apply the compression function to consecutive 64-byte message blocks (big-endian words).
 */
void sha256_compress_blocks(std::array<uint32_t, 8>& state, const uint8_t* data, size_t num_blocks)
{
#ifdef BB_SHA256_X86_SHA_NI
    if (use_sha_ni) {
        compress_blocks_sha_ni(state, data, num_blocks);
        return;
    }
#endif
    for (size_t i = 0; i < num_blocks; ++i) {
        std::array<uint32_t, 16> hash_input;
        memcpy((void*)&hash_input[0], (const void*)(data + (i * 64)), 64);
        if (is_little_endian()) {
            for (size_t j = 0; j < hash_input.size(); ++j) {
                hash_input[j] = __builtin_bswap32(hash_input[j]);
            }
        }
        state = sha256_block(state, hash_input);
    }
}

template <typename ByteContainer> Sha256Hash sha256(const ByteContainer& input)
{
    const auto* data = reinterpret_cast<const uint8_t*>(std::data(input));
    const size_t size = std::size(input);

    std::array<uint32_t, 8> rolling_hash;
    prepare_constants(rolling_hash);

    // Complete blocks are compressed straight from the input.
    const size_t num_full_blocks = size / 64;
    sha256_compress_blocks(rolling_hash, data, num_full_blocks);

    // Padding (FIPS 180-4 Section 5.1.1): the remaining bytes, 0x80, zeros, then the message length in bits as a
    // big-endian 64-bit integer, filling one block, or two if fewer than 9 bytes are left after the remainder.
    const size_t remainder = size - (num_full_blocks * 64);
    std::array<uint8_t, 128> tail{};
    if (remainder > 0) {
        memcpy((void*)&tail[0], (const void*)(data + (num_full_blocks * 64)), remainder);
    }
    tail[remainder] = 0x80;
    const size_t num_tail_blocks = (remainder + 9 <= 64) ? 1 : 2;
    const uint64_t l = static_cast<uint64_t>(size) * 8;
    for (size_t i = 0; i < 8; ++i) {
        tail[(num_tail_blocks * 64) - 1 - i] = static_cast<uint8_t>(l >> (8 * i));
    }
    sha256_compress_blocks(rolling_hash, tail.data(), num_tail_blocks);

    Sha256Hash output;
    memcpy((void*)&output[0], (void*)&rolling_hash[0], 32);
    if (is_little_endian()) {
        uint32_t* output_uint32 = (uint32_t*)&output[0];
        for (size_t j = 0; j < 8; ++j) {
            output_uint32[j] = __builtin_bswap32(output_uint32[j]);
        }
    }

    return output;
}

template Sha256Hash sha256<std::vector<uint8_t>>(const std::vector<uint8_t>& input);
template Sha256Hash sha256<std::array<uint8_t, 32>>(const std::array<uint8_t, 32>& input);
template Sha256Hash sha256<std::string>(const std::string& input);
template Sha256Hash sha256<std::span<uint8_t>>(const std::span<uint8_t>& input);
template Sha256Hash sha256<std::span<const uint8_t>>(const std::span<const uint8_t>& input);

} // namespace bb::crypto
