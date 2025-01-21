#pragma once
#include "barretenberg/common/thread.hpp"
#include "gemini.hpp"

/**
 * @brief Protocol for opening several multi-linear polynomials at the same point.
 *
 *
 * m = number of variables
 * n = 2ᵐ
 * u = (u₀,...,uₘ₋₁)
 * f₀, …, fₖ₋₁ = multilinear polynomials,
 * g₀, …, gₕ₋₁ = shifted multilinear polynomial,
 *  Each gⱼ is the left-shift of some f↺ᵢ, and gⱼ points to the same memory location as fᵢ.
 * v₀, …, vₖ₋₁, v↺₀, …, v↺ₕ₋₁ = multilinear evalutions  s.t. fⱼ(u) = vⱼ, and gⱼ(u) = f↺ⱼ(u) = v↺ⱼ
 *
 * We use a challenge ρ to create a random linear combination of all fⱼ,
 * and actually define A₀ = F + G↺, where
 *   F  = ∑ⱼ ρʲ fⱼ
 *   G  = ∑ⱼ ρᵏ⁺ʲ gⱼ,
 *   G↺ = is the shift of G
 * where fⱼ is normal, and gⱼ is shifted.
 * The evaluations are also batched, and
 *   v  = ∑ ρʲ⋅vⱼ + ∑ ρᵏ⁺ʲ⋅v↺ⱼ = F(u) + G↺(u)
 *
 * The prover then creates the folded polynomials A₀, ..., Aₘ₋₁,
 * and opens them at different points, as univariates.
 *
 * We open A₀ as univariate at r and -r.
 * Since A₀ = F + G↺, but the verifier only has commitments to the gⱼs,
 * we need to partially evaluate A₀ at both evaluation points.
 * As univariate, we have
 *  A₀(X) = F(X) + G↺(X) = F(X) + G(X)/X
 * So we define
 *  - A₀₊(X) = F(X) + G(X)/r
 *  - A₀₋(X) = F(X) − G(X)/r
 * So that A₀₊(r) = A₀(r) and A₀₋(-r) = A₀(-r).
 * The verifier is able to computed the simulated commitments to A₀₊(X) and A₀₋(X)
 * since they are linear-combinations of the commitments [fⱼ] and [gⱼ].
 */
