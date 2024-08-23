#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
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

/**
 * @brief Shplonk Prover
 *
 * @tparam Curve EC parameters
 */
template <typename Curve> class ShplonkProver_ {
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    /**
     * @brief Compute batched quotient polynomial Q(X) = ∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
     *
     * @param opening_claims list of prover opening claims {fⱼ(X), (xⱼ, vⱼ)} for a witness polynomial fⱼ(X), s.t. fⱼ(xⱼ)
     * = vⱼ.
     * @param nu batching challenge
     * @return Polynomial Q(X)
     */
    static Polynomial compute_batched_quotient(std::span<const ProverOpeningClaim<Curve>> opening_claims, const Fr& nu)
    {
        // Find n, the maximum size of all polynomials fⱼ(X)
        size_t max_poly_size{ 0 };
        for (const auto& claim : opening_claims) {
            max_poly_size = std::max(max_poly_size, claim.polynomial.size());
        }
        // Q(X) = ∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
        Polynomial Q(max_poly_size);
        Polynomial tmp(max_poly_size);

        Fr current_nu = Fr::one();
        for (const auto& claim : opening_claims) {

            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp[0] -= claim.opening_pair.evaluation;
            tmp.factor_roots(claim.opening_pair.challenge);

            // Add the claim quotient to the batched quotient polynomial
            Q.add_scaled(tmp, current_nu);
            current_nu *= nu;
        }

        // Return batched quotient polynomial Q(X)
        return Q;
    };

    /**
     * @brief Compute partially evaluated batched quotient polynomial difference Q(X) - Q_z(X)
     *
     * @param opening_pairs list of opening pairs (xⱼ, vⱼ) for a witness polynomial fⱼ(X), s.t. fⱼ(xⱼ) = vⱼ.
     * @param witness_polynomials list of polynomials fⱼ(X).
     * @param batched_quotient_Q Q(X) = ∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
     * @param nu_challenge
     * @param z_challenge
     * @return Output{OpeningPair, Polynomial}
     */
    static ProverOpeningClaim<Curve> compute_partially_evaluated_batched_quotient(
        std::span<const ProverOpeningClaim<Curve>> opening_claims,
        Polynomial& batched_quotient_Q,
        const Fr& nu_challenge,
        const Fr& z_challenge)
    {
        const size_t num_opening_claims = opening_claims.size();

        // {ẑⱼ(r)}ⱼ , where ẑⱼ(r) = 1/zⱼ(r) = 1/(r - xⱼ)
        std::vector<Fr> inverse_vanishing_evals;
        inverse_vanishing_evals.reserve(num_opening_claims);
        for (const auto& claim : opening_claims) {
            inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
        }
        Fr::batch_invert(inverse_vanishing_evals);

        // G(X) = Q(X) - Q_z(X) = Q(X) - ∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ ),
        // s.t. G(r) = 0
        Polynomial G(std::move(batched_quotient_Q)); // G(X) = Q(X)

        // G₀ = ∑ⱼ ρʲ ⋅ vⱼ / ( r − xⱼ )
        Fr current_nu = Fr::one();
        Polynomial tmp(G.size());
        size_t idx = 0;
        for (const auto& claim : opening_claims) {
            // tmp = ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ )
            tmp = claim.polynomial;
            tmp[0] -= claim.opening_pair.evaluation;
            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx]; // = ρʲ / ( r − xⱼ )

            // G -= ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ )
            G.add_scaled(tmp, -scaling_factor);

            current_nu *= nu_challenge;
            idx++;
        }

        // Return opening pair (z, 0) and polynomial G(X) = Q(X) - Q_z(X)
        return { .polynomial = G, .opening_pair = { .challenge = z_challenge, .evaluation = Fr::zero() } };
    };

    /**
     * @brief Returns a batched opening claim equivalent to a set of opening claims consisting of polynomials, each
     * opened at a single point.
     *
     * @param commitment_key
     * @param opening_claims
     * @param transcript
     * @return ProverOpeningClaim<Curve>
     */
    static ProverOpeningClaim<Curve> prove(const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
                                           std::span<ProverOpeningClaim<Curve>> opening_claims,
                                           auto& transcript)
    {
        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");
        auto batched_quotient = compute_batched_quotient(opening_claims, nu);
        auto batched_quotient_commitment = commitment_key->commit(batched_quotient);
        transcript->send_to_verifier("Shplonk:Q", batched_quotient_commitment);
        const Fr z = transcript->template get_challenge<Fr>("Shplonk:z");
        return compute_partially_evaluated_batched_quotient(opening_claims, batched_quotient, nu, z);
    }
};

