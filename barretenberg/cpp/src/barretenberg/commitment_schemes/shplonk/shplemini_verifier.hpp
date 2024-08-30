#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/utils/batch_mul_native.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/transcript/transcript.hpp"

/**
 * @brief Reduces multiple claims about commitments, each opened at a single point
 *  into a single claim for a single polynomial opened at a single point.
 *
 * We use the following terminology:
 * - Bₖ(X) is a random linear combination of all polynomials opened at Ωₖ
 *   we refer to it a 'merged_polynomial'.
 * - Tₖ(X) is the polynomial that interpolates Bₖ(X) over Ωₖ,
 * - zₖ(X) is the product of all (X-x), for x ∈ Ωₖ
 * - ẑₖ(X) = 1/zₖ(X)
 *
 * The challenges are ρ (batching) and r (random evaluation).
 *
 */
namespace bb {
template <typename Curve> struct ShpleminiVerifierOutput {
    std::vector<typename Curve::AffineElement> commitments;
    std::vector<typename Curve::ScalarField> scalars;
    typename Curve::ScalarField evaluation_point;
};

template <typename Curve> class ShpleminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;

  public:
    /**
    @brief An efficient verifier for the evaluation proofs of multilinear polynomials and their shifts.

    @details This Verifier combines verifiers from 4 protocols:
    - Batch opening protocol for multilinear polynomials and their shifts that reduces various opening claims to the
opening claim of a single polynomial
    - Gemini protocol that reduces a multilinear opening claim to a claim about openings of several univariate
polynomials
    - Shplonk protocol that reduces an opening of several univariate polynomials at different points to a single opening
of another univariate polynomial
    - KZG or IPA protocol that allows to check evaluation claims of univariate polynomials

    Although we are already able to perform this sequence of verification steps with the methods implemented, we face a
critical inefficiency in such implementation. Namely, this sequence of verifiers performs 6 batch_mul calls. In order to
reduce this to a single batch_mul call, we note that all group elements the 4 verifiers above receive could be
accumulated in a single vector that will be batch_multiplied by a vector of scalars constructed from various challenges
and evaluations received during the verification.


    This method receives commitments to all prover polynomials, their claimed evaluations, the sumcheck
    challenge, as well as the group element \f$ [1]_1 \f$, and a pointer to the transcript.

    The key observation here is that from step 1 to step 4, the verifier only populates its transcript with the
challenges and the data received from the prover and is not required to place any results of own computations to the
transcript. This allows us to organize the verification as follows:
    - Receive most of the challenges and prover data
    - Run batch_multivariate_opening_claims method corresponding to step 1 above
    - Run batch_gemini_claims_received_from_prover corresponding to step 2 above
    - Compute the evaluation of the Gemini batched univariate corresponding to step 2 above
    - Receive the rest of the prover's data and produce the paring points in reduce_verify corresponding to step 3 above
    Note that the Shplonk step is not present in this list because it links all these steps and could not be isolated
into a single method.
     *
     */