namespace bb {
template <typename Curve>
template <typename Transcript>
std::vector<typename GeminiProver_<Curve>::Claim> GeminiProver_<Curve>::prove(
    Fr circuit_size,
    RefSpan<Polynomial> f_polynomials, // unshifted
    RefSpan<Polynomial> g_polynomials, // to-be-shifted
    std::span<Fr> multilinear_challenge,
    const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
    const std::shared_ptr<Transcript>& transcript,
    RefSpan<Polynomial> concatenated_polynomials,
    const std::vector<RefVector<Polynomial>>& groups_to_be_concatenated,
    bool has_zk)
{
    const size_t log_n = numeric::get_msb(static_cast<uint32_t>(circuit_size));
    const size_t n = 1 << log_n;

    const bool has_concatenations = concatenated_polynomials.size() > 0;

    PolynomialBatches polynomial_batches(n);
    polynomial_batches.set_unshifted(f_polynomials);
    polynomial_batches.set_to_be_1_shifted(g_polynomials);

    // To achieve ZK, we mask the batched polynomial by a random polynomial of the same size
    Polynomial random_polynomial;
    if (has_zk) {
        random_polynomial = Polynomial::random(n);
        transcript->send_to_verifier("Gemini:masking_poly_comm", commitment_key->commit(random_polynomial));
        // In the provers, the size of multilinear_challenge is CONST_PROOF_SIZE_LOG_N, but we need to evaluate the
        // hiding polynomial as multilinear in log_n variables
        transcript->send_to_verifier("Gemini:masking_poly_eval",
                                     random_polynomial.evaluate_mle(multilinear_challenge.subspan(0, log_n)));
    }

    // Get the batching challenge
    const Fr rho = transcript->template get_challenge<Fr>("rho");

    Fr rho_challenge = has_zk ? rho : 1; // ρ⁰ is used to batch the hiding polynomial

    Polynomial A_0 = polynomial_batches.compute_batched(rho, rho_challenge);
    if (has_zk) {
        A_0 += random_polynomial;
    }

    size_t num_groups = groups_to_be_concatenated.size();
    size_t num_chunks_per_group = groups_to_be_concatenated.empty() ? 0 : groups_to_be_concatenated[0].size();

    // If needed, allocate space for the groups to be concatenated and for the concatenated polynomials
    Polynomial batched_concatenated;
    std::vector<Polynomial> batched_group;
    if (has_concatenations) {
        batched_concatenated = Polynomial(n);
        for (size_t i = 0; i < num_chunks_per_group; ++i) {
            batched_group.push_back(Polynomial(n));
        }

        for (size_t i = 0; i < num_groups; ++i) {
            batched_concatenated.add_scaled(concatenated_polynomials[i], rho_challenge);
            for (size_t j = 0; j < num_chunks_per_group; ++j) {
                batched_group[j].add_scaled(groups_to_be_concatenated[i][j], rho_challenge);
            }
            rho_challenge *= rho;
        }
        // If proving for translator, add contribution of the batched concatenation polynomials
        A_0 += batched_concatenated;
    }

    // Construct the d-1 Gemini foldings of A₀(X)
    std::vector<Polynomial> fold_polynomials = compute_fold_polynomials(log_n, multilinear_challenge, A_0);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1159): Decouple constants from primitives.
    for (size_t l = 0; l < CONST_PROOF_SIZE_LOG_N - 1; l++) {
        std::string label = "Gemini:FOLD_" + std::to_string(l + 1);
        if (l < log_n - 1) {
            transcript->send_to_verifier(label, commitment_key->commit(fold_polynomials[l]));
        } else {
            transcript->send_to_verifier(label, Commitment::one());
        }
    }
    const Fr r_challenge = transcript->template get_challenge<Fr>("Gemini:r");

    const bool gemini_challenge_in_small_subgroup = (has_zk) && (r_challenge.pow(Curve::SUBGROUP_SIZE) == Fr(1));

    // If Gemini evaluation challenge lands in the multiplicative subgroup used by SmallSubgroupIPA protocol, the
    // evaluations of prover polynomials at this challenge would leak witness data.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1194). Handle edge cases in PCS
    if (gemini_challenge_in_small_subgroup) {
        throw_or_abort("Gemini evaluation challenge is in the SmallSubgroup.");
    }

    if (has_zk) {
        polynomial_batches.batched_unshifted += random_polynomial;
    }

    // Compute polynomials A₀₊(X) = F(X) + G(X)/r and A₀₋(X) = F(X) - G(X)/r
    auto [A_0_pos, A_0_neg] =
        compute_partially_evaluated_batch_polynomials(log_n, polynomial_batches, r_challenge, batched_group);

    // Construct claims for the d + 1 univariate evaluations A₀₊(r), A₀₋(-r), and Foldₗ(−r^{2ˡ}), l = 1, ..., d-1
    std::vector<Claim> claims = construct_univariate_opening_claims(
        log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), r_challenge);

    for (size_t l = 1; l <= CONST_PROOF_SIZE_LOG_N; l++) {
        std::string label = "Gemini:a_" + std::to_string(l);
        if (l <= log_n) {
            transcript->send_to_verifier(label, claims[l].opening_pair.evaluation);
        } else {
            transcript->send_to_verifier(label, Fr::zero());
        }
    }

    return claims;
};

/**
 * @brief Computes d-1 fold polynomials Fold_i, i = 1, ..., d-1
 *
 * @param multilinear_challenge multilinear opening point 'u'
 * @param A_0 = F(X) + G↺(X) = F(X) + G(X)/X
 * @return std::vector<Polynomial>
 */
