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
    size_t log_n = numeric::get_msb(static_cast<uint32_t>(circuit_size));
    size_t n = 1 << log_n;

    // Compute batched polynomials
    Polynomial batched_unshifted(n);
    Polynomial batched_to_be_shifted = Polynomial::shiftable(n);

    // To achieve ZK, we mask the batched polynomial by a random polynomial of the same size
    if (has_zk) {
        batched_unshifted = Polynomial::random(n);
        transcript->send_to_verifier("Gemini:masking_poly_comm", commitment_key->commit(batched_unshifted));
        // In the provers, the size of multilinear_challenge is CONST_PROOF_SIZE_LOG_N, but we need to evaluate the
        // hiding polynomial as multilinear in log_n variables
        std::vector<Fr> multilinear_challenge_resized(multilinear_challenge.begin(), multilinear_challenge.end());
        multilinear_challenge_resized.resize(log_n);
        transcript->send_to_verifier("Gemini:masking_poly_eval",
                                     batched_unshifted.evaluate_mle(multilinear_challenge_resized));
    }

    // Get the batching challenge
    const Fr rho = transcript->template get_challenge<Fr>("rho");

    Fr rho_challenge{ 1 };
    if (has_zk) {
        // ρ⁰ is used to batch the hiding polynomial
        rho_challenge *= rho;
    }
    for (size_t i = 0; i < f_polynomials.size(); i++) {
        batched_unshifted.add_scaled(f_polynomials[i], rho_challenge);
        rho_challenge *= rho;
    }
    for (size_t i = 0; i < g_polynomials.size(); i++) {
        batched_to_be_shifted.add_scaled(g_polynomials[i], rho_challenge);
        rho_challenge *= rho;
    }

    size_t num_groups = groups_to_be_concatenated.size();
    size_t num_chunks_per_group = groups_to_be_concatenated.empty() ? 0 : groups_to_be_concatenated[0].size();

    // Allocate space for the groups to be concatenated and for the concatenated polynomials
    Polynomial batched_concatenated(n);
    std::vector<Polynomial> batched_group;
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

    auto fold_polynomials = compute_fold_polynomials(log_n,
                                                     multilinear_challenge,
                                                     std::move(batched_unshifted),
                                                     std::move(batched_to_be_shifted),
                                                     std::move(batched_concatenated));

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1159): Decouple constants from primitives.
    for (size_t l = 0; l < CONST_PROOF_SIZE_LOG_N - 1; l++) {
        if (l < log_n - 1) {
            transcript->send_to_verifier("Gemini:FOLD_" + std::to_string(l + 1),
                                         commitment_key->commit(fold_polynomials[l + 2]));
        } else {
            transcript->send_to_verifier("Gemini:FOLD_" + std::to_string(l + 1), Commitment::one());
        }
    }
    const Fr r_challenge = transcript->template get_challenge<Fr>("Gemini:r");
    info("gemini r! ", r_challenge);

    std::vector<Claim> claims =
        compute_fold_polynomial_evaluations(log_n, std::move(fold_polynomials), r_challenge, std::move(batched_group));

    for (size_t l = 1; l <= CONST_PROOF_SIZE_LOG_N; l++) {
        if (l <= log_n) {
            transcript->send_to_verifier("Gemini:a_" + std::to_string(l), claims[l].opening_pair.evaluation);
        } else {
            transcript->send_to_verifier("Gemini:a_" + std::to_string(l), Fr::zero());
        }
    }

    return claims;
};

/**
 * @brief Computes d-1 fold polynomials Fold_i, i = 1, ..., d-1
 *
 * @param mle_opening_point multilinear opening point 'u'
 * @param batched_unshifted F(X) = ∑ⱼ ρʲ fⱼ(X) .
 * @param batched_to_be_shifted G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X)
 * @param batched_concatenated The sum of batched concatenated polynomial,
 * @return std::vector<Polynomial>
 */