    template <typename Transcript>
    static ShpleminiVerifierOutput<Curve> accumulate_batch_mul_arguments(size_t log_circuit_size,
                                                                         RefSpan<Commitment> unshifted_commitments,
                                                                         RefSpan<Commitment> shifted_commitments,
                                                                         RefSpan<Fr> claimed_evaluations,
                                                                         std::vector<Fr>& multivariate_challenge,
                                                                         Commitment g1_identity,
                                                                         std::shared_ptr<Transcript>& transcript)
    {
        ShpleminiVerifierOutput<Curve> output;
        // Get challenge to batch commitments to multilinear polynomials
        const Fr rho = transcript->template get_challenge<Fr>("rho");
        info("rho", rho);

        // Get Gemini commitments (com(A_1), com(A_2), ... , com(A_{d-1}))
        std::vector<Commitment> gemini_commitments =
            GeminiVerifier_<Curve>::get_gemini_commitments(log_circuit_size, transcript);
        // Get Gemini evaluation challenge for A_i, i = 0,..., d-1
        const Fr gemini_eval_challenge = transcript->template get_challenge<Fr>("Gemini:r");
        // Get evaluations (A_0(-r), A_1(-r^2), ... , A_{d-1}(-r^{2^{d-1}}))
        std::vector<Fr> gemini_evaluations =
            GeminiVerifier_<Curve>::get_gemini_evaluations(log_circuit_size, transcript);
        // Compute vector (r, r^2, ... , r^{2^{d-1}}), where d = log circuit size
        std::vector<Fr> r_squares = gemini::squares_of_r(gemini_eval_challenge, log_circuit_size);
        // Get Shplonk batching challenge
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");
        // Get the quotient commitment for the Shplonk batching of Gemini opening claims
        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");
        // Start populating commitments for a batch_mul, (Q, f_0,..., f_{k-1}, g_0,..., g_{m-1}, com(A_1),...,
        // com(A_{d-1}), [1]_1)
        std::vector<Commitment> commitments{ Q_commitment };
        // Get Shplonk opening point z, it is used to check that the evaluation claims and the correctness of the
        // batching
        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");
        // Start computing the the term to be multiplied by [1]_1
        Fr constant_term_accumulator{ 0 };
        // Initialize the vector of scalars for the final batch_mul
        std::vector<Fr> scalars;
        if constexpr (Curve::is_stdlib_type) {
            auto builder = shplonk_batching_challenge.get_context();
            scalars.emplace_back(Fr(builder, 1)); // Fr(1)
        } else {
            scalars.emplace_back(Fr(1));
        }
        // Compute 1/(z - r), 1/(z+r), 1/(z+r^2),..., 1/(z+r^{2^{d-1}})
        std::vector<Fr> inverse_vanishing_evals =
            ShplonkVerifier_<Curve>::compute_inverse_vanishing_evals(log_circuit_size, z_challenge, r_squares);
        // the scalar corresponding to the batched unshifted prover polynomials, i-th unshifted commitment is
        // multiplied by - rho^{i} * (1/(z-r) + shplonk_batching_challenge * 1/(z+r))
        Fr unshifted_scalar = inverse_vanishing_evals[0] + shplonk_batching_challenge * inverse_vanishing_evals[1];
        // the scalar corresponding to the batched shifted prover polynomials,  i-th shifted commitment is
        // multiplied by - rho^{i+k} * 1/r *(1/(z-r) - shplonk_batching_challenge * 1/(z+r))
        Fr shifted_scalar = gemini_eval_challenge.invert() *
                            (inverse_vanishing_evals[0] - shplonk_batching_challenge * inverse_vanishing_evals[1]);
        // Place the commitments to prover polynomials in the commitments vector, compute the evaluation of the batched
        // multilinear polynomial, populate the vector of scalars for the final batch mul
        Fr batched_evaluation{ 0 };
        batch_multivariate_opening_claims(unshifted_commitments,
                                          shifted_commitments,
                                          claimed_evaluations,
                                          rho,
                                          unshifted_scalar,
                                          shifted_scalar,
                                          commitments,
                                          scalars,
                                          batched_evaluation);
        // Place the commitments to Gemini A_i to the vector of commitments, compute the contributions from
        // A_i(-r^{2^i}) for i=1,..., d-1 to the constant term accumulator, add corresponding scalars
        batch_gemini_claims_received_from_prover(log_circuit_size,
                                                 gemini_commitments,
                                                 gemini_evaluations,
                                                 inverse_vanishing_evals,
                                                 shplonk_batching_challenge,
                                                 commitments,
                                                 scalars,
                                                 constant_term_accumulator);

        // Compute A_0(r)
        Fr a_0_pos = GeminiVerifier_<Curve>::compute_gemini_batched_univariate_evaluation(
            batched_evaluation, multivariate_challenge, r_squares, gemini_evaluations);
        // Add A_0(r)/(z-r) to the constant term accumulator
        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        // Extract A_0(-r)
        Fr& a_0_neg = gemini_evaluations[0];
        // Add A_0(-r)/(z+r) to the constant term accumulator
        constant_term_accumulator += a_0_neg * shplonk_batching_challenge * inverse_vanishing_evals[1];
        // Add [1]_1 to commitments
        commitments.emplace_back(g1_identity);
        // Add constant_term_accumulator to scalars
        scalars.emplace_back(constant_term_accumulator);
        // Produce the pair of points (Q+ z W, - W) to be paired with [1]_2 and [x]_2, respectively
        output.evaluation_point = z_challenge;
        output.commitments = commitments;
        output.scalars = scalars;
        return output;
    };

    static void batch_multivariate_opening_claims(RefSpan<Commitment> unshifted_commitments,
                                                  RefSpan<Commitment> shifted_commitments,
                                                  RefSpan<Fr> claimed_evaluations,
                                                  const Fr& rho,
                                                  const Fr& unshifted_scalar,
                                                  const Fr& shifted_scalar,
                                                  std::vector<Commitment>& commitments,
                                                  std::vector<Fr>& scalars,
                                                  Fr& batched_evaluation)
    {
        size_t evaluation_idx = 0;
        Fr current_batching_challenge = Fr(1);
        for (auto& unshifted_commitment : unshifted_commitments) {
            commitments.emplace_back(unshifted_commitment);
            scalars.emplace_back(-unshifted_scalar * current_batching_challenge);
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            current_batching_challenge *= rho;
        }
        for (auto& shifted_commitment : shifted_commitments) {
            commitments.emplace_back(shifted_commitment);
            scalars.emplace_back(-shifted_scalar * current_batching_challenge);
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            current_batching_challenge *= rho;
        }
    }
    static void batch_gemini_claims_received_from_prover(size_t log_circuit_size,
                                                         const std::vector<Commitment>& gemini_commitments,
                                                         const std::vector<Fr>& gemini_evaluations,
                                                         const std::vector<Fr>& inverse_vanishing_evals,
                                                         const Fr& shplonk_batching_challenge,
                                                         std::vector<Commitment>& commitments,
                                                         std::vector<Fr>& scalars,
                                                         Fr& constant_term_accumulator)
    {
        Fr current_batching_challenge = shplonk_batching_challenge * shplonk_batching_challenge;
        for (size_t j = 0; j < log_circuit_size - 1; ++j) {
            Fr scaling_factor = current_batching_challenge * inverse_vanishing_evals[j + 2];
            constant_term_accumulator += scaling_factor * gemini_evaluations[j + 1];
            current_batching_challenge *= shplonk_batching_challenge;
            commitments.emplace_back(gemini_commitments[j]);
            scalars.emplace_back(-scaling_factor);
        }
    }
};

} // namespace bb