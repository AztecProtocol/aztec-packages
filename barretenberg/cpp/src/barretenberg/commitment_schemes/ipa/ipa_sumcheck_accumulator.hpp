#pragma once
/**
 * @file ipa_sumcheck_accumulator.hpp
 * @brief Prototype implementation of the IPA-sumcheck accumulation scheme from
 *        "Revisiting the IPA-sumcheck connection" (Eagen & Gabizon, ePrint 2025/1325).
 *
 * @details The paper observes that IPA can be viewed as a sumcheck over a group-valued polynomial.
 * This enables:
 *   1. Accumulating multiple IPA evaluation claims into one via sumcheck-over-G (Section 6).
 *   2. Deciding the accumulated claim with O(λ log²n) verifier work via BaseFold-over-G (Section 7).
 *
 * This file implements the **accumulate** protocol (Section 6): given t claims
 *   φ_i = (r_i, C_i) asserting Ĝ(r_i) = C_i
 * where Ĝ is the multilinear extension of the SRS generators, produce a single claim φ = (r, C).
 *
 * The protocol runs a sumcheck on A(X) = G(X) · e(X) with target C = Σ γ^i C_i,
 * where e(X) = Σ γ^i eq(X, r_i). Since A has group coefficients (degree-2 in each variable),
 * the sumcheck round messages are degree-2 polynomials over G.
 *
 * Verifier cost: t + 2k scalar multiplications + O(tk) field operations.
 * Prover cost: O(n) scalar multiplications per round, O(nk) total.
 *
 * This is a PROTOTYPE for evaluation/benchmarking; it is not production-ready.
 */

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/polynomials/eq_polynomial.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstddef>
#include <vector>

