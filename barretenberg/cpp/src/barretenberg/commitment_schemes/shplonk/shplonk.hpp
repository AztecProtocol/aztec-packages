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
        std::vector<OpeningClaims<Curve>> claims_;
        claims_.reserve(claims.size());
        for (auto& claim : claims) {
            claims_.emplace_back(OpeningClaims<Curve>({ claim.opening_pair }, claim.commitment));
        }

        return reduce_verification_multiple_claims_same_polynomial(g1_identity, std::span(claims_), transcript);
    };

    /**
     * @brief Recomputes the new claim commitment [G] given the proof and
     * the challenge r. No verification happens so this function always succeeds.
     *
     *
     * @details This function operates on a list of `OpeningClaims`. Each claim in `claims` is a couple
     * (C_j, { (x_{j,i}, v_{j,i}) } ) of a commitment C_j to a polynomial f_j and a list of challenge/evaluation s.t.
     * f_j(x_{j,i}) = v_{j,i}. To save on the number of MSMs computed, the verifier batches together the coefficients
     * corresponding to C_j for the various evaluations. Namely, instead of computing a batch mul with
     * batch_mul(
     *          commitments = {C_j, C_j, C_j, ..}, scalars = {1 / (z - x_{j,1}), \nu 1 / (z - x_{j,2}), ...}
     * )
     * we compute scalar = \sum_i \nu^(i-1) 1 / (z - x_{j,i}) and scalar * commitment.
     *
     *
     * @param g1_identity the identity element for the Curve
     * @param claims list of opening claims (C_j, { (x_{j,i}, v_{j,i}) } ) for a witness polynomial f_j(X), s.t.
     * f_j(x_{j,i}) = v_{j,i}.
     * @param transcript
     * @return OpeningClaim
     */
    template <typename Transcript>
    static OpeningClaim<Curve> reduce_verification_multiple_claims_same_polynomial(
        Commitment g1_identity, std::span<const OpeningClaims<Curve>> claims, std::shared_ptr<Transcript>& transcript)
    {

        const size_t num_claims = claims.size();
        size_t total_claims = 0;
        for (auto& opening_claims : claims) {
            total_claims += opening_claims.size();
        }

        const Fr nu = transcript->template get_challenge<Fr>("Shplonk:nu");

        auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");

        const Fr z_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // [G] = [Q] - \sum_j \sum_i ν^{k} / (z − x_{i,j} ) [f_j] + G₀ [1]
        //     = [Q] - [\sum_j \sum_i ν^{k} (f_j(X) − v_{j,i}) / (z − x_{j,i})]
        // k here is a running index depending on how many commitments we have already aggregated
        GroupElement G_commitment;

        // compute simulated commitment to [G] as a linear combination of
        // [Q], { [f_j] }, [1]:
        // [G] = [Q] - \sum_j \sum_i ν^{k} / (z − x_{j,i}) [f_j] + (\sum_j \sum_i ν^{k} v_{j,i} / (z − x_{j,i}))[1]
        //     = [Q] - \sum_j \sum_i ν^{k} / (z − x_{j,i}) [f_j] +                                           G₀ [1]
        // G₀ = \sum_j \sum_i ν^{k} ⋅ v_{j,i} / (z − x_{j,i})
        Fr G_commitment_constant(0);

        Fr evaluation(0);

        // Container for { 1 / (z − x_{j,i}) }_{j,i}
        std::vector<Fr> inverse_vanishing_evals;
        inverse_vanishing_evals.reserve(total_claims);

        // TODO(#673): The recursive and non-recursive (native) logic is completely separated via the following
        // conditional. Much of the logic could be shared, but I've chosen to do it this way since soon the "else"
        // branch should be removed in its entirety, and "native" verification will utilize the recursive code paths
        // using a builder Simulator.
        if constexpr (Curve::is_stdlib_type) {
            auto builder = nu.get_context();

            // Containers for the inputs to the final batch mul
            std::vector<Commitment> commitments;
            std::vector<Fr> scalars;

            // [G] = [Q] - \sum_j \sum_i (1 / (z − x_{j,i})) [f_j] + G₀ [1]
            //     = [Q] - [\sum_j \sum_i ν^{k} ⋅ (f_j(X) − v_{j,i}) / (z − x_{j,i})]
            commitments.emplace_back(Q_commitment);
            scalars.emplace_back(Fr(builder, 1)); // Fr(1)

            // Compute { 1 / (z − x_{j,i}) }_{j,i}
            for (const auto& opening_claims : claims) {
                // Note: no need for batch inversion; emulated inversion is cheap. (just show known inverse is valid)
                for (const auto& claim : opening_claims.opening_pairs) {
                    inverse_vanishing_evals.emplace_back((z_challenge - claim.challenge).invert());
                }
            }

            auto current_nu = Fr(1);
            size_t idx_inverses = 0;
            // Note: commitments and scalars vectors used only in recursion setting for batch mul
            for (size_t j = 0; j < num_claims; ++j) {
                // (C_j, { (x_{j,i}, v_{j,i}) })
                const auto& [opening_pairs, commitment] = claims[j];

                auto commitment_scaling_factor = Fr(0);
                // For each commitment C_j and challenge/evaluation { (x_{j,i}, v_{j,i}) } we compute
                // - the update to G_commitment_constant: ν^{k} v_{j,i} / (z − x_{j,i})
                // - the update to the scaling factor for C_j: ν^{k} / (z − x_{j,i})
                for (size_t idx = 0; idx < opening_pairs.size(); ++idx) {
                    auto scaling_factor =
                        current_nu * inverse_vanishing_evals[idx_inverses]; // = ν^{k} / (z − x_{j,i} )

                    // G₀ += ν^{k} v_{j,i} / (z − x_{j,i})
                    G_commitment_constant += scaling_factor * opening_pairs[idx].evaluation;

                    // commitment_scaling_factor += ν^{k} / (z − x_{j,i})
                    commitment_scaling_factor += scaling_factor;

                    current_nu *= nu;

                    idx_inverses += 1;
                }

                // Store MSM inputs for batch mul
                commitments.emplace_back(commitment);
                scalars.emplace_back(-commitment_scaling_factor);
            }

            commitments.emplace_back(g1_identity);
            scalars.emplace_back(G_commitment_constant);

            // [G] += G₀⋅[1] = [G] + \sum_j \sum_i ν^{k} v_{j,i} / (z − x_{j,i}) [1]
            G_commitment = GroupElement::batch_mul(commitments, scalars);

            // Set evaluation to constant witness
            evaluation.convert_constant_to_fixed_witness(z_challenge.get_context());
        } else {
            // [G] = [Q] - \sum_j \sum_i (1 / (z − x_{j,i})) [f_j] + G₀ [1]
            //     = [Q] - [\sum_j \sum_i ν^{k} ⋅ (f_j(X) − v_{j,i}) / (z − x_{j,i})]
            G_commitment = Q_commitment;

            // Compute { 1 / (z − x_{j,i}) }_{j,i}
            for (const auto& opening_claims : claims) {
                for (const auto& claim : opening_claims.opening_pairs) {
                    inverse_vanishing_evals.emplace_back(z_challenge - claim.challenge);
                }
            }
            Fr::batch_invert(inverse_vanishing_evals);

            auto current_nu = Fr(1);
            size_t idx_inverses = 0;
            // Note: commitments and scalars vectors used only in recursion setting for batch mul
            for (size_t j = 0; j < num_claims; ++j) {
                // (C_j, { (x_{j,i}, v_{j,i}) })
                const auto& [opening_pairs, commitment] = claims[j];

                Fr scaling_factor = Fr(0);
                for (size_t idx = 0; idx < opening_pairs.size(); idx++) {
                    scaling_factor = current_nu * inverse_vanishing_evals[idx_inverses]; // = ν^{k} / (z − x_{j,i} )

                    // G₀ += ν^{k} v_{j,i} / (z − x_{j,i} )
                    G_commitment_constant += scaling_factor * opening_pairs[idx].evaluation;

                    // [G] -= ν^{k} / (z − x_{j,i} ) [f_j]
                    G_commitment -= commitment * scaling_factor;

                    current_nu *= nu;

                    idx_inverses += 1;
                }
            }

            // [G] += G₀⋅[1] = [G] + \sum_j \sum_i ν^{k} v_{j,i} / (z − x_{j,i}) [1]
            G_commitment += g1_identity * G_commitment_constant;
        }

        // Return opening pair (z, 0) and commitment [G]
        return { { z_challenge, evaluation }, G_commitment };
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
