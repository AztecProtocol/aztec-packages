/*
   BLAKE2 reference source code package - reference C implementations

   Copyright 2012, Samuel Neves <sneves@dei.uc.pt>.  You may use this under the
   terms of the CC0, the OpenSSL Licence, or the Apache Public License 2.0, at
   your option.  The terms of these licenses can be found at:

   - CC0 1.0 Universal : http://creativecommons.org/publicdomain/zero/1.0
   - OpenSSL license   : https://www.openssl.org/source/license.html
   - Apache 2.0        : http://www.apache.org/licenses/LICENSE-2.0

   More information about the BLAKE2 hash function can be found at
   https://blake2.net.
*/

#include "blake2b.hpp"
#include <cstring>

namespace bb::ignition {

namespace {

static constexpr uint64_t blake2b_IV[8] = { 0x6a09e667f3bcc908ULL, 0xbb67ae8584caa73bULL, 0x3c6ef372fe94f82bULL,
                                            0xa54ff53a5f1d36f1ULL, 0x510e527fade682d1ULL, 0x9b05688c2b3e6c1fULL,
                                            0x1f83d9abfb41bd6bULL, 0x5be0cd19137e2179ULL };

static constexpr uint8_t blake2b_sigma[12][16] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 },
    { 11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4 }, { 7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8 },
    { 9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13 }, { 2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9 },
    { 12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11 }, { 13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10 },
    { 6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5 }, { 10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0 },
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 }, { 14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3 },
};

inline uint64_t load64_le(const void* src)
{
    const auto* p = static_cast<const uint8_t*>(src);
    return (static_cast<uint64_t>(p[0])) | (static_cast<uint64_t>(p[1]) << 8) | (static_cast<uint64_t>(p[2]) << 16) |
           (static_cast<uint64_t>(p[3]) << 24) | (static_cast<uint64_t>(p[4]) << 32) |
           (static_cast<uint64_t>(p[5]) << 40) | (static_cast<uint64_t>(p[6]) << 48) |
           (static_cast<uint64_t>(p[7]) << 56);
}

inline void store64_le(void* dst, uint64_t w)
{
    auto* p = static_cast<uint8_t*>(dst);
    p[0] = static_cast<uint8_t>(w);
    p[1] = static_cast<uint8_t>(w >> 8);
    p[2] = static_cast<uint8_t>(w >> 16);
    p[3] = static_cast<uint8_t>(w >> 24);
    p[4] = static_cast<uint8_t>(w >> 32);
    p[5] = static_cast<uint8_t>(w >> 40);
    p[6] = static_cast<uint8_t>(w >> 48);
    p[7] = static_cast<uint8_t>(w >> 56);
}

inline uint64_t rotr64(uint64_t w, unsigned c)
{
    return (w >> c) | (w << (64 - c));
}

void blake2b_compress(blake2b_state* S, const uint8_t block[BLAKE2B_BLOCKBYTES])
{
    uint64_t m[16];
    uint64_t v[16];

    for (size_t i = 0; i < 16; ++i) {
        m[i] = load64_le(block + i * sizeof(m[i]));
    }

    for (size_t i = 0; i < 8; ++i) {
        v[i] = S->h[i];
    }

    v[8] = blake2b_IV[0];
    v[9] = blake2b_IV[1];
    v[10] = blake2b_IV[2];
    v[11] = blake2b_IV[3];
    v[12] = S->t[0] ^ blake2b_IV[4];
    v[13] = S->t[1] ^ blake2b_IV[5];
    v[14] = S->f[0] ^ blake2b_IV[6];
    v[15] = S->f[1] ^ blake2b_IV[7];

#define G(r, i, a, b, c, d)                                                                                            \
    do {                                                                                                               \
        a = a + b + m[blake2b_sigma[r][2 * i + 0]];                                                                    \
        d = rotr64(d ^ a, 32);                                                                                         \
        c = c + d;                                                                                                     \
        b = rotr64(b ^ c, 24);                                                                                         \
        a = a + b + m[blake2b_sigma[r][2 * i + 1]];                                                                    \
        d = rotr64(d ^ a, 16);                                                                                         \
        c = c + d;                                                                                                     \
        b = rotr64(b ^ c, 63);                                                                                         \
    } while (0)

#define ROUND(r)                                                                                                       \
    do {                                                                                                               \
        G(r, 0, v[0], v[4], v[8], v[12]);                                                                              \
        G(r, 1, v[1], v[5], v[9], v[13]);                                                                              \
        G(r, 2, v[2], v[6], v[10], v[14]);                                                                             \
        G(r, 3, v[3], v[7], v[11], v[15]);                                                                             \
        G(r, 4, v[0], v[5], v[10], v[15]);                                                                             \
        G(r, 5, v[1], v[6], v[11], v[12]);                                                                             \
        G(r, 6, v[2], v[7], v[8], v[13]);                                                                              \
        G(r, 7, v[3], v[4], v[9], v[14]);                                                                              \
    } while (0)

    ROUND(0);
    ROUND(1);
    ROUND(2);
    ROUND(3);
    ROUND(4);
    ROUND(5);
    ROUND(6);
    ROUND(7);
    ROUND(8);
    ROUND(9);
    ROUND(10);
    ROUND(11);

#undef G
#undef ROUND

    for (size_t i = 0; i < 8; ++i) {
        S->h[i] = S->h[i] ^ v[i] ^ v[i + 8];
    }
}

} // namespace