template <typename Curve> class ShplonkVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;

  public:
    /**
     * @brief Recomputes the new claim commitment [G] given the proof and
     * the challenge r. No verification happens so this function always succeeds.
     *
     * @param g1_identity the identity element for the Curve
     * @param claims list of opening claims (Cⱼ, xⱼ, vⱼ) for a witness polynomial fⱼ(X), s.t. fⱼ(xⱼ) = vⱼ.
     * @param transcript
     * @return OpeningClaim
     */
    static OpeningClaim<Curve> reduce_verification(Commitment g1_identity,
                                                   std::span<const OpeningClaim<Curve>> claims,
                                                   auto& transcript)
    {

        const size_t num_claims = claims.size();
        // nu is a batching challenge for shplonk polynomials, \gamma in paper
        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");
        // W in paper
        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");
        // opening point to check that L(z) = 0 => L == 0 (step 4 in Shplonk),
        // r here
        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // [G] = [Q] - ∑ⱼ ρʲ / ( r − xⱼ )⋅[fⱼ] + G₀⋅[1]
        //     = [Q] - [∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ )]
        GroupElement G_commitment;

        // compute simulated commitment to [G] as a linear combination of
        // [Q], { [fⱼ] }, [1]:
        //  [G] = [Q] - ∑ⱼ (1/zⱼ(r))[Bⱼ]  + ( ∑ⱼ (1/zⱼ(r)) Tⱼ(r) )[1]
        //      = [Q] - ∑ⱼ (1/zⱼ(r))[Bⱼ]  +                    G₀ [1]
        // G₀ = ∑ⱼ ρʲ ⋅ vⱼ / ( r − xⱼ )
        auto G_commitment_constant = Fr(0);

        // TODO(#673): The recursive and non-recursive (native) logic is completely separated via the following
        // conditional. Much of the logic could be shared, but I've chosen to do it this way since soon the "else"
        // branch should be removed in its entirety, and "native" verification will utilize the recursive code paths
        // using a builder Simulator.
        if constexpr (Curve::is_stdlib_type) {
            auto builder = nu.get_context();

            // Containers for the inputs to the final batch mul
            std::vector<Commitment> commitments;
            std::vector<Fr> scalars;

            // [G] = [Q] - ∑ⱼ ρʲ / ( r − xⱼ )⋅[fⱼ] + G₀⋅[1]
            //     = [Q] - [∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ )]
            commitments.emplace_back(Q_commitment);
            scalars.emplace_back(Fr(builder, 1)); // Fr(1)

            // Compute {ẑⱼ(r)}ⱼ , where ẑⱼ(r) = 1/zⱼ(r) = 1/(r - xⱼ)
            std::vector<Fr> inverse_vanishing_evals;
            inverse_vanishing_evals.reserve(num_claims);
            for (const auto& claim : claims) {
                // Note: no need for batch inversion; emulated inversion is cheap. (just show known inverse is valid)
                inverse_vanishing_evals.emplace_back((z_challenge - claim.opening_pair.challenge).invert());
            }
            auto current_nu = Fr(1);
            // Note: commitments and scalars vectors used only in recursion setting for batch mul
            for (size_t j = 0; j < num_claims; ++j) {
                // (Cⱼ, xⱼ, vⱼ)
                const auto& [opening_pair, commitment] = claims[j];
                Fr scaling_factor = current_nu * inverse_vanishing_evals[j]; // = ρʲ / ( r − xⱼ )
                // G₀ += ρʲ / ( r − xⱼ ) ⋅ vⱼ
                G_commitment_constant += scaling_factor * opening_pair.evaluation;
                current_nu *= nu;
                // Store MSM inputs for batch mul
                commitments.emplace_back(commitment);
                scalars.emplace_back(-scaling_factor);
            }
            commitments.emplace_back(g1_identity);
            scalars.emplace_back(G_commitment_constant);
            // [G] += G₀⋅[1] = [G] + (∑ⱼ ρʲ ⋅ vⱼ / ( r − xⱼ ))⋅[1]
            G_commitment = GroupElement::batch_mul(commitments, scalars);
        } else {
            // [G] = [Q] - ∑ⱼ ρʲ / ( r − xⱼ )⋅[fⱼ] + G₀⋅[1]
            //     = [Q] - [∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / ( r − xⱼ )]
            G_commitment = Q_commitment;
            // Compute {ẑⱼ(r)}ⱼ , where ẑⱼ(r) = 1/zⱼ(r) = 1/(r - xⱼ)
            std::vector<Fr> inverse_vanishing_evals;
            inverse_vanishing_evals.reserve(num_claims);
            for (const auto& claim : claims) {
                inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
            }
            Fr::batch_invert(inverse_vanishing_evals);
            auto current_nu = Fr(1);
            // Note: commitments and scalars vectors used only in recursion setting for batch mul
            for (size_t j = 0; j < num_claims; ++j) {
                // (Cⱼ, xⱼ, vⱼ)
                const auto& [opening_pair, commitment] = claims[j];
                Fr scaling_factor = current_nu * inverse_vanishing_evals[j]; // = ρʲ / ( r − xⱼ )
                // G₀ += ρʲ / ( r − xⱼ ) ⋅ vⱼ
                G_commitment_constant += scaling_factor * opening_pair.evaluation;
                // [G] -= ρʲ / ( r − xⱼ )⋅[fⱼ]
                G_commitment -= commitment * scaling_factor;
                current_nu *= nu;
            }
            // [G] += G₀⋅[1] = [G] + (∑ⱼ ρʲ ⋅ vⱼ / ( r − xⱼ ))⋅[1]
            G_commitment += g1_identity * G_commitment_constant;
        }
        // Return opening pair (z, 0) and commitment [G]
        return { { z_challenge, Fr(0) }, G_commitment };
    };

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
    static OpeningClaim<Curve> verify_gemini(
        Commitment g1_identity,
        RefSpan<Commitment> f_commitments,
        RefSpan<Commitment> g_commitments,
        auto claimed_evaluations,
        std::vector<Fr>& multivariate_challenge,
        const Fr& rho,
        const Fr& gemini_r,
        //  Fr a_0_pos,
        std::tuple<std::vector<Fr>, std::vector<Fr>, std::vector<Commitment>> claims,
        auto& transcript)
    {
        // (r, r^2, ... , r^{2^{d-1}}), where d = log circuit size
        auto& r_squares = std::get<0>(claims);
        // (A_0(-r), A_1(-r^2), ... , A_{d-1}(-r^{2^{d-1}}))
        auto& gemini_evaluations = std::get<1>(claims);
        // (com(A_1), com(A_2), ... , com(A_{d-1}))
        auto& gemini_commitments = std::get<2>(claims);
        const size_t num_claims = gemini_commitments.size();
        // get Shplonk batching challenge
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");
        // quotient commitment for the batched opening claim
        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");
        // get Shplonk opening point z, it used to check that the evaluation claims and the correctness of the batching
        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");
        // accumulator for scalar that will be multiplied by [1]_1
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
        inverse_vanishing_evals.reserve(num_claims + 2);
        // place 1/(z-r) manually
        inverse_vanishing_evals.emplace_back((z_challenge - gemini_r).invert());
        for (const auto& challenge_point : r_squares) {
            inverse_vanishing_evals.emplace_back((z_challenge + challenge_point).invert());
        }
        // the scalar corresponding to the batched unshifted prover polynomials, i-th unshifted commitment is
        // multiplied by - rho^{i} * (1/(z-r) + shplonk_batching_challenge * 1/(z+r))
        Fr unshifted_scalar = inverse_vanishing_evals[0] + shplonk_batching_challenge * inverse_vanishing_evals[1];
        // the scalar corresponding to the batched shifted prover polynomials,  i-th shifted commitment is
        // multiplied by - rho^{i+k} * 1/r *(1/(z-r) - shplonk_batching_challenge * 1/(z+r))
        Fr shifted_scalar =
            gemini_r.invert() * (inverse_vanishing_evals[0] - shplonk_batching_challenge * inverse_vanishing_evals[1]);
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
        for (size_t j = 0; j < num_claims; ++j) {
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
        auto a_0_pos = compute_eval_pos(batched_evaluation, multivariate_challenge, r_squares, gemini_evaluations);
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
    static Fr compute_eval_pos(const Fr batched_evaluation,
                               std::span<const Fr> multivariate_challenge,
                               std::span<const Fr> r_squares,
                               std::span<const Fr> fold_polynomial_evals)
    {
        const size_t num_variables = multivariate_challenge.size();

        const auto& evals = fold_polynomial_evals;
        // initialize A_{d}(r^{2^d})
        Fr eval_pos = batched_evaluation;
        // solve the sequence of linear equations to compute A_0(r)
        for (size_t l = num_variables; l != 0; --l) {
            const Fr r = r_squares[l - 1];              // = rₗ₋₁ = r^{2ˡ⁻¹}
            const Fr eval_neg = evals[l - 1];           // = Aₗ₋₁(−r^{2ˡ⁻¹})
            const Fr u = multivariate_challenge[l - 1]; // = uₗ₋₁
            eval_pos = ((r * eval_pos * 2) - eval_neg * (r * (Fr(1) - u) - u)) / (r * (Fr(1) - u) + u);
        }
        return eval_pos; // return A₀(r)
    }

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