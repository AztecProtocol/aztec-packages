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
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb::ignition {

static constexpr size_t BLAKE2B_OUTBYTES = 64;
static constexpr size_t BLAKE2B_BLOCKBYTES = 128;

struct blake2b_state {
    uint64_t h[8];
    uint64_t t[2];
    uint64_t f[2];
    uint8_t buf[BLAKE2B_BLOCKBYTES];
    size_t buflen;
    size_t outlen;
};

int blake2b_init(blake2b_state* S, size_t outlen);
int blake2b_update(blake2b_state* S, const void* in, size_t inlen);
int blake2b_final(blake2b_state* S, void* out, size_t outlen);

std::array<uint8_t, BLAKE2B_OUTBYTES> blake2b(const uint8_t* data, size_t len);

} // namespace bb::ignition
