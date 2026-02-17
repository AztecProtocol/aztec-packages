#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb {

/**
 * @brief Compresses a MegaHonk proof from vector<fr> to a compact byte representation.
 *
 * Compression techniques:
 *   1. Point compression: store only x-coordinate + sign bit (instead of x and y)
 *   2. Fq-as-u256: store each Fq coordinate as 32 bytes (instead of 2 Fr for lo/hi split)
 *   3. Fr-as-u256: store each Fr scalar as 32 bytes (uniform encoding)
 *
 * The sign bit is embedded in bit 255 of the x-coordinate's uint256 representation.
 * Since Fq modulus < 2^254, bits 254-255 are always zero, giving us spare room.
 * This means each commitment is exactly 32 bytes — no separate sign-bit section.
 */
class ProofCompressor {
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;

    static constexpr uint256_t SIGN_BIT_MASK = uint256_t(1) << 255;

    static void write_u256(std::vector<uint8_t>& out, const uint256_t& val)
    {
        for (int i = 31; i >= 0; --i) {
            out.push_back(static_cast<uint8_t>(val.data[i / 8] >> (8 * (i % 8))));
        }
    }

    static uint256_t read_u256(const std::vector<uint8_t>& data, size_t& pos)
    {
        uint256_t val{ 0, 0, 0, 0 };
        for (int i = 31; i >= 0; --i) {
            val.data[i / 8] |= static_cast<uint64_t>(data[pos++]) << (8 * (i % 8));
        }
        return val;
    }

    static Fq reconstruct_fq(const Fr& lo, const Fr& hi)
    {
        constexpr uint64_t NUM_LIMB_BITS = 68;
        return Fq(uint256_t(lo) + (uint256_t(hi) << (NUM_LIMB_BITS * 2)));
    }

    static std::pair<Fr, Fr> split_fq(const Fq& val)
    {
        constexpr uint64_t LOWER_BITS = 136;
        constexpr uint256_t LOWER_MASK = (uint256_t(1) << LOWER_BITS) - 1;
        const uint256_t v = uint256_t(val);
        return { Fr(v & LOWER_MASK), Fr(v >> LOWER_BITS) };
    }

    /**
     * @brief Walk a non-ZK Honk proof layout, calling on_scalar/on_commitment for each element.
     * @details Defines the layout once; compress and decompress provide different callbacks.
     *          For chonk, call this once per sub-proof.
     */
    template <typename Flavor, typename ScalarFn, typename CommitmentFn>
    static void walk_honk_proof(ScalarFn&& process_scalar,
                                CommitmentFn&& process_commitment,
                                size_t num_public_inputs,
                                size_t log_n)
    {
        // Public inputs
        for (size_t i = 0; i < num_public_inputs; i++) {
            process_scalar();
        }
        // Witness commitments
        for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
            process_commitment();
        }
        // Sumcheck univariates
        for (size_t i = 0; i < log_n * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
            process_scalar();
        }
        // Sumcheck evaluations
        for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
            process_scalar();
        }
        // Gemini fold commitments
        for (size_t i = 0; i < log_n - 1; i++) {
            process_commitment();
        }
        // Gemini fold evaluations
        for (size_t i = 0; i < log_n; i++) {
            process_scalar();
        }
        // Shplonk Q + KZG W
        process_commitment();
        process_commitment();
    }

  public:
    template <typename Flavor>
    static std::vector<uint8_t> compress_proof(const HonkProof& proof, size_t num_public_inputs, size_t log_n)
    {
        std::vector<uint8_t> out;
        size_t offset = 0;

        auto compress_scalar = [&]() { write_u256(out, uint256_t(proof[offset++])); };

        auto compress_commitment = [&]() {
            bool is_infinity = proof[offset].is_zero() && proof[offset + 1].is_zero() && proof[offset + 2].is_zero() &&
                               proof[offset + 3].is_zero();
            if (is_infinity) {
                write_u256(out, uint256_t(0));
                offset += 4;
                return;
            }

            Fq x = reconstruct_fq(proof[offset], proof[offset + 1]);
            Fq y = reconstruct_fq(proof[offset + 2], proof[offset + 3]);
            offset += 4;

            uint256_t x_val = uint256_t(x);
            if (uint256_t(y) > (uint256_t(Fq::modulus) - 1) / 2) {
                x_val |= SIGN_BIT_MASK;
            }
            write_u256(out, x_val);
        };

        walk_honk_proof<Flavor>(compress_scalar, compress_commitment, num_public_inputs, log_n);
        BB_ASSERT(offset == proof.size());
        return out;
    }

    template <typename Flavor>
    static HonkProof decompress_proof(const std::vector<uint8_t>& compressed, size_t num_public_inputs, size_t log_n)
    {
        HonkProof proof;
        size_t pos = 0;

        auto decompress_scalar = [&]() { proof.emplace_back(read_u256(compressed, pos)); };

        auto decompress_commitment = [&]() {
            uint256_t raw = read_u256(compressed, pos);
            bool sign = (raw & SIGN_BIT_MASK) != 0;
            uint256_t x_val = raw & ~SIGN_BIT_MASK;

            if (x_val == uint256_t(0) && !sign) {
                for (int j = 0; j < 4; j++) {
                    proof.emplace_back(Fr::zero());
                }
                return;
            }

            Fq x(x_val);
            Fq y_squared = x * x * x + Bn254G1Params::b;
            auto [is_square, y] = y_squared.sqrt();
            BB_ASSERT(is_square);

            if ((uint256_t(y) > (uint256_t(Fq::modulus) - 1) / 2) != sign) {
                y = -y;
            }

            auto [x_lo, x_hi] = split_fq(x);
            auto [y_lo, y_hi] = split_fq(y);
            proof.emplace_back(x_lo);
            proof.emplace_back(x_hi);
            proof.emplace_back(y_lo);
            proof.emplace_back(y_hi);
        };

        walk_honk_proof<Flavor>(decompress_scalar, decompress_commitment, num_public_inputs, log_n);
        BB_ASSERT(pos == compressed.size());
        return proof;
    }
};

} // namespace bb
