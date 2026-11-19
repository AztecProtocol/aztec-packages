#pragma once
/**
 * @file sha256.hpp
 * @brief SHA-256 (FIPS 180-4): the store's value digest (the `hash` column), which identifies a value for a
 * multimap's dedup and DeleteValue.
 */

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace aztec::kv {

class Sha256 {
  public:
    void update(const uint8_t* data, size_t length)
    {
        total_ += length;
        if (buffered_ > 0) {
            size_t take = std::min(length, size_t(64) - buffered_);
            std::memcpy(block_.data() + buffered_, data, take);
            buffered_ += take;
            data += take;
            length -= take;
            if (buffered_ < 64) {
                return;
            }
            compress(block_.data());
            buffered_ = 0;
        }
        for (; length >= 64; data += 64, length -= 64) {
            compress(data);
        }
        std::memcpy(block_.data(), data, length);
        buffered_ = length;
    }

    std::array<uint8_t, 32> finish()
    {
        uint64_t bits = total_ * 8;
        uint8_t pad = 0x80;
        update(&pad, 1);
        uint8_t zero = 0;
        while (buffered_ != 56) {
            update(&zero, 1);
        }
        uint8_t length[8];
        for (int i = 0; i < 8; i++) {
            length[i] = uint8_t(bits >> (56 - 8 * i));
        }
        update(length, 8);
        std::array<uint8_t, 32> out{};
        for (int i = 0; i < 8; i++) {
            for (int j = 0; j < 4; j++) {
                out[size_t(4 * i + j)] = uint8_t(state_[size_t(i)] >> (24 - 8 * j));
            }
        }
        return out;
    }

  private:
    static uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }

    void compress(const uint8_t* p)
    {
        static constexpr uint32_t K[64] = {
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
        };
        uint32_t w[64];
        for (int i = 0; i < 16; i++) {
            w[i] = uint32_t(p[4 * i]) << 24 | uint32_t(p[4 * i + 1]) << 16 | uint32_t(p[4 * i + 2]) << 8 |
                   uint32_t(p[4 * i + 3]);
        }
        for (int i = 16; i < 64; i++) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = state_[0], b = state_[1], c = state_[2], d = state_[3];
        uint32_t e = state_[4], f = state_[5], g = state_[6], h = state_[7];
        for (int i = 0; i < 64; i++) {
            uint32_t t1 = h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
            uint32_t t2 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
            h = g;
            g = f;
            f = e;
            e = d + t1;
            d = c;
            c = b;
            b = a;
            a = t1 + t2;
        }
        state_[0] += a;
        state_[1] += b;
        state_[2] += c;
        state_[3] += d;
        state_[4] += e;
        state_[5] += f;
        state_[6] += g;
        state_[7] += h;
    }

    std::array<uint32_t, 8> state_{ 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    std::array<uint8_t, 64> block_{};
    size_t buffered_ = 0;
    uint64_t total_ = 0;
};

} // namespace aztec::kv