template <typename Curve>
std::vector<typename GeminiProver_<Curve>::Polynomial> GeminiProver_<Curve>::compute_fold_polynomials(
    const size_t log_n, std::span<const Fr> multilinear_challenge, const Polynomial& A_0)
{
    const size_t num_threads = get_num_cpus_pow2();
    constexpr size_t efficient_operations_per_thread = 64; // A guess of the number of operation for which there
                                                           // would be a point in sending them to a separate thread

    // Reserve and allocate space for m-1 Fold polynomials, the foldings of the full batched polynomial A₀
    std::vector<Polynomial> fold_polynomials;
    fold_polynomials.reserve(log_n - 1);
    for (size_t l = 0; l < log_n - 1; ++l) {
        // size of the previous polynomial/2
        const size_t n_l = 1 << (log_n - l - 1);

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        fold_polynomials.emplace_back(Polynomial(n_l));
    }

    // A_l = Aₗ(X) is the polynomial being folded
    // in the first iteration, we take the batched polynomial
    // in the next iteration, it is the previously folded one
    auto A_l = A_0.data();
    for (size_t l = 0; l < log_n - 1; ++l) {
        // size of the previous polynomial/2
        const size_t n_l = 1 << (log_n - l - 1);

        // Use as many threads as it is useful so that 1 thread doesn't process 1 element, but make sure that there is
        // at least 1
        size_t num_used_threads = std::min(n_l / efficient_operations_per_thread, num_threads);
        num_used_threads = num_used_threads ? num_used_threads : 1;
        size_t chunk_size = n_l / num_used_threads;
        size_t last_chunk_size = (n_l % chunk_size) ? (n_l % num_used_threads) : chunk_size;

        // Opening point is the same for all
        const Fr u_l = multilinear_challenge[l];

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        auto A_l_fold = fold_polynomials[l].data();

        parallel_for(num_used_threads, [&](size_t i) {
            size_t current_chunk_size = (i == (num_used_threads - 1)) ? last_chunk_size : chunk_size;
            for (std::ptrdiff_t j = (std::ptrdiff_t)(i * chunk_size);
                 j < (std::ptrdiff_t)((i * chunk_size) + current_chunk_size);
                 j++) {
                // fold(Aₗ)[j] = (1-uₗ)⋅even(Aₗ)[j] + uₗ⋅odd(Aₗ)[j]
                //            = (1-uₗ)⋅Aₗ[2j]      + uₗ⋅Aₗ[2j+1]
                //            = Aₗ₊₁[j]
                A_l_fold[j] = A_l[j << 1] + u_l * (A_l[(j << 1) + 1] - A_l[j << 1]);
            }
        });
        // set Aₗ₊₁ = Aₗ for the next iteration
        A_l = A_l_fold;
    }

    return fold_polynomials;
};

/**
 * @brief Computes partially evaluated batched polynomials A₀₊(X) = F(X) + G(X)/r and A₀₋(X) = F(X) - G(X)/r
 *
 * @param batched_F F(X) = ∑ⱼ ρʲfⱼ(X)
 * @param batched_G G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X)
 * @param r_challenge
 * @param batched_groups_to_be_concatenated
 * @return {A₀₊(X), A₀₋(X)}
 */
