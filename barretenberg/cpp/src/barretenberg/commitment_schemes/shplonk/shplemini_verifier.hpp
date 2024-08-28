#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini.hpp"
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

template <typename Curve> class ShpleminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;

  public:
    /**
    Shplonk verifier optimized to verify gemini opening claims.

    This method receives commitments to all prover polynomials, their claimed evaluations, the sumcheck
    challenge, a challenge \f$ \rho \f$ aimed to batch the commitments to prover polynomials, a challenge \f$ r \f$ for
    the Gemini opening claims, and the Gemini claims. The latter is a tuple of a vector of powers of \f$ r \f$, a vector
    of evaluations of Gemini fold polynomials at \f$ - r,
    - r^2, \ldots, - r^{2^{d-1}} \f$ where \f$ d \f$ is the log_circuit_size, and a vector of commitments to the Gemini
    fold polynomials.

    The verifier receives the challenges required in Shplonk and gradually populates the vectors of commitments and
    scalars that will be multiplied at the very end. In the recursive setting, a batch_mul of size (NUM_ALL_ENTITIES +
    log_circuit_size + 2) is performed. In the native setting, these operations are performed sequentially.
     *
     */
    static OpeningClaim<Curve> verify_gemini(size_t log_circuit_size,
                                             Commitment g1_identity,
                                             RefSpan<Commitment> f_commitments,
                                             RefSpan<Commitment> g_commitments,
                                             auto claimed_evaluations,
                                             std::vector<Fr>& multivariate_challenge,
                                             auto& transcript)
    {
        // get the challenge to batch commitments to prover polynomials
        const Fr rho = transcript->template get_challenge<Fr>("rho");

        // to be populated as (com(A_1), com(A_2), ... , com(A_{d-1}))
        std::vector<Commitment> gemini_commitments;
        gemini_commitments.reserve(log_circuit_size - 1);
        // Get commitments com(A_i), i = 1,...,m-1 from transcript
        for (size_t i = 0; i < log_circuit_size - 1; ++i) {
            auto commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:FOLD_" + std::to_string(i + 1));
            gemini_commitments.emplace_back(commitment);
        }

        // Get the evaluation challenge for A_i, i = 0,..., d-1
        const Fr gemini_eval_challenge = transcript->template get_challenge<Fr>("Gemini:r");
        // populate the vector of evaluations (A_0(-r), A_1(-r^2), ... , A_{d-1}(-r^{2^{d-1}}))
        std::vector<Fr> gemini_evaluations;
        gemini_evaluations.reserve(log_circuit_size);
        for (size_t i = 0; i < log_circuit_size; ++i) {
            auto evaluation = transcript->template receive_from_prover<Fr>("Gemini:a_" + std::to_string(i));
            gemini_evaluations.emplace_back(evaluation);
        }
        // compute the vector (r, r^2, ... , r^{2^{d-1}}), where d = log circuit size
        std::vector<Fr> r_squares = gemini::squares_of_r(gemini_eval_challenge, log_circuit_size);

        // get Shplonk batching challenge
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");
        // quotient commitment for the batched opening claim
        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");
        // get Shplonk opening point z, it used to check that the evaluation claims and the correctness of the batching
        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");
        // accumulator for the scalar that will be multiplied by [1]_1
        auto constant_term_accumulator = Fr(0);
        // to be populated as follows (Q, f_0,..., f_{k-1}, g_0,..., g_{m-1}, com(A_1),..., com(A_{d-1}), [1]_1)
        std::vector<Commitment> commitments;
        commitments.emplace_back(Q_commitment);
        // initialize the vector of scalars for the final batch_mul
        std::vector<Fr> scalars;
        if constexpr (Curve::is_stdlib_type) {
            auto builder = shplonk_batching_challenge.get_context();
            scalars.emplace_back(Fr(builder, 1)); // Fr(1)
        } else {
            scalars.emplace_back(Fr(1));
        }
        // compute 1/(z - r), 1/(z+r), 1/(z+r^2),..., 1/(z+r^{2^{d-1}})
        std::vector<Fr> inverse_vanishing_evals;
        inverse_vanishing_evals.reserve(log_circuit_size + 1);
        // place 1/(z-r) manually
        inverse_vanishing_evals.emplace_back((z_challenge - gemini_eval_challenge).invert());
        for (const auto& challenge_point : r_squares) {
            inverse_vanishing_evals.emplace_back((z_challenge + challenge_point).invert());
        }
        // the scalar corresponding to the batched unshifted prover polynomials, i-th unshifted commitment is
        // multiplied by - rho^{i} * (1/(z-r) + shplonk_batching_challenge * 1/(z+r))
        Fr unshifted_scalar = inverse_vanishing_evals[0] + shplonk_batching_challenge * inverse_vanishing_evals[1];
        // the scalar corresponding to the batched shifted prover polynomials,  i-th shifted commitment is
        // multiplied by - rho^{i+k} * 1/r *(1/(z-r) - shplonk_batching_challenge * 1/(z+r))
        Fr shifted_scalar = gemini_eval_challenge.invert() *
                            (inverse_vanishing_evals[0] - shplonk_batching_challenge * inverse_vanishing_evals[1]);
        // place the commitments to prover polynomials in the commitments vector, compute the evaluation of the batched
        // multilinear polynomial, populate the vector of scalars for the final batch mul
        Fr current_batching_challenge = Fr(1);
        Fr batched_evaluation = Fr(0);
        size_t evaluation_idx = 0;
        // handle commitments to unshifted polynomials
        for (auto& unshifted_commitment : f_commitments) {
            commitments.emplace_back(unshifted_commitment);
            scalars.emplace_back(-unshifted_scalar * current_batching_challenge);
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            current_batching_challenge *= rho;
        }
        // handle commitments to shifted_polynomials
        for (auto& shifted_commitment : g_commitments) {
            commitments.emplace_back(shifted_commitment);
            scalars.emplace_back(-shifted_scalar * current_batching_challenge);
            batched_evaluation += claimed_evaluations[evaluation_idx] * current_batching_challenge;
            evaluation_idx += 1;
            current_batching_challenge *= rho;
        }
        // place the commitments to Gemini A_i to the vector of commitments, compute the contributions from
        // A_i(-r^{2^i}) for i=1,..., d-1 to the constant term accumulator, populate scalars
        current_batching_challenge = shplonk_batching_challenge * shplonk_batching_challenge;
        for (size_t j = 0; j < log_circuit_size - 1; ++j) {
            // (shplonk_batching_challenge)^(j+2) * (z + r^{2^j})
            Fr scaling_factor = current_batching_challenge * inverse_vanishing_evals[j + 2];
            // (shplonk_batching_challenge)^(j+2) * (z + r^{2^j}) * A_j(-r^{2^j})
            constant_term_accumulator += scaling_factor * gemini_evaluations[j + 1];
            current_batching_challenge *= shplonk_batching_challenge;
            commitments.emplace_back(gemini_commitments[j]);
            scalars.emplace_back(-scaling_factor);
        }
        // extract A_0(-r)
        Fr a_0_neg = gemini_evaluations[0];
        // compute A_0(r)
        auto a_0_pos = GeminiVerifier_<Curve>::compute_eval_pos(
            batched_evaluation, multivariate_challenge, r_squares, gemini_evaluations);
        // add A_0(r)/(z-r) to the constant term accumulator
        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        // add A_0(-r)/(z+r) to the constant term accumulator
        constant_term_accumulator += a_0_neg * shplonk_batching_challenge * inverse_vanishing_evals[1];
        // finalize the vector of commitments by adding [1]_1
        commitments.emplace_back(g1_identity);
        // finalize the vector of scalars
        scalars.emplace_back(constant_term_accumulator);
        GroupElement G_commitment;
        if constexpr (Curve::is_stdlib_type) {
            G_commitment = GroupElement::batch_mul(commitments, scalars, /*max_num_bits=*/0, /*with_edgecases=*/true);
        } else {
            G_commitment = batch_mul_native(commitments, scalars);
        }

        // Return opening pair (z, 0) and commitment [G]
        return { { z_challenge, Fr(0) }, G_commitment };
    };

    /**   Compute the evaluation \f$ A_0(r) = \sum \rho^i \cdot f_i + \frac{1}{r} \cdot \sum \rho^{i+k} g_i \f$.

    Initialize \f$A_{d}(r)\f$ with the batched evaluation \f$ \sum \rho^i f_i(\vec u) + \sum \rho^{i+k} g_i(\vec u)\f$.
    The folding property ensures that
    \f{align}
        A_\ell(r^{2^\ell}) = (1 - u_{\ell-1}) \frac{A_{\ell-1}\left(r^{2^{\ell-1}}\right) +
        A_{\ell-1}\left(-r^{2^{\ell-1}}\right)}{2} + u_{\ell-1} \frac{A_{\ell-1}\left(r^{2^{\ell-1}}\right) -
        A_{\ell-1}\left(-r^{2^{\ell-1}}\right)}{2r^{2^{\ell-1}}}
    \f}
    Therefore, the verifier could recover \f$A_0(r)\f$ by solving several linear equations.
    */

    /**
     * @brief Utility for native batch multiplication of group elements
     * @note This is used only for native verification and is not optimized for efficiency
     */
    static Commitment batch_mul_native(const std::vector<Commitment>& _points, const std::vector<Fr>& _scalars)
    {
        std::vector<Commitment> points;
        std::vector<Fr> scalars;
        for (auto [point, scalar] : zip_view(_points, _scalars)) {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/866) Special handling of point at infinity here
            // due to incorrect serialization.
            if (!scalar.is_zero() && !point.is_point_at_infinity() && !point.y.is_zero()) {
                points.emplace_back(point);
                scalars.emplace_back(scalar);
            }
        }

        if (points.empty()) {
            return Commitment::infinity();
        }

        auto result = points[0] * scalars[0];
        for (size_t idx = 1; idx < scalars.size(); ++idx) {
            result = result + points[idx] * scalars[idx];
        }
        return result;
    }
};

} // namespace bb