int blake2b_init(blake2b_state* S, size_t outlen)
{
    if (outlen == 0 || outlen > BLAKE2B_OUTBYTES) {
        return -1;
    }

    std::memset(S, 0, sizeof(blake2b_state));
    for (size_t i = 0; i < 8; ++i) {
        S->h[i] = blake2b_IV[i];
    }

    // Parameter block: digest_length = outlen, key_length = 0, fanout = 1, depth = 1, rest = 0
    // First 8 bytes of param block as a uint64_t (little-endian):
    // [digest_length(1), key_length(1), fanout(1), depth(1), leaf_length(4)]
    S->h[0] ^= 0x01010000ULL ^ outlen;
    S->outlen = outlen;

    return 0;
}

int blake2b_update(blake2b_state* S, const void* pin, size_t inlen)
{
    const auto* in = static_cast<const unsigned char*>(pin);

    if (inlen > 0) {
        size_t left = S->buflen;
        size_t fill = BLAKE2B_BLOCKBYTES - left;
        if (inlen > fill) {
            S->buflen = 0;
            std::memcpy(S->buf + left, in, fill);
            S->t[0] += BLAKE2B_BLOCKBYTES;
            S->t[1] += (S->t[0] < BLAKE2B_BLOCKBYTES) ? 1 : 0;
            blake2b_compress(S, S->buf);
            in += fill;
            inlen -= fill;
            while (inlen > BLAKE2B_BLOCKBYTES) {
                S->t[0] += BLAKE2B_BLOCKBYTES;
                S->t[1] += (S->t[0] < BLAKE2B_BLOCKBYTES) ? 1 : 0;
                blake2b_compress(S, in);
                in += BLAKE2B_BLOCKBYTES;
                inlen -= BLAKE2B_BLOCKBYTES;
            }
        }
        std::memcpy(S->buf + S->buflen, in, inlen);
        S->buflen += inlen;
    }

    return 0;
}

int blake2b_final(blake2b_state* S, void* out, size_t outlen)
{
    uint8_t buffer[BLAKE2B_OUTBYTES] = { 0 };

    if (out == nullptr || outlen < S->outlen) {
        return -1;
    }

    // finalization flag
    S->t[0] += S->buflen;
    S->t[1] += (S->t[0] < S->buflen) ? 1 : 0;
    S->f[0] = UINT64_MAX;

    std::memset(S->buf + S->buflen, 0, BLAKE2B_BLOCKBYTES - S->buflen);
    blake2b_compress(S, S->buf);

    for (size_t i = 0; i < 8; ++i) {
        store64_le(buffer + sizeof(S->h[i]) * i, S->h[i]);
    }

    std::memcpy(out, buffer, outlen);
    return 0;
}

std::array<uint8_t, BLAKE2B_OUTBYTES> blake2b(const uint8_t* data, size_t len)
{
    blake2b_state S;
    std::array<uint8_t, BLAKE2B_OUTBYTES> output{};
    blake2b_init(&S, BLAKE2B_OUTBYTES);
    blake2b_update(&S, data, len);
    blake2b_final(&S, output.data(), output.size());
    return output;
}

} // namespace bb::ignition