template <typename Curve>
std::pair<typename GeminiProver_<Curve>::Polynomial, typename GeminiProver_<Curve>::Polynomial> GeminiProver_<
    Curve>::compute_partially_evaluated_batch_polynomials(const size_t log_n,
                                                          PolynomialBatches& polynomial_batches,
                                                          const Fr& r_challenge,
                                                          std::vector<Polynomial> batched_groups_to_be_concatenated)
{
    auto [A_0_pos, A_0_neg] = polynomial_batches.compute_partially_evaluated_batch_polynomials(r_challenge);

    // Reconstruct the batched concatenated polynomial from the batched groups, partially evaluated at r and -r and add
    // the result to A₀₊(X) and  A₀₋(X). Explanation (for simplification assume a single concatenated polynomial):
    // Let P be the concatenated polynomial formed from group G = {p₀, p₁, p₂, p₃} then
    // P(x) = p₀(x)+ xˢ p₁(x) + x²ˢ p₂(x) + x³ˢp₃(x) where s is the mini_circuit_size i.e. the number of non-zero values
    // in the polynomials part of G. Then P_r(x) = p₀(x) + rˢ p₁(x) + r²ˢ p₂(x) + r³ˢp₃(x) is the
    // partial evaluation of P(x) at a value r. We follow this technique rather than simply adding the contribution of P
    // to A₀₊(X) an  A₀₋(X) because, on the verifier side, when constructing the commitments [A₀₊] an  [A₀₋], this
    // enables us to reconstruct [P_r] from [p₀], [p₁], [p₂], [p₃], hence removing the need for the prover to commit to
    // P
    if (!batched_groups_to_be_concatenated.empty()) {
        // The "real" size of polynomials in concatenation groups (i.e. the number of non-zero values)
        const size_t mini_circuit_size = (1 << log_n) / batched_groups_to_be_concatenated.size();
        Fr current_r_shift_pos = Fr(1);
        Fr current_r_shift_neg = Fr(1);

        const Fr r_pow_minicircuit = r_challenge.pow(mini_circuit_size);
        const Fr r_neg_pow_minicircuit = (-r_challenge).pow(mini_circuit_size);
        for (size_t i = 0; i < batched_groups_to_be_concatenated.size(); i++) {
            // Reconstruct the batched concationation polynomial partially evaluated at r and -r from the polynomials
            // in the batched concatenation group.
            A_0_pos.add_scaled(batched_groups_to_be_concatenated[i], current_r_shift_pos);
            A_0_neg.add_scaled(batched_groups_to_be_concatenated[i], current_r_shift_neg);
            current_r_shift_pos *= r_pow_minicircuit;
            current_r_shift_neg *= r_neg_pow_minicircuit;
        }
    }

    return { std::move(A_0_pos), std::move(A_0_neg) };
};

/**

 *
 * @param mle_opening_point u = (u₀,...,uₘ₋₁) is the MLE opening point
 * @param fold_polynomials vector of polynomials whose first two elements are F(X) = ∑ⱼ ρʲfⱼ(X)
 * and G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X), and the next d-1 elements are Fold_i, i = 1, ..., d-1.
 * @param r_challenge univariate opening challenge
 */

/**
 * @brief Computes/aggragates d+1 univariate polynomial opening claims of the form {polynomial, (challenge, evaluation)}
 *
 * @details The d+1 evaluations are A₀₊(r), A₀₋(-r), and Aₗ(−r^{2ˡ}) for l = 1, ..., d-1, where the Aₗ are the fold
 * polynomials.
 *
 * @param A_0_pos A₀₊
 * @param A_0_neg A₀₋
 * @param fold_polynomials Aₗ, l = 1, ..., d-1
 * @param r_challenge
 * @return std::vector<typename GeminiProver_<Curve>::Claim> d+1 univariate opening claims
 */
template <typename Curve>
std::vector<typename GeminiProver_<Curve>::Claim> GeminiProver_<Curve>::construct_univariate_opening_claims(
    const size_t log_n,
    Polynomial&& A_0_pos,
    Polynomial&& A_0_neg,
    std::vector<Polynomial>&& fold_polynomials,
    const Fr& r_challenge)
{
    std::vector<Claim> claims;

    // Compute evaluation of partially evaluated batch polynomial (positive) A₀₊(r)
    Fr a_0_pos = A_0_pos.evaluate(r_challenge);
    claims.emplace_back(Claim{ A_0_pos, { r_challenge, a_0_pos } });
    // Compute evaluation of partially evaluated batch polynomial (negative) A₀₋(-r)
    Fr a_0_neg = A_0_neg.evaluate(-r_challenge);
    claims.emplace_back(Claim{ A_0_neg, { -r_challenge, a_0_neg } });

    // Compute univariate opening queries rₗ = r^{2ˡ} for l = 0, 1, ..., m-1
    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(r_challenge, log_n);

    // Compute the remaining m opening pairs {−r^{2ˡ}, Aₗ(−r^{2ˡ})}, l = 1, ..., m-1.
    for (size_t l = 0; l < log_n - 1; ++l) {
        Fr evaluation = fold_polynomials[l].evaluate(-r_squares[l + 1]);
        claims.emplace_back(Claim{ fold_polynomials[l], { -r_squares[l + 1], evaluation } });
    }

    return claims;
};

} // namespace bb
