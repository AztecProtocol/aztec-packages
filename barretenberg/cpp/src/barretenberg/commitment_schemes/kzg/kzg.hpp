// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <memory>
#include <utility>

namespace bb {

template <typename Curve_> class KZG {
  public:
    using Curve = Curve_;
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using GroupElement = typename Curve::Element;
    using Polynomial = bb::Polynomial<Fr>;
    using VerifierAccumulator = std::array<GroupElement, 2>;

    /**
     * @brief Computes the KZG commitment to an opening proof polynomial at a single evaluation point
     *
     * @param ck The commitment key which has a commit function, the srs and pippenger_runtime_state
     * @param opening_claim {p, (r, v = p(r))} where p is the witness polynomial whose opening proof needs to be
     * computed
     * @param prover_transcript Prover transcript
     */
    template <typename Transcript>
    static void compute_opening_proof(const CK& ck,
                                      const ProverOpeningClaim<Curve>& opening_claim,
                                      const std::shared_ptr<Transcript>& prover_trancript)
    {
        Polynomial quotient = opening_claim.polynomial;
        OpeningPair<Curve> pair = opening_claim.opening_pair;
        Commitment quotient_commitment;

        if (opening_claim.polynomial.is_empty()) {
            // We treat the empty polynomial as the zero polynomial
            quotient_commitment = Commitment::infinity();
        } else {
            quotient.at(0) = quotient[0] - pair.evaluation;
            // Computes the coefficients for the quotient polynomial q(X) = (p(X) - v) / (X - r) through an FFT
            quotient.factor_roots(pair.challenge);
            quotient_commitment = ck.commit(quotient);
        }

        // TODO(#479): for now we compute the KZG commitment directly to unify the KZG and IPA interfaces but in the
        // future we might need to adjust this to use the incoming alternative to work queue (i.e. variation of
        // pthreads) or even the work queue itself
        prover_trancript->send_to_verifier("KZG:W", quotient_commitment);
    };

    /**
     * @brief Computes the input points for the pairing check needed to verify a KZG opening claim of a single
     * polynomial commitment. This reduction is non-interactive and always succeeds.
     * @details This is used in the recursive setting where we want to "aggregate" proofs, not verify them.
     *
     * @param claim OpeningClaim ({r, v}, C)
     * @return  {P₀, P₁} where
     *      - P₀ = C − v⋅[1]₁ + r⋅[W(x)]₁
     *      - P₁ = - [W(x)]₁
     */
    template <typename Transcript>
    static VerifierAccumulator reduce_verify(const OpeningClaim<Curve>& claim,
                                             const std::shared_ptr<Transcript>& verifier_transcript)
    {
        auto quotient_commitment = verifier_transcript->template receive_from_prover<Commitment>("KZG:W");

        // Note: The pairing check can be expressed naturally as
        // e(C - v * [1]_1, [1]_2) = e([W]_1, [X - r]_2) where C =[p(X)]_1. This can be rearranged (e.g. see the plonk
        // paper) as e(C + r*[W]_1 - v*[1]_1, [1]_2) * e(-[W]_1, [X]_2) = 1, or e(P_0, [1]_2) * e(P_1, [X]_2) = 1
        GroupElement P_0;
        if constexpr (Curve::is_stdlib_type) {
            // Express operation as a batch_mul in order to use Goblinization if available
            auto builder = quotient_commitment.get_context();
            auto one = Fr(builder, 1);
            std::vector<GroupElement> commitments = { claim.commitment,
                                                      quotient_commitment,
                                                      GroupElement::one(builder) };
            std::vector<Fr> scalars = { one, claim.opening_pair.challenge, -claim.opening_pair.evaluation };
            P_0 = GroupElement::batch_mul(commitments, scalars);

        } else {
            P_0 = claim.commitment;
            P_0 += quotient_commitment * claim.opening_pair.challenge;
            P_0 -= GroupElement::one() * claim.opening_pair.evaluation;
        }

        auto P_1 = -quotient_commitment;
        return { P_0, P_1 };
    };

    /**
     * @brief Computes the input points for the pairing check needed to verify a KZG opening claim obtained from a
     * Shplemini accumulator.
     *
     * @details This function is used in a recursive setting where we want to "aggregate" proofs. In the Shplemini case,
     * the commitment \f$ C \f$ is encoded into the vectors `commitments` and `scalars` contained in the
     * `batch_opening_claim`. More explicitly, \f$ C = \sum \text{commitments}_i \cdot \text{scalars}_i \f$. To avoid
     * performing an extra `batch_mul`, we simply add the commitment \f$ [W]_1 \f$ to the vector of commitments and
     * the Shplonk evaluation challenge to the vector of scalars and perform a single batch_mul that computes \f$C +
     * W\cdot z \f$.
     *
     * @param batch_opening_claim \f$(\text{commitments}, \text{scalars}, \text{shplonk_evaluation_challenge})\f$
     *        A struct containing the commitments, scalars, and the Shplonk evaluation challenge.
     * @return \f$ \{P_0, P_1\}\f$ where:
     *         - \f$ P_0 = C + [W(x)]_1 \cdot z \f$
     *         - \f$ P_1 = - [W(x)]_1 \f$
     */
    template <typename Transcript>
    static VerifierAccumulator reduce_verify_batch_opening_claim(BatchOpeningClaim<Curve> batch_opening_claim,
                                                                 const std::shared_ptr<Transcript>& transcript)
    {
        auto quotient_commitment = transcript->template receive_from_prover<Commitment>("KZG:W");

        // The pairing check can be expressed as
        // e(C + [W]₁ ⋅ z, [1]₂) * e(−[W]₁, [X]₂) = 1, where C = ∑ commitmentsᵢ ⋅ scalarsᵢ.
        GroupElement P_0;
        // Place the commitment to W to 'commitments'
        batch_opening_claim.commitments.emplace_back(quotient_commitment);
        // Update the scalars by adding the Shplonk evaluation challenge z
        batch_opening_claim.scalars.emplace_back(batch_opening_claim.evaluation_point);
        // Compute C + [W]₁ ⋅ z
        if constexpr (Curve::is_stdlib_type) {
            P_0 = GroupElement::batch_mul(batch_opening_claim.commitments,
                                          batch_opening_claim.scalars,
                                          /*max_num_bits=*/0,
                                          /*with_edgecases=*/true);
        } else {
            P_0 = batch_mul_native(batch_opening_claim.commitments, batch_opening_claim.scalars);
        }
        auto P_1 = -quotient_commitment;

        return { P_0, P_1 };
    }
};
} // namespace bb
