#include "structure_check.hpp"
#include <barretenberg/crypto/sha256/sha256.hpp>
#include <barretenberg/ecc/curves/bn254/pairing.hpp>

namespace bb::ignition {

namespace {

using Fr = Curve::ScalarField;
using Fq12 = Curve::TargetField;

/**
 * @brief Derive a deterministic scalar from a seed and index.
 * Uses SHA-256(seed || big-endian index bytes) reduced mod r.
 */
Fr derive_scalar(const crypto::Sha256Hash& seed, size_t index)
{
    std::vector<uint8_t> preimage(seed.begin(), seed.end());
    // Encode index as 8 bytes big-endian for unambiguous serialization
    for (int i = 7; i >= 0; --i) {
        preimage.push_back(static_cast<uint8_t>((index >> (static_cast<unsigned>(i) * 8)) & 0xFF));
    }
    auto h = crypto::sha256(preimage);
    return Fr::serialize_from_buffer(h.data());
}

} // namespace

bool verify_power_of_tau(const std::vector<std::filesystem::path>& transcript_paths,
                         const G2& g2_tau,
                         std::function<void(size_t, size_t)> progress_callback)
{
    // Fiat-Shamir seed: the ceremony data was committed in 2020, so a fixed public seed is sound.
    static constexpr std::string_view seed_str = "aztec-ignition-verification-2020";
    auto seed = crypto::sha256(std::vector<uint8_t>(seed_str.begin(), seed_str.end()));

    size_t scalar_index = 0;
    auto L_accum = Curve::Element::zero(); // Jacobian accumulator for Σ r_i · g1[i+1]
    auto R_accum = Curve::Element::zero(); // Jacobian accumulator for Σ r_i · g1[i]
    std::optional<G1> prev_last_point;

    const size_t total_chunks = transcript_paths.size();

    for (size_t chunk = 0; chunk < total_chunks; ++chunk) {
        auto points = load_transcript_g1(transcript_paths[chunk]);

        // Handle cross-transcript boundary: the last point of the previous chunk
        // and the first point of this chunk form a consecutive pair
        if (prev_last_point.has_value()) {
            Fr r = derive_scalar(seed, scalar_index++);
            R_accum += Curve::Element(prev_last_point.value()) * r;
            L_accum += Curve::Element(points[0]) * r;
        }

        // Within this chunk: pairs (points[0], points[1]), ..., (points[n-2], points[n-1])
        size_t n = points.size() - 1;
        std::vector<Fr> scalars(n);
        for (size_t i = 0; i < n; ++i) {
            scalars[i] = derive_scalar(seed, scalar_index++);
        }

        // R += Σ r_i · points[i] for i in [0, n-1]
        R_accum +=
            Curve::Element(G1::batch_mul(std::span<const G1>(points).subspan(0, n), std::span<const Fr>(scalars)));

        // L += Σ r_i · points[i+1] for i in [0, n-1]
        L_accum +=
            Curve::Element(G1::batch_mul(std::span<const G1>(points).subspan(1, n), std::span<const Fr>(scalars)));

        prev_last_point = points.back();

        if (progress_callback) {
            progress_callback(chunk + 1, total_chunks);
        }
    }

    // Final check: e(L, G2_gen) · e(-R, g2_tau) == 1
    G1 L_affine(L_accum);
    G1 neg_R_affine(-R_accum);
    std::array<G1, 2> P = { L_affine, neg_R_affine };
    std::array<G2, 2> Q = { G2::one(), g2_tau };
    Fq12 result = pairing::reduced_ate_pairing_batch(P.data(), Q.data(), 2);
    return result == Fq12::one();
}

} // namespace bb::ignition