template <typename Curve>
std::vector<typename GeminiProver_<Curve>::Polynomial> GeminiProver_<Curve>::compute_fold_polynomials(
    const size_t num_variables,
    std::span<const Fr> mle_opening_point,
    Polynomial&& batched_unshifted,
    Polynomial&& batched_to_be_shifted,
    Polynomial&& batched_concatenated)
{
    const size_t num_threads = get_num_cpus_pow2();
    constexpr size_t efficient_operations_per_thread = 64; // A guess of the number of operation for which there
                                                           // would be a point in sending them to a separate thread

    // Allocate space for m+1 Fold polynomials
    //
    // The first two are populated here with the batched unshifted and to-be-shifted polynomial respectively.
    // They will eventually contain the full batched polynomial A₀ partially evaluated at the challenges r,-r.
    // This function populates the other m-1 polynomials with the foldings of A₀.
    std::vector<Polynomial> fold_polynomials;
    fold_polynomials.reserve(num_variables + 1);

    // F(X) = ∑ⱼ ρʲ fⱼ(X) and G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X)
    Polynomial& batched_F = fold_polynomials.emplace_back(std::move(batched_unshifted));
    Polynomial& batched_G = fold_polynomials.emplace_back(std::move(batched_to_be_shifted));
    constexpr size_t offset_to_folded = 2; // Offset because of F an G
    // A₀(X) = F(X) + G↺(X) = F(X) + G(X)/X.
    Polynomial A_0 = batched_F;

    // If proving the opening for translator, add a non-zero contribution of the batched concatenation polynomials
    A_0 += batched_concatenated;

    A_0 += batched_G.shifted();

    // Allocate everything before parallel computation
    for (size_t l = 0; l < num_variables - 1; ++l) {
        // size of the previous polynomial/2
        const size_t n_l = 1 << (num_variables - l - 1);

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        fold_polynomials.emplace_back(Polynomial(n_l));
    }

    // A_l = Aₗ(X) is the polynomial being folded
    // in the first iteration, we take the batched polynomial
    // in the next iteration, it is the previously folded one
    auto A_l = A_0.data();
    for (size_t l = 0; l < num_variables - 1; ++l) {
        // size of the previous polynomial/2
        const size_t n_l = 1 << (num_variables - l - 1);

        // Use as many threads as it is useful so that 1 thread doesn't process 1 element, but make sure that there is
        // at least 1
        size_t num_used_threads = std::min(n_l / efficient_operations_per_thread, num_threads);
        num_used_threads = num_used_threads ? num_used_threads : 1;
        size_t chunk_size = n_l / num_used_threads;
        size_t last_chunk_size = (n_l % chunk_size) ? (n_l % num_used_threads) : chunk_size;

        // Openning point is the same for all
        const Fr u_l = mle_opening_point[l];

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        auto A_l_fold = fold_polynomials[l + offset_to_folded].data();

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
 * @brief Computes/aggragates d+1 Fold polynomials and their opening pairs (challenge, evaluation)
 *
 * @details This function assumes that, upon input, last d-1 entries in fold_polynomials are Fold_i.
 * The first two entries are assumed to be, respectively, the batched unshifted and batched to-be-shifted
 * polynomials F(X) = ∑ⱼ ρʲfⱼ(X) and G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X). This function completes the computation
 * of the first two Fold polynomials as F + G/r and F - G/r. It then evaluates each of the d+1
 * fold polynomials at, respectively, the points r, rₗ = r^{2ˡ} for l = 0, 1, ..., d-1.
 *
 * @param mle_opening_point u = (u₀,...,uₘ₋₁) is the MLE opening point
 * @param fold_polynomials vector of polynomials whose first two elements are F(X) = ∑ⱼ ρʲfⱼ(X)
 * and G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X), and the next d-1 elements are Fold_i, i = 1, ..., d-1.
 * @param r_challenge univariate opening challenge
 */
template <typename Curve>
std::vector<typename GeminiProver_<Curve>::Claim> GeminiProver_<Curve>::compute_fold_polynomial_evaluations(
    const size_t num_variables,
    std::vector<Polynomial>&& fold_polynomials,
    const Fr& r_challenge,
    std::vector<Polynomial>&& batched_groups_to_be_concatenated)
{

    Polynomial& batched_F = fold_polynomials[0]; // F(X) = ∑ⱼ ρʲ   fⱼ(X)

    Polynomial& batched_G = fold_polynomials[1]; // G(X) = ∑ⱼ ρᵏ⁺ʲ gⱼ(X)

    // Compute univariate opening queries rₗ = r^{2ˡ} for l = 0, 1, ..., m-1
    std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(r_challenge, num_variables);

    // Compute G/r
    Fr r_inv = r_challenge.invert();
    batched_G *= r_inv;

    // Construct A₀₊ = F + G/r and A₀₋ = F - G/r in place in fold_polynomials
    Polynomial tmp = batched_F;
    Polynomial& A_0_pos = fold_polynomials[0];

    // A₀₊(X) = F(X) + G(X)/r, s.t. A₀₊(r) = A₀(r)
    A_0_pos += batched_G;

    // Perform a swap so that tmp = G(X)/r and A_0_neg = F(X)
    std::swap(tmp, batched_G);
    Polynomial& A_0_neg = fold_polynomials[1];

    // A₀₋(X) = F(X) - G(X)/r, s.t. A₀₋(-r) = A₀(-r)
    A_0_neg -= tmp;

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
        const size_t mini_circuit_size = (1 << num_variables) / batched_groups_to_be_concatenated.size();
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

    std::vector<Claim> opening_claims;
    opening_claims.reserve(num_variables + 1);

    // Compute first opening pair {r, A₀(r)}
    Fr evaluation = fold_polynomials[0].evaluate(r_challenge);
    opening_claims.emplace_back(Claim{ fold_polynomials[0], { r_challenge, evaluation } });
    // Compute the remaining m opening pairs {−r^{2ˡ}, Aₗ(−r^{2ˡ})}, l = 0, ..., m-1.
    for (size_t l = 0; l < num_variables; ++l) {
        evaluation = fold_polynomials[l + 1].evaluate(-r_squares[l]);
        opening_claims.emplace_back(Claim{ fold_polynomials[l + 1], { -r_squares[l], evaluation } });
    }

    return opening_claims;
};
} // namespace bb
