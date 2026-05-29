// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
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
    size_t circuit_size,
    PolynomialBatcher& polynomial_batcher,
    std::span<Fr> multilinear_challenge,
    const CommitmentKey<Curve>& commitment_key,
    const std::shared_ptr<Transcript>& transcript,
    bool has_zk)
{
    BB_BENCH_NAME("GeminiProver::prove");
    // To achieve fixed proof size in Ultra and Mega, the multilinear opening challenge is be padded to a fixed size.
    const size_t virtual_log_n = multilinear_challenge.size();
    const size_t log_n = numeric::get_msb(circuit_size);

    // Get the batching challenge
    const Fr rho = transcript->template get_challenge<Fr>("rho");

    Polynomial A_0 = polynomial_batcher.compute_batched(rho);

    // Construct the d-1 Gemini foldings of A₀(X)
    std::vector<Polynomial> fold_polynomials = compute_fold_polynomials(log_n, multilinear_challenge, A_0);

    // If virtual_log_n >= log_n, pad the fold commitments with dummy group elements [1]_1.
    for (size_t l = 0; l < virtual_log_n - 1; l++) {
        std::string label = "Gemini:FOLD_" + std::to_string(l + 1);
        // Virtual-round fold polynomials are constant; their commitments are zeroed by the verifier.
        transcript->send_to_verifier(label, commitment_key.commit(fold_polynomials[l]));
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
        virtual_log_n, std::move(A_0_pos), std::move(A_0_neg), std::move(fold_polynomials), r_challenge);

    for (size_t l = 1; l <= virtual_log_n; l++) {
        std::string label = "Gemini:a_" + std::to_string(l);
        transcript->send_to_verifier(label, claims[l].opening_pair.evaluation);
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
    BB_BENCH_NAME("Gemini::compute_fold_polynomials");
    BB_ASSERT_GTE(log_n, size_t(2), "Gemini folding requires at least 4-element polynomials");
    const size_t virtual_log_n = multilinear_challenge.size();

    // Cost per iteration: 1 subtraction + 1 multiplication + 1 addition
    constexpr size_t fold_iteration_cost =
        (2 * thread_heuristics::FF_ADDITION_COST) + thread_heuristics::FF_MULTIPLICATION_COST;

    // Track the actual data extent through fold rounds. Only non-zero coefficients need folding;
    // beyond this extent, all values are zero and contribute nothing.
    // At minimum, the disabled head region must be covered (masking values live at rows 1..3).
    size_t actual_size = std::max(A_0.end_index(), static_cast<size_t>(NUM_DISABLED_ROWS_IN_SUMCHECK));

    // Reserve and allocate space for m-1 Fold polynomials, the foldings of the full batched polynomial A₀
    std::vector<Polynomial> fold_polynomials;
    fold_polynomials.reserve(virtual_log_n - 1);
    for (size_t l = 0; l < log_n - 1; ++l) {
        const size_t fold_size = (actual_size + 1) / 2;

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        fold_polynomials.emplace_back(Polynomial(fold_size));
        actual_size = fold_size;
    }

    // A_l = Aₗ(X) is the polynomial being folded
    // in the first iteration, we take the batched polynomial
    // in the next iteration, it is the previously folded one
    actual_size = A_0.end_index();
    auto A_l = A_0.data();
    for (size_t l = 0; l < log_n - 1; ++l) {
        const size_t fold_size = (actual_size + 1) / 2;
        const size_t num_pairs = actual_size / 2; // number of full even/odd pairs

        // Opening point is the same for all; use zero for rounds beyond the challenge size
        const Fr u_l = l < virtual_log_n ? multilinear_challenge[l] : Fr(0);

        // A_l_fold = Aₗ₊₁(X) = (1-uₗ)⋅even(Aₗ)(X) + uₗ⋅odd(Aₗ)(X)
        auto A_l_fold = fold_polynomials[l].data();

        // Kernel shape per output j: A_l_fold[j] = A_l[2j] + u_l * (A_l[2j+1] - A_l[2j]).
        // Same stride-2 lerp as Sumcheck::partially_evaluate; under WASM SIMD with Bn254Fr,
        // each thread's slice runs the 5-output SIMD lerp via VectorField::gather + lerp +
        // store_to, with a scalar tail. Output buffer A_l_fold is distinct from the source
        // A_l (allocated fresh in fold_polynomials[l]), so no aliasing concerns.
        parallel_for_heuristic(
            num_pairs,
            [&](const ThreadChunk& chunk) {
                auto chunk_range = chunk.range(num_pairs);
                if (chunk_range.empty()) {
                    return;
                }
                const size_t lo = *chunk_range.begin();
                const size_t hi = lo + chunk_range.size();
                size_t j = lo;
#if defined(__wasm_simd128__)
                if constexpr (has_simd_mont_mul_v<typename Fr::Params>) {
                    using Vec = VectorField<typename Fr::Params>;
                    const Vec u_vec = Vec::broadcast(u_l);
                    const size_t pair_groups = (hi - lo) / 5;
                    for (size_t b = 0; b < pair_groups; ++b) {
                        const size_t src_base = (lo + b * 5) << 1;
                        const std::array<size_t, 5> even_idx{
                            src_base + 0, src_base + 2, src_base + 4, src_base + 6, src_base + 8
                        };
                        const std::array<size_t, 5> odd_idx{
                            src_base + 1, src_base + 3, src_base + 5, src_base + 7, src_base + 9
                        };
                        const Vec even = Vec::gather(A_l, even_idx);
                        const Vec odd = Vec::gather(A_l, odd_idx);
                        const Vec result = even + (odd - even) * u_vec;
                        result.store_to(A_l_fold + lo + b * 5);
                    }
                    j = lo + pair_groups * 5;
                }
#endif
                for (; j < hi; ++j) {
                    A_l_fold[j] = A_l[j << 1] + u_l * (A_l[(j << 1) + 1] - A_l[j << 1]);
                }
            },
            fold_iteration_cost);
        // If odd number of coefficients, the last one has no partner (implicitly 0)
        if (actual_size & 1) {
            A_l_fold[num_pairs] = A_l[actual_size - 1] * (Fr(1) - u_l);
        }
        // set Aₗ₊₁ = Aₗ for the next iteration
        A_l = A_l_fold;
        actual_size = fold_size;
    }

    // Virtual rounds (indices log_n .. virtual_log_n - 1).
    // After real folding, the fold polynomials are constant. Since each constant polynomial evaluates to its own
    // value at every point, (f(X) - f(x)) / (X - x) = 0, so these contribute nothing to the Shplonk quotient Q(X).
    // On the verifier side, these constant fold polynomials contribute nothing to the Shplonk quotient.
    const auto& last = fold_polynomials.back();
    const Fr u_last = (log_n - 1) < virtual_log_n ? multilinear_challenge[log_n - 1] : Fr(0);
    const Fr final_eval = last.at(0) + u_last * (last.at(1) - last.at(0));
    Polynomial const_fold(1);
    const_fold.at(0) = final_eval;
    fold_polynomials.emplace_back(const_fold);

    // FOLD_{log_n+1}, ..., FOLD_{d_v-1}
    Fr tail = Fr(1);
    for (size_t k = log_n; k < virtual_log_n - 1; ++k) {
        tail *= (Fr(1) - multilinear_challenge[k]); // multiply by (1 - u_k)
        Polynomial next_const(1);
        next_const.at(0) = final_eval * tail;
        fold_polynomials.emplace_back(next_const);
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
