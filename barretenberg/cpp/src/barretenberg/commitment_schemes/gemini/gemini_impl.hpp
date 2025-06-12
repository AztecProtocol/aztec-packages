// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
    PolynomialBatcher& polynomial_batcher,
    std::span<Fr> multilinear_challenge,
    CommitmentKey<Curve>& commitment_key,
    const std::shared_ptr<Transcript>& transcript,
    bool has_zk)
{
    // To achieve fixed proof size in Ultra and Mega, the multilinear opening challenge is be padded to a fixed size.
    const size_t virtual_log_n = multilinear_challenge.size();
    const size_t log_n = numeric::get_msb(static_cast<uint32_t>(circuit_size));
    const size_t n = 1 << log_n;

    // To achieve ZK, we mask the batched polynomial by a random polynomial of the same size
    if (has_zk) {
        Polynomial random_polynomial = Polynomial::random(n);
        transcript->send_to_verifier("Gemini:masking_poly_comm", commitment_key.commit(random_polynomial));
        // In the provers, the size of multilinear_challenge is `virtual_log_n`, but we need to evaluate the
        // hiding polynomial as multilinear in log_n variables
        transcript->send_to_verifier("Gemini:masking_poly_eval",
                                     random_polynomial.evaluate_mle(multilinear_challenge.subspan(0, log_n)));
        // Initialize batched unshifted poly with the random masking poly so that the full batched poly is masked
        polynomial_batcher.set_random_polynomial(std::move(random_polynomial));
    }

    // Get the batching challenge
    const Fr rho = transcript->template get_challenge<Fr>("rho");

    Fr running_scalar = has_zk ? rho : 1; // ρ⁰ is used to batch the hiding polynomial

    Polynomial A_0 = polynomial_batcher.compute_batched(rho, running_scalar);

    // Construct the d-1 Gemini foldings of A₀(X)
    std::vector<Polynomial> fold_polynomials = compute_fold_polynomials(log_n, multilinear_challenge, A_0);

    // If virtual_log_n >= log_n, pad the fold commitments with dummy group elements [1]_1.
    for (size_t l = 0; l < virtual_log_n - 1; l++) {
        std::string label = "Gemini:FOLD_" + std::to_string(l + 1);
        if (l < log_n - 1) {
            transcript->send_to_verifier(label, commitment_key.commit(fold_polynomials[l]));
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

    // Compute polynomials A₀₊(X) = F(X) + G(X)/r and A₀₋(X) = F(X) - G(X)/r
    auto [A_0_pos, A_0_neg] = polynomial_batcher.compute_partially_evaluated_batch_polynomials(r_challenge);
    // Construct claims for the d + 1 univariate evaluations A₀₊(r), A₀₋(-r), and Foldₗ(−r^{2ˡ}), l = 1, ..., d-1
    std::vector<Claim> claims = construct_univariate_opening_claims(
        log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), r_challenge);

    // If virtual_log_n >= log_n, pad the negative fold evaluations with zeroes.
    for (size_t l = 1; l <= virtual_log_n; l++) {
        std::string label = "Gemini:a_" + std::to_string(l);
        if (l <= log_n) {
            transcript->send_to_verifier(label, claims[l].opening_pair.evaluation);
        } else {
            transcript->send_to_verifier(label, Fr::zero());
        }
    }

    // If running Gemini for the Translator VM polynomials, A₀(r) = A₀₊(r) + P₊(rˢ) and A₀(-r) = A₀₋(-r) + P₋(rˢ)
    // where s is the size of the interleaved group assumed even. The prover sends P₊(rˢ) and P₋(rˢ) to the verifier
    // so it can reconstruct the evaluation of A₀(r) and A₀(-r) respectively
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1282)
    if (polynomial_batcher.has_interleaved()) {
        auto [P_pos, P_neg] = polynomial_batcher.compute_partially_evaluated_interleaved_polynomial(r_challenge);
        Fr r_pow = r_challenge.pow(polynomial_batcher.get_group_size());
        Fr P_pos_eval = P_pos.evaluate(r_pow);
        Fr P_neg_eval = P_neg.evaluate(r_pow);
        claims.emplace_back(Claim{ std::move(P_pos), { r_pow, P_pos_eval } });
        transcript->send_to_verifier("Gemini:P_pos", P_pos_eval);
        claims.emplace_back(Claim{ std::move(P_neg), { r_pow, P_neg_eval } });
        transcript->send_to_verifier("Gemini:P_neg", P_neg_eval);
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
    claims.emplace_back(Claim{ std::move(A_0_pos), { r_challenge, a_0_pos } });
    // Compute evaluation of partially evaluated batch polynomial (negative) A₀₋(-r)
    Fr a_0_neg = A_0_neg.evaluate(-r_challenge);
    claims.emplace_back(Claim{ std::move(A_0_neg), { -r_challenge, a_0_neg } });

    // Compute univariate opening queries rₗ = r^{2ˡ} for l = 0, 1, ..., m-1
    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(r_challenge, log_n);

    // Each fold polynomial Aₗ has to be opened at −r^{2ˡ} and r^{2ˡ}. To avoid storing two copies of Aₗ for l = 1,...,
    // m-1, we use a flag that is processed by ShplonkProver.
    const bool gemini_fold = true;

    // Compute the remaining m opening pairs {−r^{2ˡ}, Aₗ(−r^{2ˡ})}, l = 1, ..., m-1.
    for (size_t l = 0; l < log_n - 1; ++l) {
        Fr evaluation = fold_polynomials[l].evaluate(-r_squares[l + 1]);
        claims.emplace_back(Claim{ std::move(fold_polynomials[l]), { -r_squares[l + 1], evaluation }, gemini_fold });
    }

    return claims;
};

} // namespace bb
