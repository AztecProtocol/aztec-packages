#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/numeric/uintx/uintx.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace crypto {

template <typename FF, size_t t, size_t d, size_t sbox_size, size_t rounds_f, size_t rounds_p>
class Poseidon2DeriveParams {
  public:
    static constexpr size_t NUM_ROUNDS = rounds_f + rounds_p;
    static constexpr size_t BLAKE3S_OUTPUT_SIZE = 32;

    using RoundConstants = std::array<FF, t>;
    using MatrixDiagonal = std::array<FF, t>;
    using RoundConstantsContainer = std::array<RoundConstants, NUM_ROUNDS>;

    static FF hash_to_field_element(uint8_t* buffer, size_t buffer_size)
    {
        buffer[buffer_size - 1] = 0;
        const auto hash_hi = blake3::blake3s_constexpr(buffer, buffer_size);
        buffer[buffer_size - 1] = 1;
        const auto hash_lo = blake3::blake3s_constexpr(buffer, buffer_size);
        // custom serialize methods as common/serialize.hpp is not constexpr!
        const auto read_uint256 = [](const uint8_t* in) {
            const auto read_limb = [](const uint8_t* in, uint64_t& out) {
                for (size_t i = 0; i < 8; ++i) {
                    out += static_cast<uint64_t>(in[i]) << ((7 - i) * 8);
                }
            };
            uint256_t out = 0;
            read_limb(&in[0], out.data[3]);
            read_limb(&in[8], out.data[2]);
            read_limb(&in[16], out.data[1]);
            read_limb(&in[24], out.data[0]);
            return out;
        };
        // interpret 64 byte hash output as a uint512_t, reduce to Fq element
        //(512 bits of entropy ensures result is not biased as 512 >> Fq::modulus.get_msb())
        return FF(uint512_t(read_uint256(&hash_lo[0]), read_uint256(&hash_hi[0])));
    }

    // n.b. this can be made constexpr but it will nuke compile times as compiler will evaluate this method call at
    // compile time
    static MatrixDiagonal generate_internal_matrix_diagonal()
    {
        // TODO: validate the values produced by this method are secure. See https://eprint.iacr.org/2023/323
        std::string seed = "Poseidon2 Internal Matrix Parameters";
        std::vector<uint8_t> seed_bytes(seed.begin(), seed.end());
        auto seed_hash = blake3::blake3s_constexpr(&seed_bytes[0], seed_bytes.size());

        std::array<uint8_t, BLAKE3S_OUTPUT_SIZE + 2> m_preimage;
        m_preimage[BLAKE3S_OUTPUT_SIZE] = 0;
        m_preimage[BLAKE3S_OUTPUT_SIZE + 1] = 0;
        std::copy(seed_hash.begin(), seed_hash.end(), m_preimage.begin());

        uint8_t count = 0;
        MatrixDiagonal res;
        for (size_t i = 0; i < t; ++i) {
            m_preimage[BLAKE3S_OUTPUT_SIZE] = count++;
            res[i] = hash_to_field_element(&seed_hash[0], 32);
        }
        return res;
    }

    // n.b. this can be made constexpr but it will nuke compile times as compiler will evaluate this method call at
    // compile time
    static RoundConstantsContainer derive_round_constants()
    {
        std::string seed = "Gentlemen, a short view back to the past.";
        std::vector<uint8_t> seed_bytes(seed.begin(), seed.end());
        auto seed_hash = blake3::blake3s_constexpr(&seed_bytes[0], seed_bytes.size());
        constexpr size_t NUM_METADATA_BYTES = 7;
        constexpr size_t PREIMAGE_SIZE = BLAKE3S_OUTPUT_SIZE + NUM_METADATA_BYTES;

        std::array<uint8_t, PREIMAGE_SIZE> rc_preimage;
        std::copy(seed_hash.begin(), seed_hash.end(), rc_preimage.begin());

        uint8_t rc_count = 0;
        rc_preimage[BLAKE3S_OUTPUT_SIZE] = static_cast<uint8_t>(t);
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 1] = static_cast<uint8_t>(d);
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 2] = static_cast<uint8_t>(rounds_f);
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 3] = static_cast<uint8_t>(rounds_p);
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 4] = static_cast<uint8_t>(sbox_size);
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 5] = rc_count;
        rc_preimage[BLAKE3S_OUTPUT_SIZE + 6] = 0;

        RoundConstantsContainer round_constants;
        for (size_t i = 0; i < NUM_ROUNDS; ++i) {
            for (size_t j = 0; j < t; ++j) {
                rc_preimage[BLAKE3S_OUTPUT_SIZE + 5] = rc_count++;
                round_constants[i][j] = hash_to_field_element(&rc_preimage[0], PREIMAGE_SIZE);
            }
        }
        return round_constants;
    }
};
} // namespace crypto