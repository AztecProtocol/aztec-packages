// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
    static Polynomial compute_batched_quotient(const size_t virtual_log_n,
                                               std::span<const ProverOpeningClaim<Curve>> opening_claims,
                                               const Fr& nu,
                                               std::span<Fr> gemini_fold_pos_evaluations,
                                               std::span<const ProverOpeningClaim<Curve>> libra_opening_claims,
                                               std::span<const ProverOpeningClaim<Curve>> sumcheck_round_claims)
    {
        // Find the maximum polynomial size among all claims to determine the dyadic size of the batched polynomial.
        size_t max_poly_size{ 0 };

        for (const auto& claim_set : { opening_claims, libra_opening_claims, sumcheck_round_claims }) {
            for (const auto& claim : claim_set) {
                max_poly_size = std::max(max_poly_size, claim.polynomial.size());
            }
        }
        // The polynomials in Sumcheck Round claims and Libra opening claims are generally not dyadic,
        // so we round up to the next power of 2.
        max_poly_size = numeric::round_up_power_2(max_poly_size);

        // Q(X) = ∑ⱼ νʲ ⋅ ( fⱼ(X) − vⱼ) / ( X − xⱼ )
        Polynomial Q(max_poly_size);
        Polynomial tmp(max_poly_size);

        Fr current_nu = Fr::one();

        size_t fold_idx = 0;
        for (const auto& claim : opening_claims) {

            // Gemini Fold Polynomials have to be opened at -r^{2^j} and r^{2^j}.
            if (claim.gemini_fold) {
                tmp = claim.polynomial;
                tmp.at(0) = tmp[0] - gemini_fold_pos_evaluations[fold_idx++];
                tmp.factor_roots(-claim.opening_pair.challenge);
                // Add the claim quotient to the batched quotient polynomial
                Q.add_scaled(tmp, current_nu);
                current_nu *= nu;
            }

            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
            tmp.factor_roots(claim.opening_pair.challenge);
            // Add the claim quotient to the batched quotient polynomial
            Q.add_scaled(tmp, current_nu);
            current_nu *= nu;
        }
        // We use the same batching challenge for Gemini and Libra opening claims. The number of the claims
        // batched before adding Libra commitments and evaluations is bounded by 2 * CONST_PROOF_SIZE_LOG_N + 2, where
        // 2 * CONST_PROOF_SIZE_LOG_N is the number of fold claims including the dummy ones, and +2 is reserved for
        // interleaving.
        if (!libra_opening_claims.empty()) {
            current_nu = nu.pow(2 * virtual_log_n + NUM_INTERLEAVING_CLAIMS);
        }

        for (const auto& claim : libra_opening_claims) {
            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            tmp = claim.polynomial;
            tmp.at(0) = tmp[0] - claim.opening_pair.evaluation;
            tmp.factor_roots(claim.opening_pair.challenge);

            // Add the claim quotient to the batched quotient polynomial
            Q.add_scaled(tmp, current_nu);
            current_nu *= nu;
        }

        for (const auto& claim : sumcheck_round_claims) {

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
        const size_t virtual_log_n,
        std::span<ProverOpeningClaim<Curve>> opening_claims,
        Polynomial& batched_quotient_Q,
        const Fr& nu_challenge,
        const Fr& z_challenge,
        std::span<Fr> gemini_fold_pos_evaluations,
        std::span<ProverOpeningClaim<Curve>> libra_opening_claims = {},
        std::span<ProverOpeningClaim<Curve>> sumcheck_opening_claims = {})
    {
        // Our main use case is the opening of Gemini fold polynomials and each Gemini fold is opened at 2 points.
        const size_t num_gemini_opening_claims = 2 * opening_claims.size();
        const size_t num_opening_claims =
            num_gemini_opening_claims + libra_opening_claims.size() + sumcheck_opening_claims.size();

        // {ẑⱼ(z)}ⱼ , where ẑⱼ(r) = 1/zⱼ(z) = 1/(z - xⱼ)
        std::vector<Fr> inverse_vanishing_evals;
        inverse_vanishing_evals.reserve(num_opening_claims);
        for (const auto& claim : opening_claims) {
            if (claim.gemini_fold) {
                inverse_vanishing_evals.emplace_back(z_challenge + claim.opening_pair.challenge);
            }
            inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
        }

        // Add the terms (z - uₖ) for k = 0, …, d−1 where d is the number of rounds in Sumcheck
        for (const auto& claim : libra_opening_claims) {
            inverse_vanishing_evals.emplace_back(z_challenge - claim.opening_pair.challenge);
        }

        for (const auto& claim : sumcheck_opening_claims) {
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

        size_t fold_idx = 0;
        for (auto& claim : opening_claims) {

            if (claim.gemini_fold) {
                tmp = claim.polynomial;
                tmp.at(0) = tmp[0] - gemini_fold_pos_evaluations[fold_idx++];
                Fr scaling_factor = current_nu * inverse_vanishing_evals[idx++]; // = νʲ / (z − xⱼ )
                // G -= νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ )
                G.add_scaled(tmp, -scaling_factor);

                current_nu *= nu_challenge;
            }
            // tmp = νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ )
            claim.polynomial.at(0) = claim.polynomial[0] - claim.opening_pair.evaluation;
            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx++]; // = νʲ / (z − xⱼ )

            // G -= νʲ ⋅ ( fⱼ(X) − vⱼ) / ( z − xⱼ )
            G.add_scaled(claim.polynomial, -scaling_factor);

            current_nu *= nu_challenge;
        }

        // Take into account the constant proof size in Gemini
        if (!libra_opening_claims.empty()) {
            current_nu = nu_challenge.pow(2 * virtual_log_n + NUM_INTERLEAVING_CLAIMS);
        }

        for (auto& claim : libra_opening_claims) {
            // Compute individual claim quotient tmp = ( fⱼ(X) − vⱼ) / ( X − xⱼ )
            claim.polynomial.at(0) = claim.polynomial[0] - claim.opening_pair.evaluation;
            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx++]; // = νʲ / (z − xⱼ )

            // Add the claim quotient to the batched quotient polynomial
            G.add_scaled(claim.polynomial, -scaling_factor);
            current_nu *= nu_challenge;
        }

        for (auto& claim : sumcheck_opening_claims) {
            claim.polynomial.at(0) = claim.polynomial[0] - claim.opening_pair.evaluation;
            Fr scaling_factor = current_nu * inverse_vanishing_evals[idx++]; // = νʲ / (z − xⱼ )

            // Add the claim quotient to the batched quotient polynomial
            G.add_scaled(claim.polynomial, -scaling_factor);
            current_nu *= nu_challenge;
        }
        // Return opening pair (z, 0) and polynomial G(X) = Q(X) - Q_z(X)
        return { .polynomial = G, .opening_pair = { .challenge = z_challenge, .evaluation = Fr::zero() } };
    };
    /**
     * @brief Compute evaluations of fold polynomials Fold_i at r^{2^i} for i>0.
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1223): Reconsider minor performance/memory
     * optimizations in Gemini.
     * @param opening_claims
     * @return std::vector<Fr>
     */
    static std::vector<Fr> compute_gemini_fold_pos_evaluations(
        std::span<const ProverOpeningClaim<Curve>> opening_claims)
    {
        std::vector<Fr> gemini_fold_pos_evaluations;
        gemini_fold_pos_evaluations.reserve(opening_claims.size());

        for (const auto& claim : opening_claims) {
            if (claim.gemini_fold) {
                // -r^{2^i} is stored in the claim
                const Fr evaluation_point = -claim.opening_pair.challenge;
                // Compute Fold_i(r^{2^i})
                const Fr evaluation = claim.polynomial.evaluate(evaluation_point);
                gemini_fold_pos_evaluations.emplace_back(evaluation);
            }
        }
        return gemini_fold_pos_evaluations;
    }

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
    static ProverOpeningClaim<Curve> prove(const CommitmentKey<Curve>& commitment_key,
                                           std::span<ProverOpeningClaim<Curve>> opening_claims,
                                           const std::shared_ptr<Transcript>& transcript,
                                           std::span<ProverOpeningClaim<Curve>> libra_opening_claims = {},
                                           std::span<ProverOpeningClaim<Curve>> sumcheck_round_claims = {},
                                           const size_t virtual_log_n = 0)
    {
        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");

        // Compute the evaluations Fold_i(r^{2^i}) for i>0.
        std::vector<Fr> gemini_fold_pos_evaluations = compute_gemini_fold_pos_evaluations(opening_claims);

        auto batched_quotient = compute_batched_quotient(virtual_log_n,
                                                         opening_claims,
                                                         nu,
                                                         gemini_fold_pos_evaluations,
                                                         libra_opening_claims,
                                                         sumcheck_round_claims);
        auto batched_quotient_commitment = commitment_key.commit(batched_quotient);
        transcript->send_to_verifier("Shplonk:Q", batched_quotient_commitment);
        const Fr z = transcript->template get_challenge<Fr>("Shplonk:z");

        return compute_partially_evaluated_batched_quotient(virtual_log_n,
                                                            opening_claims,
                                                            batched_quotient,
                                                            nu,
                                                            z,
                                                            gemini_fold_pos_evaluations,
                                                            libra_opening_claims,
                                                            sumcheck_round_claims);
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

    // Random challenge to batch the polynomials f_1, \dots, f_n
    Fr nu;
    Fr current_nu;
    // Commitment to quotient polynomial \sum_i \nu^{i-1} f_i / (x - x_i)
    Commitment quotient;
    // Partial evaluation challenge
    Fr z_challenge;
    // Commitments to f_1, \dots, f_n
    std::vector<Commitment> commitments;
    // Scalar coefficients of \cm(f_1), \dots, \cm(f_n) in the MSM needed to compute the commitment to the partially
    // evaluated quotient
    std::vector<Fr> scalars;
    // Coefficient of the identity in partially evaluated quotient
    Fr identity_scalar_coefficient = Fr(0);
    // Target evaluation
    Fr evaluation = Fr(0);

  public:
    template <typename Transcript>
    ShplonkVerifier_(std::vector<Commitment>& polynomial_commitments, std::shared_ptr<Transcript>& transcript)
        : nu(transcript->template get_challenge<Fr>("Shplonk:nu"))
        , quotient(transcript->template receive_from_prover<Commitment>("Shplonk:Q"))
        , z_challenge(transcript->template get_challenge<Fr>("Shplonk:z"))
        , commitments({ quotient })
    {
        commitments.insert(commitments.end(), polynomial_commitments.begin(), polynomial_commitments.end());
        if constexpr (Curve::is_stdlib_type) {
            auto builder = nu.get_context();
            current_nu = Fr(1);                                           // Circuit constant
            scalars = { Fr(1) };                                          // Circuit constant
            scalars.insert(scalars.end(), commitments.size() - 1, Fr(0)); // Initialised as circuit constants
            evaluation.convert_constant_to_fixed_witness(builder);
        } else {
            current_nu = Fr(1);
            scalars = { Fr(1) };
            scalars.insert(scalars.end(), commitments.size() - 1, Fr(0));
        }
    }

    /**
     * @brief Update the internal state of the Shponk verifier
     *
     * @details Given a list of indices = (i_1, \dots, i_k), a list of coefficients = (a_1, \dots, a_k), an evaluation
     * challenge = x, and a series of evaluations = (v_1, \dots, v_k), update the internal state of the Shplonk
     * verifier so to add the check \sum_{j=1}^k a_j f_{i_j}(x) = \sum_{j=1}^k a_j v_j. This amounts to update:
     *  - scalars[i_j] -= current_nu * a_j / (z - x)
     *  - identity_scalar_coefficient += \sum_{j=1}^k current_nu * a_j * v_j / (z - x)
     *
     * @param indices
     * @param coefficients
     * @param evaluation_challenge
     * @param evaluations
     */
    void update(const std::vector<size_t>& indices,
                const std::vector<Fr>& coefficients,
                const std::vector<Fr>& evaluations,
                const Fr& evaluation_challenge,
                const std::optional<Fr>& precomputed_inverse_vanishing_eval = std::nullopt)
    {
        // Compute 1 / (z - x)
        Fr inverse_vanishing_eval = precomputed_inverse_vanishing_eval.has_value()
                                        ? precomputed_inverse_vanishing_eval.value()
                                        : (z_challenge - evaluation_challenge).invert();

        // Compute \nu^{i-1} / (z - x)
        auto scalar_factor = current_nu * inverse_vanishing_eval;

        for (const auto& [index, coefficient, evaluation] : zip_view(indices, coefficients, evaluations)) {
            // \nu^{i-1} * j / (z - x)
            auto scaling_factor = scalar_factor * coefficient;
            // scalars[i_j] = \nu^{i-1} * a_j / (z - x)
            scalars[index + 1] -= scaling_factor;
            // identity_scalar_coefficient += \nu^{i-1} * a_j * v_j / (z - x)
            identity_scalar_coefficient += scaling_factor * evaluation;
        }

        // Update current_nu
        current_nu *= nu;
    }

    /**
     * @brief Finalize the Shplonk verification and return the KZG opening claim
     *
     * @details Compute the commitment:
     *      [quotient] - \sum_i scalars[i] * commitments[i] + identity_scalar_coefficient * [1]
     * @param g1_identity
     * @return OpeningClaim<Curve>
     */
    OpeningClaim<Curve> finalize(const Commitment& g1_identity)
    {
        commitments.emplace_back(g1_identity);
        scalars.emplace_back(identity_scalar_coefficient);
        GroupElement result;
        if constexpr (Curve::is_stdlib_type) {
            result = GroupElement::batch_mul(commitments, scalars);
        } else {
            result = GroupElement::zero();
            for (const auto& [commitment, scalar] : zip_view(commitments, scalars)) {
                result += commitment * scalar;
            }
        }

        return { { z_challenge, evaluation }, result };
    }

    /**
     * @brief Export the state of the Shplonk verifier
     *
     * @details Append g1_identity to the commitments, identity_scalar_factor to scalars, and export the resulting
     * vectors. This method is useful when we perform KZG verification of the Shplonk claim right after Shplonk (because
     * we can add the last commitment [W] and scalar factor (0 in this case) to the list and then execute a single batch
     * mul.
     *
     * @param g1_identity
     * @return BatchOpeningClaim<Curve>
     */
    BatchOpeningClaim<Curve> export_state(const Commitment& g1_identity)
    {
        auto exported_commitments = commitments;
        exported_commitments.emplace_back(g1_identity);
        auto exported_scalars = scalars;
        exported_scalars.emplace_back(identity_scalar_coefficient);

        return { exported_commitments, exported_scalars, z_challenge };
    }

    /**
     * @brief Instantiate a Shplonk verifier and updates its state with the provided claims.
     *
     * @param g1_identity the identity element for the Curve
     * @param claims list of opening claims (Cⱼ, xⱼ, vⱼ) for a witness polynomial fⱼ(X), s.t. fⱼ(xⱼ) = vⱼ.
     * @param transcript
     */
    template <typename Transcript>
    static ShplonkVerifier_<Curve> reduce_verification_no_finalize(std::span<const OpeningClaim<Curve>> claims,
                                                                   std::shared_ptr<Transcript>& transcript)
    {
        const size_t num_claims = claims.size();
        std::vector<Commitment> polynomial_commiments;
        polynomial_commiments.reserve(num_claims);
        for (const auto& claim : claims) {
            polynomial_commiments.emplace_back(claim.commitment);
        }
        ShplonkVerifier_<Curve> verifier(polynomial_commiments, transcript);

        if constexpr (Curve::is_stdlib_type) {
            for (size_t idx = 0; idx < claims.size(); idx++) {
                verifier.update(
                    { idx }, { Fr(1) }, { claims[idx].opening_pair.evaluation }, claims[idx].opening_pair.challenge);
            }
        } else {
            std::vector<Fr> inverse_vanishing_evals;
            inverse_vanishing_evals.reserve(num_claims);
            for (const auto& claim : claims) {
                inverse_vanishing_evals.emplace_back(verifier.z_challenge - claim.opening_pair.challenge);
            }
            Fr::batch_invert(inverse_vanishing_evals);
            for (size_t idx = 0; idx < claims.size(); idx++) {
                verifier.update({ idx },
                                { Fr(1) },
                                { claims[idx].opening_pair.evaluation },
                                claims[idx].opening_pair.challenge,
                                inverse_vanishing_evals[idx]);
            }
        }

        return verifier;
    };

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
        auto verifier = ShplonkVerifier_::reduce_verification_no_finalize(claims, transcript);
        return verifier.finalize(g1_identity);
    };

    /**
     * @brief Computes \f$ \frac{1}{z - r}, \frac{1}{z + r}, \ldots, \frac{1}{z - r^{2^{d-1}}}, \frac{1}{z +
     * r^{2^{d-1}}} \f$.
     *
     * @param shplonk_eval_challenge \f$ z \f$
     * @param gemini_eval_challenge_powers \f$ (r , r^2, \ldots, r^{2^{d-1}}) \f$
     * @return \f[ \left( \frac{1}{z - r}, \frac{1}{z + r},  \ldots, \frac{1}{z - r^{2^{d-1}}}, \frac{1}{z +
     * r^{2^{d-1}}} \right) \f]
     */
    static std::vector<Fr> compute_inverted_gemini_denominators(const Fr& shplonk_eval_challenge,
                                                                const std::vector<Fr>& gemini_eval_challenge_powers)
    {
        std::vector<Fr> denominators;
        const size_t virtual_log_n = gemini_eval_challenge_powers.size();
        const size_t num_gemini_claims = 2 * virtual_log_n;
        denominators.reserve(num_gemini_claims);

        for (const auto& gemini_eval_challenge_power : gemini_eval_challenge_powers) {
            // Place 1/(z - r ^ {2^j})
            denominators.emplace_back(shplonk_eval_challenge - gemini_eval_challenge_power);
            // Place 1/(z + r ^ {2^j})
            denominators.emplace_back(shplonk_eval_challenge + gemini_eval_challenge_power);
        }

        if constexpr (!Curve::is_stdlib_type) {
            Fr::batch_invert(denominators);
        } else {
            for (auto& denominator : denominators) {
                denominator = denominator.invert();
            }
        }
        return denominators;
    }
};

