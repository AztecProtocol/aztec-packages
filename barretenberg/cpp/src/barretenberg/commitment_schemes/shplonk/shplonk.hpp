#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
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
     * @brief Compute batched quotient polynomial Q(X) = ∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
     *
     * @param opening_claims list of prover opening claims {fⱼ(X), (xⱼ, vⱼ)} for a witness polynomial fⱼ(X), s.t. fⱼ(xⱼ)
     * = vⱼ.
     * @param nu batching challenge
     * @return Polynomial Q(X)
     */
    static Polynomial compute_batched_quotient(std::span<const ProverOpeningClaim<Curve>> opening_claims,
                                               const Fr& nu,
                                               std::span<const ProverOpeningClaim<Curve>> libra_opening_claims)
    {
        // Find n, the maximum size of all polynomials fⱼ(X)
        size_t max_poly_size{ 87 * 2 + 2 };
        for (const auto& claim : opening_claims) {
            max_poly_size = std::max(max_poly_size, claim.polynomial.size());
        }

        // Q(X) = ∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
        Polynomial Q(max_poly_size);
        Polynomial tmp(max_poly_size);

        Fr current_nu = Fr::one();
        for (const auto& claim : opening_claims) {
            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
            tmp.factor_roots(claim.opening_pair.challenge);
            // Add the claim quotient to the batched quotient polynomial
            Q.add_scaled(tmp, current_nu);
            current_nu *= nu;
        }

        // We use the same batching challenge for Gemini and Libra opening claims. The number of the claims
        // batched before adding Libra commitments and evaluations is bounded by CONST_PROOF_SIZE_LOG_N+2
        for (size_t idx = opening_claims.size(); idx < CONST_PROOF_SIZE_LOG_N + 2; idx++) {
            current_nu *= nu;
        };

        for (const auto& claim : libra_opening_claims) {
            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
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
     * @param batched_quotient_Q Q(X) = ∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
     * @param nu_challenge
     * @param z_challenge
     * @return Output{OpeningPair, Polynomial}
     */
    static ProverOpeningClaim<Curve> compute_partially_evaluated_batched_quotient(
        std::span<const ProverOpeningClaim<Curve>> opening_claims,
        Polynomial& batched_quotient_Q,
        const Fr& nu_challenge,
        const Fr& z_challenge,
        std::span<const ProverOpeningClaim<Curve>> libra_opening_claims = {})
    {
        const size_t num_opening_claims = opening_claims.size();

        // {ẑⱼ(z)}ⱼ , where ẑⱼ(r) = 1/zⱼ(z) = 1/(z - xⱼ)
        std::vector<Fr> inverse_vanishing_evals;
        inverse_vanishing_evals.reserve(num_opening_claims);
        for (const auto& claim : opening_claims) {
            inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
        }

        // Add the terms (z - uₖ) for k = 0, …, d−1 where d is the number of rounds in Sumcheck
        for (const auto& claim : libra_opening_claims) {
            inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
        }
        Fr::batch_invert(inverse_vanishing_evals);

        // G(X) = Q(X) - Q_z(X) = Q(X) - ∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ ),
        // s.t. G(r) = 0
        Polynomial G(std::move(batched_quotient_Q)); // G(X) = Q(X)

        // G₀ = ∑ⱼ νʲ ⋅ vⱼ / ( z − xⱼ )
        Fr current_nu = Fr::one();
        Polynomial tmp(G.size());
        size_t idx = 0;

        for (const auto& claim : opening_claims) {
            // tmp = νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx]; // = νʲ / (z − xⱼ )

            // G -= νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ )
            G.add_scaled(tmp, -scaling_factor);

            current_nu *= nu_challenge;
            idx++;
        }

        // Take into account the constant proof size in Gemini
        for (size_t idx = opening_claims.size(); idx < CONST_PROOF_SIZE_LOG_N + 2; idx++) {
            current_nu *= nu_challenge;
        };

        for (const auto& claim : libra_opening_claims) {
            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
            info("prover denom", inverse_vanishing_evals[idx]);

            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx]; // = νʲ / (z − xⱼ )
            info("current nu ", current_nu);

            // Add the claim quotient to the batched quotient polynomial
            G.add_scaled(tmp, -scaling_factor);
            idx++;
            current_nu *= nu_challenge;
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
    template <typename Transcript>
    static ProverOpeningClaim<Curve> prove(const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
                                           std::span<const ProverOpeningClaim<Curve>> opening_claims,
                                           const std::shared_ptr<Transcript>& transcript,
                                           std::span<const ProverOpeningClaim<Curve>> libra_opening_claims = {})
    {
        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");
        info("prover nu ", nu);
        auto batched_quotient = compute_batched_quotient(opening_claims, nu, libra_opening_claims);
        auto batched_quotient_commitment = commitment_key->commit(batched_quotient);
        transcript->send_to_verifier("Shplonk:Q", batched_quotient_commitment);
        const Fr z = transcript->template get_challenge<Fr>("Shplonk:z");
        return compute_partially_evaluated_batched_quotient(
            opening_claims, batched_quotient, nu, z, libra_opening_claims);
    }
};

/**
 * @brief Shplonk Verifier
 *
 */
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
    template <typename Transcript>
    static OpeningClaim<Curve> reduce_verification(Commitment g1_identity,
                                                   std::span<const OpeningClaim<Curve>> claims,
                                                   std::shared_ptr<Transcript>& transcript)
    {

        const size_t num_claims = claims.size();

        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");

        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");

        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // [G] = [Q] - ∑ⱼ ρʲ / (z − xⱼ )⋅[fⱼ] + G₀⋅[1]
        //     = [Q] - [∑ⱼ ρʲ ⋅ ( fⱼ(X) − vⱼ) / (z − xⱼ )]
        GroupElement G_commitment;

        // compute simulated commitment to [G] as a linear combination of
        // [Q], { [fⱼ] }, [1]:
        //  [G] = [Q] - ∑ⱼ (1/zⱼ(r))[Bⱼ]  + ( ∑ⱼ (1/zⱼ(r)) Tⱼ(r) )[1]
        //      = [Q] - ∑ⱼ (1/zⱼ(r))[Bⱼ]  +                    G₀ [1]
        // G₀ = ∑ⱼ ρʲ ⋅ vⱼ / (z − xⱼ )
        Fr G_commitment_constant(0);

        Fr evaluation(0);

        // TODO(#673): The recursive and non-recursive (native) logic is completely separated via the following
        // conditional. Much of the logic could be shared, but I've chosen to do it this way since soon the "else"
        // branch should be removed in its entirety, and "native" verification will utilize the recursive code paths
        // using a builder Simulator.
        if constexpr (Curve::is_stdlib_type) {
            auto builder = nu.get_context();

            // Containers for the inputs to the final batch mul
            std::vector<Commitment> commitments;
            std::vector<Fr> scalars;

            // [G] = [Q] - ∑ⱼ νʲ / (z − xⱼ )⋅[fⱼ] + G₀⋅[1]
            //     = [Q] - [∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / (z − xⱼ )]
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

                Fr scaling_factor = current_nu * inverse_vanishing_evals[j]; // = νʲ / (z − xⱼ )

                // G₀ += νʲ / (z − xⱼ ) ⋅ vⱼ
                G_commitment_constant += scaling_factor * opening_pair.evaluation;

                current_nu *= nu;

                // Store MSM inputs for batch mul
                commitments.emplace_back(commitment);
                scalars.emplace_back(-scaling_factor);
            }

            commitments.emplace_back(g1_identity);
            scalars.emplace_back(G_commitment_constant);

            // [G] += G₀⋅[1] = [G] + (∑ⱼ νʲ ⋅ vⱼ / (z − xⱼ ))⋅[1]
            G_commitment = GroupElement::batch_mul(commitments, scalars);

            // Set evaluation to constant witness
            evaluation.convert_constant_to_fixed_witness(z_challenge.get_context());
        } else {
            // [G] = [Q] - ∑ⱼ νʲ / (z − xⱼ )⋅[fⱼ] + G₀⋅[1]
            //     = [Q] - [∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / (z − xⱼ )]
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

                Fr scaling_factor = current_nu * inverse_vanishing_evals[j]; // = νʲ / (z − xⱼ )

                // G₀ += νʲ / (z − xⱼ ) ⋅ vⱼ
                G_commitment_constant += scaling_factor * opening_pair.evaluation;

                // [G] -= νʲ / (z − xⱼ )⋅[fⱼ]
                G_commitment -= commitment * scaling_factor;

                current_nu *= nu;
            }

            // [G] += G₀⋅[1] = [G] + (∑ⱼ νʲ ⋅ vⱼ / (z − xⱼ ))⋅[1]
            G_commitment += g1_identity * G_commitment_constant;
        }

        // Return opening pair (z, 0) and commitment [G]
        return { { z_challenge, evaluation }, G_commitment };
    };
    /**
     * @brief Computes \f$ \frac{1}{z - r}, \frac{1}{z+r}, \ldots, \frac{1}{z+r^{2^{d-1}}} \f$.
     *
     * @param num_gemini_claims \f$ d + 1 \f$ where d = log_circuit_size
     * @param shplonk_eval_challenge \f$ z \f$
     * @param gemini_eval_challenge_powers \f$ (r , r^2, \ldots, r^{2^{d-1}}) \f$
     * @return \f[ \left( \frac{1}{z - r}, \frac{1}{z+r}, \ldots, \frac{1}{z+r^{2^{d-1}}} \right) \f]
     */
    static std::vector<Fr> compute_inverted_gemini_denominators(const size_t num_gemini_claims,
                                                                const Fr& shplonk_eval_challenge,
                                                                const std::vector<Fr>& gemini_eval_challenge_powers)
    {
        std::vector<Fr> inverted_denominators;
        inverted_denominators.reserve(num_gemini_claims);
        inverted_denominators.emplace_back((shplonk_eval_challenge - gemini_eval_challenge_powers[0]).invert());
        for (const auto& gemini_eval_challenge_power : gemini_eval_challenge_powers) {
            Fr round_inverted_denominator = (shplonk_eval_challenge + gemini_eval_challenge_power).invert();
            inverted_denominators.emplace_back(round_inverted_denominator);
        }
        return inverted_denominators;
    }
};
} // namespace bb