namespace bb {

/**
 * @brief A claim that the multilinear extension of the SRS evaluates to a given group element.
 *
 * Represents φ = (r, C) meaning Ĝ(r) = C, where Ĝ is the multilinear extension of generators
 * G_0, ..., G_{n-1} and r ∈ F^k.
 *
 * This is an element of the language L_G from Section 4 of the paper.
 */
template <typename Curve> struct SrsEvalClaim {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;

    std::vector<Fr> evaluation_point; // r ∈ F^k
    GroupElement claimed_value;       // C ∈ G, purported value of Ĝ(r)
};

/**
 * @brief Round message in the sumcheck-over-G protocol.
 *
 * A degree-2 univariate polynomial over G: A_i(X) = c_0 + c_1·X + c_2·X^2.
 * Each coefficient c_j ∈ G (a group element).
 */
template <typename Curve> struct GroupUnivariate {
    using GroupElement = typename Curve::Element;

    GroupElement coeffs[3]; // degree-2: c_0, c_1, c_2

    /**
     * @brief Evaluate A(x) = c_0 + c_1·x + c_2·x^2
     */
    GroupElement evaluate(const typename Curve::ScalarField& x) const
    {
        // Horner's: A(x) = c_0 + x·(c_1 + x·c_2)
        return coeffs[0] + (coeffs[1] + coeffs[2] * x) * x;
    }

    /**
     * @brief Verify the sum: A(0) + A(1) should equal a target.
     * A(0) = c_0, A(1) = c_0 + c_1 + c_2
     * So A(0) + A(1) = 2·c_0 + c_1 + c_2
     */
    GroupElement sum_over_binary() const { return coeffs[0] + coeffs[0] + coeffs[1] + coeffs[2]; }
};

/**
 * @brief Prover for the accumulate protocol (Section 6 of ePrint 2025/1325).
 *
 * Given t claims φ_i = (r_i, C_i) and the SRS generators, runs a sumcheck on
 * A(X) = G(X) · e(X) where e(X) = Σ γ^i eq(X, r_i), producing round messages
 * that are degree-2 polynomials over G.
 */
template <typename Curve> class IpaSumcheckAccumulateProver {
  public:
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;

    /**
     * @brief Run the prover side of the accumulate protocol.
     *
     * @param srs_generators The n SRS generators G_0, ..., G_{n-1}
     * @param claims The t claims to accumulate
     * @param gamma The batching challenge γ
     * @param round_challenges Pre-determined challenges r_1,...,r_k (for non-interactive / Fiat-Shamir)
     * @return Vector of k degree-2 group univariates (round messages)
     */
    static std::vector<GroupUnivariate<Curve>> prove(std::span<const Commitment> srs_generators,
                                                     const std::vector<SrsEvalClaim<Curve>>& claims,
                                                     const Fr& gamma,
                                                     const std::vector<Fr>& round_challenges)
    {
        const size_t num_claims = claims.size();
        const size_t n = srs_generators.size();
        const size_t k = numeric::get_msb(static_cast<uint32_t>(n)); // log2(n)
        BB_ASSERT(n == (1UL << k));
        BB_ASSERT(round_challenges.size() == k);

        // Compute γ powers: γ^0, γ^1, ..., γ^{t-1}
        std::vector<Fr> gamma_pows(num_claims);
        gamma_pows[0] = Fr::one();
        for (size_t i = 1; i < num_claims; i++) {
            gamma_pows[i] = gamma_pows[i - 1] * gamma;
        }

        // Build the eq tables: for each claim i, compute eq(b, r_i) for all b ∈ {0,1}^k
        std::vector<Polynomial<Fr>> eq_tables(num_claims);
        for (size_t i = 0; i < num_claims; i++) {
            eq_tables[i] = ProverEqPolynomial<Fr>::construct(claims[i].evaluation_point, k);
        }

        // Combine into e(b) = Σ γ^i eq(b, r_i) for each b ∈ {0,1}^k
        Polynomial<Fr> e_table(n);
        for (size_t b = 0; b < n; b++) {
            Fr val = Fr::zero();
            for (size_t i = 0; i < num_claims; i++) {
                val += gamma_pows[i] * eq_tables[i].at(b);
            }
            e_table.at(b) = val;
        }

        // Maintain G_table (group) and e_table (field) separately through all rounds.
        // G_table[b] = "partially-bound multilinear extension of SRS at b"
        // Initially G_table[b] = G_b (the SRS generator)
        std::vector<GroupUnivariate<Curve>> round_polys;
        round_polys.reserve(k);

        std::vector<GroupElement> G_table(n);
        for (size_t b = 0; b < n; b++) {
            G_table[b] = GroupElement(srs_generators[b]);
        }

        // e_table is already computed above as combined eq polynomial
        // e_table[b] = Σ γ^i eq(b, r_i)

        size_t current_size = n;
        for (size_t round = 0; round < k; round++) {
            size_t half = current_size / 2;

            // Compute round univariate at X ∈ {0, 1, 2}
            GroupElement sum_at_0 = GroupElement::infinity();
            GroupElement sum_at_1 = GroupElement::infinity();
            GroupElement sum_at_2 = GroupElement::infinity();

            for (size_t j = 0; j < half; j++) {
                // G and e values at X=0 and X=1 for this pair
                const GroupElement& G_lo = G_table[2 * j];
                const GroupElement& G_hi = G_table[2 * j + 1];
                const Fr& e_lo = e_table.at(2 * j);
                const Fr& e_hi = e_table.at(2 * j + 1);

                // A(X=0) contribution: G_lo · e_lo
                sum_at_0 = sum_at_0 + G_lo * e_lo;
                // A(X=1) contribution: G_hi · e_hi
                sum_at_1 = sum_at_1 + G_hi * e_hi;
                // A(X=2): G(2) = 2·G_hi - G_lo, e(2) = 2·e_hi - e_lo
                GroupElement G_at_2 = G_hi + G_hi - G_lo;
                Fr e_at_2 = e_hi + e_hi - e_lo;
                sum_at_2 = sum_at_2 + G_at_2 * e_at_2;
            }

            // Convert 3 evaluations to degree-2 polynomial coefficients via Lagrange interpolation
            // f(0) = sum_at_0, f(1) = sum_at_1, f(2) = sum_at_2
            // c_0 = f(0)
            // c_1 = (-3·f(0) + 4·f(1) - f(2)) / 2
            // c_2 = (f(0) - 2·f(1) + f(2)) / 2
            //
            // Over a group with scalar multiplication:
            Fr two_inv = Fr(2).invert();
            GroupElement c_0 = sum_at_0;
            GroupElement c_1 = (sum_at_0 * Fr(-3) + sum_at_1 * Fr(4) + sum_at_2 * Fr(-1)) * two_inv;
            GroupElement c_2 = (sum_at_0 + sum_at_1 * Fr(-2) + sum_at_2) * two_inv;

            round_polys.push_back(GroupUnivariate<Curve>{ { c_0, c_1, c_2 } });

            // Bind the current variable to r_round in both G and e tables
            Fr r_i = round_challenges[round];
            for (size_t j = 0; j < half; j++) {
                // G(r_i) = (1 - r_i)·G_lo + r_i·G_hi
                G_table[j] = G_table[2 * j] * (Fr::one() - r_i) + G_table[2 * j + 1] * r_i;
                // e(r_i) = (1 - r_i)·e_lo + r_i·e_hi
                e_table.at(j) = e_table.at(2 * j) * (Fr::one() - r_i) + e_table.at(2 * j + 1) * r_i;
            }

            current_size = half;
        }

        return round_polys;
    }
};

/**
 * @brief Verifier for the accumulate protocol (Section 6 of ePrint 2025/1325).
 *
 * Given t claims and the prover's round messages, checks the sumcheck and outputs
 * a single accumulated claim (r, C) ∈ L_G.
 */
template <typename Curve> class IpaSumcheckAccumulateVerifier {
  public:
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;

    struct AccumulateResult {
        SrsEvalClaim<Curve> accumulated_claim;
        bool verified;
    };

    /**
     * @brief Run the verifier side of the accumulate protocol.
     *
     * @param claims The t input claims φ_i = (r_i, C_i)
     * @param gamma The batching challenge γ
     * @param round_challenges The sumcheck challenges r_1,...,r_k
     * @param round_polys The prover's round messages (degree-2 polynomials over G)
     * @return AccumulateResult containing the accumulated claim and verification status
     */
    static AccumulateResult verify(const std::vector<SrsEvalClaim<Curve>>& claims,
                                   const Fr& gamma,
                                   const std::vector<Fr>& round_challenges,
                                   const std::vector<GroupUnivariate<Curve>>& round_polys)
    {
        const size_t num_claims = claims.size();
        const size_t k = round_challenges.size();
        BB_ASSERT(round_polys.size() == k);
        BB_ASSERT(num_claims > 0);

        // Step 1: Compute C = Σ γ^i C_i
        Fr gamma_pow = Fr::one();
        GroupElement C = claims[0].claimed_value;
        for (size_t i = 1; i < num_claims; i++) {
            gamma_pow *= gamma;
            C = C + claims[i].claimed_value * gamma_pow;
        }

        // Step 2: Verify sumcheck rounds
        GroupElement target = C;
        bool verified = true;

        for (size_t round = 0; round < k; round++) {
            // Check A_i(0) + A_i(1) = target
            GroupElement round_sum = round_polys[round].sum_over_binary();

            // Compare: we check that round_sum == target
            auto target_affine = typename Curve::AffineElement(target);
            auto sum_affine = typename Curve::AffineElement(round_sum);
            if (target_affine != sum_affine) {
                verified = false;
            }

            // Update target: target = A_i(r_i)
            target = round_polys[round].evaluate(round_challenges[round]);
        }

        // Step 3: After sumcheck, target = A(r) = G(r) · e(r)
        // Compute e(r) = Σ γ^i eq(r, r_i)
        Fr e_at_r = Fr::zero();
        gamma_pow = Fr::one();
        for (size_t i = 0; i < num_claims; i++) {
            Fr eq_val = VerifierEqPolynomial<Fr>::eval(claims[i].evaluation_point, round_challenges);
            e_at_r += gamma_pow * eq_val;
            if (i < num_claims - 1) {
                gamma_pow *= gamma;
            }
        }

        // Output claim: (r, target / e(r)) = (r, G(r))
        Fr e_inv = e_at_r.invert();
        GroupElement accumulated_C = target * e_inv;

        return AccumulateResult{
            SrsEvalClaim<Curve>{ std::vector<Fr>(round_challenges.begin(), round_challenges.end()), accumulated_C },
            verified,
        };
    }
};

/**
 * @brief End-to-end accumulate: combines t SRS evaluation claims into one.
 *
 * This is the main entry point for the accumulation scheme. It:
 * 1. Runs the prover to generate round messages
 * 2. Runs the verifier to check and output the accumulated claim
 * 3. The accumulated claim can then be decided via a single O(n) MSM (or BaseFold-over-G).
 *
 * @tparam Curve The elliptic curve (typically Grumpkin for Aztec)
 */
template <typename Curve> class IpaSumcheckAccumulator {
  public:
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;

    /**
     * @brief Decide a single SRS evaluation claim by computing the MSM directly.
     *
     * Checks (r, C) ∈ L_G by computing Ĝ(r) = Σ_b eq(b, r) · G_b and comparing to C.
     *
     * Cost: O(n) scalar multiplications (one MSM over the full SRS).
     * This is the "naive" decider; the paper's BaseFold-over-G decider would reduce this
     * to O(λ log n) verifier scalar mults at the cost of 4n prover scalar mults.
     */
    static bool decide(std::span<const Commitment> srs_generators, const SrsEvalClaim<Curve>& claim)
    {
        const size_t n = srs_generators.size();
        const size_t k = claim.evaluation_point.size();
        BB_ASSERT(n == (1UL << k));

        // Compute eq(b, r) for all b ∈ {0,1}^k
        Polynomial<Fr> eq_table = ProverEqPolynomial<Fr>::construct(claim.evaluation_point, k);

        // Compute Ĝ(r) = Σ_b eq(b, r) · G_b via MSM
        GroupElement G_at_r = GroupElement::infinity();
        for (size_t b = 0; b < n; b++) {
            G_at_r = G_at_r + GroupElement(srs_generators[b]) * eq_table.at(b);
        }

        auto expected = typename Curve::AffineElement(G_at_r);
        auto actual = typename Curve::AffineElement(claim.claimed_value);
        return expected == actual;
    }

    /**
     * @brief Full accumulate-then-decide pipeline.
     *
     * Given t IPA claims (expressed as SRS evaluation claims), accumulates them into one
     * and then decides the accumulated claim.
     *
     * Total verifier cost: t + 2k scalar mults (accumulate) + n scalar mults (decide).
     * The key win: the O(n) MSM is done ONCE regardless of t, rather than t times.
     *
     * In a recursive setting, the accumulate step runs in-circuit (cheap: O(t + k) group ops),
     * while decide runs only at the outermost layer (native, once).
     */
    static bool accumulate_and_decide(std::span<const Commitment> srs_generators,
                                      const std::vector<SrsEvalClaim<Curve>>& claims)
    {
        if (claims.empty()) {
            return true;
        }

        const size_t k = claims[0].evaluation_point.size();

        // Generate challenges (in production these come from Fiat-Shamir transcript)
        Fr gamma = Fr::random_element();
        std::vector<Fr> round_challenges(k);
        for (size_t i = 0; i < k; i++) {
            round_challenges[i] = Fr::random_element();
        }

        // Prover: generate round messages
        auto round_polys = IpaSumcheckAccumulateProver<Curve>::prove(srs_generators, claims, gamma, round_challenges);

        // Verifier: check sumcheck and get accumulated claim
        auto result = IpaSumcheckAccumulateVerifier<Curve>::verify(claims, gamma, round_challenges, round_polys);

        if (!result.verified) {
            return false;
        }

        // Decide the single accumulated claim
        return decide(srs_generators, result.accumulated_claim);
    }
};

} // namespace bb