/**
 * @brief A helper used by Shplemini Verifier. Precomputes a vector of the powers of \f$ \nu \f$ needed to batch all
 * univariate claims.
 *
 */
template <typename Fr>
static std::vector<Fr> compute_shplonk_batching_challenge_powers(const Fr& shplonk_batching_challenge,
                                                                 const size_t virtual_log_n,
                                                                 bool has_zk = false,
                                                                 bool committed_sumcheck = false)
{
    // Minimum size of `denominators`
    size_t num_powers = 2 * virtual_log_n + NUM_INTERLEAVING_CLAIMS;
    // Each round univariate is opened at 0, 1, and a round challenge.
    static constexpr size_t NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND = 3;

    // Shplonk evaluation and batching challenges are re-used in SmallSubgroupIPA.
    if (has_zk) {
        num_powers += NUM_SMALL_IPA_EVALUATIONS;
    }

    // Commited sumcheck adds 3 claims per round.
    if (committed_sumcheck) {
        num_powers += NUM_COMMITTED_SUMCHECK_CLAIMS_PER_ROUND * virtual_log_n;
    }

    std::vector<Fr> result;
    result.reserve(num_powers);
    result.emplace_back(Fr{ 1 });
    for (size_t idx = 1; idx < num_powers; idx++) {
        result.emplace_back(result[idx - 1] * shplonk_batching_challenge);
    }
    return result;
}
} // namespace bb
