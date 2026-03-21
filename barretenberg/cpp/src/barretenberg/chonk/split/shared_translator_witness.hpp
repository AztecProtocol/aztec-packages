#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb {

/**
 * @brief Shared witness data for the polynomial equivalence sub-protocol between Chonk_B and Chonk_G.
 *
 * @details Contains the data that both circuits must agree on:
 *   - BatchOpeningClaim (commitments, scalars, evaluation point) from field verification
 *   - Quotient commitment W from PCS reduction (KZG or IPA)
 *
 * Templated on Curve to support both BN254 claims (from MegaZK, Merge, Translator) and
 * Grumpkin claims (from ECCVM).
 *
 * Provides serialization to 128-bit chunks that fit natively in both BN254::fr and Grumpkin::fr (= BN254::fq).
 * Each chunk c satisfies 0 <= c < 2^128, which is well below both field moduli (~2^254).
 */
template <typename Curve> struct SharedWitness {
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    std::vector<AffineElement> commitments;
    std::vector<ScalarField> scalars;
    ScalarField evaluation_point;
    AffineElement quotient_commitment; // W (KZG quotient or IPA quotient)

    static constexpr uint256_t CHUNK_MASK = (uint256_t(1) << 128) - 1;

    /**
     * @brief Serialize to 128-bit chunks for polynomial equivalence.
     *
     * Layout (each element serialized as lo/hi 128-bit halves):
     *   For each commitment C_i: C_i.x_lo, C_i.x_hi, C_i.y_lo, C_i.y_hi  (4 chunks each)
     *   For each scalar s_i: s_i_lo, s_i_hi                                (2 chunks each)
     *   Evaluation point: ep_lo, ep_hi                                      (2 chunks)
     *   Quotient commitment W: W.x_lo, W.x_hi, W.y_lo, W.y_hi             (4 chunks)
     *
     * Total: 6*N + 6 chunks where N = commitments.size() = scalars.size()
     */
    std::vector<uint256_t> to_chunks() const
    {
        const size_t N = commitments.size();
        BB_ASSERT(N == scalars.size());
        std::vector<uint256_t> chunks;
        chunks.reserve(6 * N + 6);

        // Commitment coordinates (base field elements → 2 chunks each)
        for (const auto& C : commitments) {
            uint256_t x(C.x);
            uint256_t y(C.y);
            chunks.push_back(x & CHUNK_MASK);
            chunks.push_back(x >> 128);
            chunks.push_back(y & CHUNK_MASK);
            chunks.push_back(y >> 128);
        }

        // Scalars (scalar field elements → 2 chunks each)
        for (const auto& s : scalars) {
            uint256_t sv(s);
            chunks.push_back(sv & CHUNK_MASK);
            chunks.push_back(sv >> 128);
        }

        // Evaluation point (scalar field → 2 chunks)
        uint256_t ep(evaluation_point);
        chunks.push_back(ep & CHUNK_MASK);
        chunks.push_back(ep >> 128);

        // Quotient commitment W (base field coordinates → 2 chunks each)
        uint256_t wx(quotient_commitment.x);
        uint256_t wy(quotient_commitment.y);
        chunks.push_back(wx & CHUNK_MASK);
        chunks.push_back(wx >> 128);
        chunks.push_back(wy & CHUNK_MASK);
        chunks.push_back(wy >> 128);

        return chunks;
    }

    /**
     * @brief Deserialize from 128-bit chunks.
     * @details Inverse of to_chunks(). total_chunks = 6*N + 6, so N = (total - 6) / 6.
     */
    static SharedWitness from_chunks(const std::vector<uint256_t>& chunks)
    {
        using BaseField = typename AffineElement::Fq;

        BB_ASSERT(chunks.size() >= 6 && (chunks.size() - 6) % 6 == 0);
        const size_t N = (chunks.size() - 6) / 6;

        SharedWitness result;
        result.commitments.reserve(N);
        result.scalars.reserve(N);

        size_t idx = 0;

        // Commitment coordinates
        for (size_t i = 0; i < N; i++) {
            BaseField x(chunks[idx] | (chunks[idx + 1] << 128));
            BaseField y(chunks[idx + 2] | (chunks[idx + 3] << 128));
            result.commitments.emplace_back(x, y);
            idx += 4;
        }

        // Scalars
        for (size_t i = 0; i < N; i++) {
            result.scalars.emplace_back(ScalarField(chunks[idx] | (chunks[idx + 1] << 128)));
            idx += 2;
        }

        // Evaluation point
        result.evaluation_point = ScalarField(chunks[idx] | (chunks[idx + 1] << 128));
        idx += 2;

        // Quotient commitment W
        BaseField wx(chunks[idx] | (chunks[idx + 1] << 128));
        BaseField wy(chunks[idx + 2] | (chunks[idx + 3] << 128));
        result.quotient_commitment = AffineElement(wx, wy);
        idx += 4;

        BB_ASSERT(idx == chunks.size());
        return result;
    }

    /**
     * @brief Construct from BatchOpeningClaim and quotient commitment W.
     */
    static SharedWitness from_claim(const BatchOpeningClaim<Curve>& claim, const AffineElement& W)
    {
        return SharedWitness{
            .commitments = claim.commitments,
            .scalars = claim.scalars,
            .evaluation_point = claim.evaluation_point,
            .quotient_commitment = W,
        };
    }

    bool operator==(const SharedWitness& other) const = default;
};

// Type aliases for convenience
using SharedTranslatorWitness = SharedWitness<curve::BN254>;
using SharedECCVMWitness = SharedWitness<curve::Grumpkin>;

/**
 * @brief Concatenate 128-bit chunks from multiple SharedWitness objects.
 * @details Used in the combined Chonk_B/Chonk_G circuits where all sub-proof shared witnesses
 * are hashed and evaluated together under a single polynomial equivalence protocol.
 */
inline std::vector<uint256_t> concatenate_chunks(const std::vector<std::vector<uint256_t>>& chunk_vectors)
{
    size_t total = 0;
    for (const auto& v : chunk_vectors) {
        total += v.size();
    }

    std::vector<uint256_t> result;
    result.reserve(total);
    for (const auto& v : chunk_vectors) {
        result.insert(result.end(), v.begin(), v.end());
    }
    return result;
}

} // namespace bb
