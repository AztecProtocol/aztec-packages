#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/utils/shplemini_accumulator.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {
/*!
\brief An efficient verifier for the evaluation proofs of multilinear polynomials and their shifts.

\details
\subsection Context

This Verifier combines verifiers from four protocols:
1. **Batch opening protocol**: Reduces various evaluation claims of multilinear polynomials and their shifts to the
opening claim of a single batched polynomial.
2. **Gemini protocol**: Reduces the batched polynomial opening claim to a claim about openings of Gemini univariate
polynomials.
3. **Shplonk protocol**: Reduces the opening of Gemini univariate polynomials at different points to a single opening
of a batched univariate polynomial. Outputs \f$ \text{shplonk_opening_claim} \f$
4. **KZG or IPA protocol**: Verifies the evaluation of the univariate batched by Shplonk.

**Important Observation**: From step 1 to step 4, the Verifier is not required to hash any results of its group
operations. Therefore, they could be performed at the very end, i.e. by the opening protocol of a chosen univariate PCS.
Because of this and the shape of the pairing check in Shplonk, various batch_mul calls could be reduced to a single
batch_mul call. This way we minimize the number of gates in the resulting recursive verifier circuits and save some
group operations in the native setting.

@remark The sequence of steps could be performed by performing batching of unshifted and shifted polynomials, feeding it
to the existing GeminiVerifier, whose output would be passed to the ShplonkVerifier and then to the reduce_verify method
of a chosing PCS. However, it would be less efficient than ShpleminiVerifier in terms of group and field operations.


\subsection Implementation Implementation details

The method \ref accumulate_batch_mul_arguments receives commitments to all prover polynomials, their claimed
evaluations, the sumcheck challenge, the group element \f$ [1]_1 \f$, and a pointer to the transcript. Its logic could
be divided into several steps:

1. Receive most of the challenges and prover data.
2. Run the \ref batch_multivariate_opening_claims method corresponding to step 1 above.
3. Corresponding to step 2 above:
   - Run the \ref batch_gemini_claims_received_from_prover method.
   - Compute the evaluation of the Gemini batched univariate.
4. Output a triple \f$ (\text{commitments}, \text{scalars}, \text{shplonk_evaluation_point}) \f$ that satiisfies the
following:
\f[ \text{batch_mul} (\text{commitments},\ \text{scalars}) = \text{shplonk_opening_claim}.\text{point}
\f]
and the sizes of 'commitments' and 'scalars' are equal to
\f[
\#\text{claimed_evaluations} + \text{log_circuit_size} + 2
\f]

The ouput triple is either fed to  the corresponding \ref  bb::KZG< Curve_ >::reduce_verify_shplemini_accumulator
"KZG method" or \ref  bb::IPA< Curve_ >::reduce_verify_shplemini_accumulator "IPA method". In the case of KZG, we reduce
\f$ 6 \f$ batch_mul calls needed for the verification of the multivariate evaluation claims to the single batch_mul
described above. In the case of IPA, the total number of batch_mul calls needed to verify the multivariate evaluation
claims is reduced by \f$ 5 \f$.


\todo Eliminate group operations spent on Shifted Polynomials. See <a
href="https://github.com/AztecProtocol/barretenberg/issues/1084">the related issue</a>.
*/
template <typename Curve> class ShpleminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;

  public:
    template <typename Transcript>
    static ShpleminiAccumulator<Curve> accumulate_batch_mul_arguments(Fr log_N,
                                                                      RefSpan<Commitment> unshifted_commitments,
                                                                      RefSpan<Commitment> shifted_commitments,
                                                                      RefSpan<Fr> claimed_evaluations,
                                                                      const std::vector<Fr>& multivariate_challenge,
                                                                      const Commitment& g1_identity,
                                                                      std::shared_ptr<Transcript>& transcript)
    {
        size_t log_circuit_size{ 0 };
        if constexpr (Curve::is_stdlib_type) {
            log_circuit_size = static_cast<uint32_t>(log_N.get_value());
        } else {
            log_circuit_size = static_cast<uint32_t>(log_N);
        }
        /// Get the challenge \f$\rho\f$ to batch commitments to multilinear polynomials and their shifts
        const Fr multivariate_batching_challenge = transcript->template get_challenge<Fr>("rho");
        /// Get Gemini commitments \f$(\text{com}(A_1), \text{com}(A_2), \ldots , \text{com}(A_{d-1}))\f$
        std::vector<Commitment> gemini_commitments =
            GeminiVerifier::get_gemini_commitments(log_circuit_size, transcript);
        /// Get Gemini evaluation challenge for \f$ A_i \f$, \f$i = 0,\ldots, d-1\f$
        const Fr gemini_evaluation_challenge = transcript->template get_challenge<Fr>("Gemini:r");
        /// Get evaluations \f$ \left( A_0(-r), A_1(-r^2), ... , A_{d-1}(-r^{2^{d-1}}) \right) \f$
        std::vector<Fr> gemini_evaluations(log_circuit_size);
        gemini_evaluations = GeminiVerifier_<Curve>::get_gemini_evaluations(log_circuit_size, transcript);
        /// Compute vector \f$ (r, r^2, ... , r^{2^{d-1}}\f$), where \f$ d = \text{log_circuit_size}\f$
        std::vector<Fr> gemini_eval_challenge_powers(log_circuit_size);
        gemini_eval_challenge_powers =
            gemini::powers_of_evaluation_challenge(gemini_evaluation_challenge, log_circuit_size);
        /// Get Shplonk batching challenge \f$ \nu \f$
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");
        /// Get the quotient commitment for the Shplonk batching of Gemini opening claims
        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");
        /// Start populating the vector \f$( Q, f_0,..., f_{k-1}, g_0,..., g_{m-1}, \text{com}(A_1),\ldots,
        /// \text{com}(A_{d-1}), [1]_1)\f$ by placing Shplonk commitment \f$ Q \f$
        std::vector<Commitment> commitments{ Q_commitment };
        /// Get Shplonk opening point \f$ z \f$, it is used to check the evaluation claims and the correctness of
        /// the batching
        const Fr shplonk_evaluation_challenge = transcript->template get_challenge<Fr>("Shplonk:z");
        /// Start computing the scalar that to be multiplied by \f$ [1]_1 \f$
        Fr constant_term_accumulator{ 0 };
        /// Initialize the vector of scalars placing the scalar \f$ 1 \f$ correposnding to \f$ \text{Q_commitment}\f$
        std::vector<Fr> scalars;
        if constexpr (Curve::is_stdlib_type) {
            auto builder = shplonk_batching_challenge.get_context();
            scalars.emplace_back(Fr(builder, 1));
        } else {
            scalars.emplace_back(Fr(1));
        }
        /// Compute \f$ 1/(z - r), 1/(z+r), 1/(z+r^2),\ldots, 1/(z+r^{2^{d-1}})\f$
        std::vector<Fr> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
            log_circuit_size + 1, shplonk_evaluation_challenge, gemini_eval_challenge_powers);
        /// Compute the multiplier for the batched unshifted prover polynomials, \f$i\f$-th unshifted commitment is
        /// multiplied by \f$ - \rho^{i} \cdot ( \frac{1}{z-r} + \frac{\nu}{z+r} )\f$
        Fr unshifted_scalar = inverse_vanishing_evals[0] + shplonk_batching_challenge * inverse_vanishing_evals[1];
        /// Compute the multipler for the  batched shifted prover polynomials,  \f$ i\f$ -th shifted commitment is
        /// multiplied by \f$ - \rho^{i+k} \cdot r^{-1} \cdot (\frac{1}{z-r} - \frac{\nu}{z+r} ) \f$
        Fr shifted_scalar = gemini_evaluation_challenge.invert() *
                            (inverse_vanishing_evals[0] - shplonk_batching_challenge * inverse_vanishing_evals[1]);
        /// Place the commitments to prover polynomials in the commitments vector, compute the evaluation of the batched
        /// multilinear polynomial, populate the vector of scalars for the final batch mul
        Fr batched_evaluation{ 0 };
        batch_multivariate_opening_claims(unshifted_commitments,
                                          shifted_commitments,
                                          claimed_evaluations,
                                          multivariate_batching_challenge,
                                          unshifted_scalar,
                                          shifted_scalar,
                                          commitments,
                                          scalars,
                                          batched_evaluation);
        /// Place the commitments to Gemini \f$ A_i\f$ to the vector of commitments, compute the contributions from
        /// \f$ A_i(-r^{2^i})\f$ for \f$ i=1,\ldots, d-1\f$ to the constant term accumulator, add corresponding scalars
        batch_gemini_claims_received_from_prover(log_circuit_size,
                                                 gemini_commitments,
                                                 gemini_evaluations,
                                                 inverse_vanishing_evals,
                                                 shplonk_batching_challenge,
                                                 commitments,
                                                 scalars,
                                                 constant_term_accumulator);

        /// Compute \f$ A_0(r) \f$
        Fr a_0_pos = GeminiVerifier_<Curve>::compute_gemini_batched_univariate_evaluation(
            batched_evaluation, multivariate_challenge, gemini_eval_challenge_powers, gemini_evaluations);
        /// Add \f$ A_0(r)/(z-r)\f$ to the constant term accumulator
        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        /// Extract \f$ A_0(-r) \f$ from Gemini evaluations
        Fr& a_0_neg = gemini_evaluations[0];
        /// Add \f$ A_0(-r)/(z+r) \f$ to the constant term accumulator
        constant_term_accumulator += a_0_neg * shplonk_batching_challenge * inverse_vanishing_evals[1];
        /// Add \f$ [1]_1\f$ to commitments
        commitments.emplace_back(g1_identity);
        /// Add constant_term_accumulator to scalars
        scalars.emplace_back(constant_term_accumulator);

        return { commitments, scalars, shplonk_evaluation_challenge };
    };
    /**
     * @brief Populates the vectors of commitments and scalars, and computes the evaluation of the batched multilinear
     * polynomial at the sumcheck challenge.
     *
     * @details This function iterates over all commitments and the claimed evaluations of the corresponding
     * polynomials. The following notations are used:
     * - \f$ \rho \f$: Batching challenge for multivariate claims.
     * - \f$ z \f$: SHPLONK evaluation challenge.
     * - \f$ r \f$: Gemini evaluation challenge.
     * - \f$ \nu \f$: SHPLONK batching challenge.
     *
     * The vector of scalars is populated as follows:
     * \f[
     * \left(
     * - \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
     * \ldots,
     * - \rho^{i+k-1} \times \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
     * - \rho^{i+k} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right),
     * \ldots,
     * - \rho^{k+m-1} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
     * \right)
     * \f]
     *
     * The following vector is concatenated to the vector of commitments:
     * \f[
     * f_0, \ldots, f_{m-1}, f_{\text{shift}, 0}, \ldots, f_{\text{shift}, k-1}
     * \f]
     *
     * Simultaneously, the evaluation of the multilinear polynomial
     * \f[
     * \sum \rho^i \cdot f_i + \sum \rho^{i+k} \cdot f_{\text{shift}, i}
     * \f]
     * at the challenge point \f$ (u_0,\ldots, u_{d-1}) \f$ is computed.
     *
     * This approach minimizes the number of iterations over the commitments to multilinear polynomials
     * and eliminates the need to store the powers of \f$ \rho \f$.
     *
     * @param unshifted_commitments Commitments to unshifted polynomials.
     * @param shifted_commitments Commitments to shifted polynomials.
     * @param claimed_evaluations Claimed evaluations of the corresponding polynomials.
     * @param multivariate_batching_challenge Random challenge used for batching of multivariate evaluation claims.
     * @param unshifted_scalar Scaling factor for unshifted polynomials.
     * @param shifted_scalar Scaling factor for shifted polynomials.
     * @param commitments The vector of commitments to be populated.
     * @param scalars The vector of scalars to be populated.
     * @param batched_evaluation The evaluation of the batched multilinear polynomial.
     */
    static void batch_multivariate_opening_claims(RefSpan<Commitment> unshifted_commitments,
                                                  RefSpan<Commitment> shifted_commitments,
                                                  RefSpan<Fr> claimed_evaluations,
                                                  const Fr& multivariate_batching_challenge,
                                                  const Fr& unshifted_scalar,
                                                  const Fr& shifted_scalar,
                                                  std::vector<Commitment>& commitments,
                                                  std::vector<Fr>& scalars,
                                                  Fr& batched_evaluation)
    {
        size_t evaluation_idx = 0;
        Fr current_batching_challenge = Fr(1);
        for (auto& unshifted_commitment : unshifted_commitments) {
            /// Move unshifted commitments to the 'commitments' vector
            commitments.emplace_back(std::move(unshifted_commitment));
            /// Compute \f$ - \rho^{i} \cdot ( \frac{1}{z-r} + \frac{\nu}{z+r} )\f$ and place to the 'scalars'
            scalars.emplace_back(-unshifted_scalar * current_batching_challenge);
            /// Accumulate the evaluation of \f$ \sum \rho^i \cdot f_i \f$ at the sumcheck challenge
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            /// Update the batching challenge
            current_batching_challenge *= multivariate_batching_challenge;
        }
        for (auto& shifted_commitment : shifted_commitments) {
            /// Move shifted commitments to the 'commitments' vector
            commitments.emplace_back(std::move(shifted_commitment));
            /// Compute \f$ - \rho^{i+k} \cdot r^{-1} \cdot (\frac{1}{z-r} - \frac{\nu}{z+r} ) \f$ and place to
            /// 'scalars'
            scalars.emplace_back(-shifted_scalar * current_batching_challenge);
            /// Accumulate the evaluation of \f$ \sum \rho^{i+k} \cdot f_{\text{shift}, i}\f$ at
            /// the sumcheck challenge
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            /// Update the batching challenge
            current_batching_challenge *= multivariate_batching_challenge;
        }
    }
    /**
     * @brief Populates the 'commitments' and 'scalars' vectors with the commitments to Gemini fold polynomials \f$ A_i
     * \f$.
     *
     * @details Once the commitments to Gemini "fold" polynomials \f$ A_i \f$ and their evaluations at \f$ -r^{2^i} \f$,
     * where \f$ i = 1, \ldots, d-1 \f$, are received by the verifier, it performs the following operations:
     *
     * 1. Moves the vector
     * \f[
     * \left( \text{com}(A_1), \text{com}(A_2), \ldots, \text{com}(A_{d-1}) \right)
     * \f]
     * to the 'commitments' vector.
     *
     * 2. Computes the scalars:
     * \f[
     * \frac{\nu^{2}}{z + r^2}, \frac{\nu^3}{z + r^4}, \ldots, \frac{\nu^{d-1}}{z + r^{2^{d-1}}}
     * \f]
     * and places them into the 'scalars' vector.
     *
     * 3. Accumulates the summands of the constant term:
     * \f[
     * \sum_{i=2}^{d-1} \frac{\nu^{i} \cdot A_i(-r^{2^i})}{z + r^{2^i}}
     * \f]
     * and adds them to the 'constant_term_accumulator'.
     *
     * @param log_circuit_size The logarithm of the circuit size, determining the depth of the Gemini protocol.
     * @param gemini_commitments A vector containing the commitments to the Gemini fold polynomials \f$ A_i \f$.
     * @param gemini_evaluations A vector containing the evaluations of the Gemini fold polynomials \f$ A_i \f$ at
     * points \f$ -r^{2^i} \f$.
     * @param inverse_vanishing_evals A vector containing the inverse evaluations of the vanishing polynomial.
     * @param shplonk_batching_challenge The batching challenge \f$ \nu \f$ used in the SHPLONK protocol.
     * @param commitments Output vector where the commitments to the Gemini fold polynomials will be stored.
     * @param scalars Output vector where the computed scalars will be stored.
     * @param constant_term_accumulator The accumulator for the summands of the constant term.
     */
    static void batch_gemini_claims_received_from_prover(const size_t log_circuit_size,
                                                         const std::vector<Commitment>& gemini_commitments,
                                                         const std::vector<Fr>& gemini_evaluations,
                                                         const std::vector<Fr>& inverse_vanishing_evals,
                                                         const Fr& shplonk_batching_challenge,
                                                         std::vector<Commitment>& commitments,
                                                         std::vector<Fr>& scalars,
                                                         Fr& constant_term_accumulator)
    {
        /// Initialize batching challenge as \f$ \nu^2 \f$
        Fr current_batching_challenge = shplonk_batching_challenge * shplonk_batching_challenge;
        for (size_t j = 0; j < log_circuit_size - 1; ++j) {
            /// Compute the scaling factor \f$  \frac{\nu^{2+i}} {z + r^{2^{i+2}}} \f$ for \f$ i = 0,\ldots, d-2\f$
            Fr scaling_factor = current_batching_challenge * inverse_vanishing_evals[j + 2];
            /// Place the scaling factor to the 'scalars' vector
            scalars.emplace_back(-scaling_factor);
            /// Add \f$ A_i(-r^{2^i})\f$ for \f$ i = 1, \ldots, d-1 \f$ to the constant term accumulator
            constant_term_accumulator += scaling_factor * gemini_evaluations[j + 1];
            /// Update the batching challenge
            current_batching_challenge *= shplonk_batching_challenge;
            /// Move \f$ \text{com}(A_i) \f$ to the 'commitments' vector
            commitments.emplace_back(std::move(gemini_commitments[j]));
        }
    }
};
} // namespace bb