// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/verification_key.hpp"
namespace bb {

/**
 * @brief Representation of the Grumpkin Verifier Commitment Key inside a bn254 circuit
 *
 * @tparam Builder
 */
template <typename Curve_> class VerifierCommitmentKey {
  public:
    using Curve = Curve_;
    using Builder = Curve::Builder;
    using Commitment = Curve::AffineElement;
    using NativeEmbeddedCurve = typename Builder::EmbeddedCurve;

    /**
     * @brief Construct a recursive (in-circuit) Verifier Commitment Key from its native Grumpkin counterpart.
     * The first `num_points` native Grumpkin SRS monomial points are copied directly into in-circuit commitments;
     * these are the raw SRS points used for IPA verification.
     *
     * @details The Grumpkin SRS points are initialized as constants in the circuit but might be subsequently
     * turned into constant witnesses to make operations in the circuit more efficient.
     */
    VerifierCommitmentKey([[maybe_unused]] Builder* builder,
                          size_t num_points,
                          const VerifierCommitmentKey<NativeEmbeddedCurve>& native_pcs_verification_key)
    {
        auto native_points = native_pcs_verification_key.get_monomial_points();
        BB_ASSERT_LTE(num_points, native_points.size());
        for (size_t i = 0; i < num_points; i += 1) {
            monomial_points.emplace_back(Commitment(native_points[i]));
        }
    }

    std::vector<Commitment> get_monomial_points() const { return monomial_points; }

  private:
    std::vector<Commitment> monomial_points;
};
} // namespace bb
