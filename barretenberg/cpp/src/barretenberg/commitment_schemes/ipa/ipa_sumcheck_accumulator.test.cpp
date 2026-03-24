/**
 * @file ipa_sumcheck_accumulator.test.cpp
 * @brief Tests for the IPA-sumcheck accumulation scheme prototype.
 *
 * Tests the accumulate protocol from Section 6 of "Revisiting the IPA-sumcheck connection"
 * (Eagen & Gabizon, ePrint 2025/1325).
 */

#include "ipa_sumcheck_accumulator.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>

namespace bb {

class IpaSumcheckAccumulatorTest : public ::testing::Test {
  protected:
    using Curve = curve::Grumpkin;
    using Fr = Curve::ScalarField;
    using GroupElement = Curve::Element;
    using Commitment = Curve::AffineElement;

    // Use small SRS for test speed. n=2^k generators.
    static constexpr size_t k = 4;
    static constexpr size_t n = 1UL << k; // 16

    std::vector<Commitment> srs_generators;

    void SetUp() override
    {
        // Generate random SRS generators (simulating the trusted setup)
        srs_generators.resize(n);
        for (size_t i = 0; i < n; i++) {
            srs_generators[i] = Commitment(GroupElement::random_element());
        }
    }

    /**
     * @brief Compute the multilinear extension of the SRS at a given point.
     *
     * Ĝ(r) = Σ_{b ∈ {0,1}^k} eq(b, r) · G_b
     *
     * This is the "ground truth" for testing.
     */
    GroupElement compute_srs_mle(const std::vector<Fr>& r) const
    {
        EXPECT_EQ(r.size(), k);
        auto eq_table = ProverEqPolynomial<Fr>::construct(r, k);
        GroupElement result = GroupElement::infinity();
        for (size_t b = 0; b < n; b++) {
            result = result + GroupElement(srs_generators[b]) * eq_table.at(b);
        }
        return result;
    }

    /**
     * @brief Create a valid SRS evaluation claim at a random point.
     */
    SrsEvalClaim<Curve> make_valid_claim()
    {
        std::vector<Fr> r(k);
        for (size_t i = 0; i < k; i++) {
            r[i] = Fr::random_element();
        }
        GroupElement C = compute_srs_mle(r);
        return SrsEvalClaim<Curve>{ r, C };
    }

    /**
     * @brief Create an invalid SRS evaluation claim (wrong value).
     */
    SrsEvalClaim<Curve> make_invalid_claim()
    {
        std::vector<Fr> r(k);
        for (size_t i = 0; i < k; i++) {
            r[i] = Fr::random_element();
        }
        GroupElement C = GroupElement::random_element(); // Wrong value
        return SrsEvalClaim<Curve>{ r, C };
    }
};

/**
 * @brief Test that the decider correctly verifies a single valid claim.
 */
TEST_F(IpaSumcheckAccumulatorTest, DecideSingleValidClaim)
{
    auto claim = make_valid_claim();
    bool result = IpaSumcheckAccumulator<Curve>::decide(srs_generators, claim);
    EXPECT_TRUE(result);
}

/**
 * @brief Test that the decider rejects an invalid claim.
 */
TEST_F(IpaSumcheckAccumulatorTest, DecideSingleInvalidClaim)
{
    auto claim = make_invalid_claim();
    bool result = IpaSumcheckAccumulator<Curve>::decide(srs_generators, claim);
    EXPECT_FALSE(result);
}

/**
 * @brief Test the prover: round messages should satisfy the sumcheck relation.
 */
TEST_F(IpaSumcheckAccumulatorTest, ProverRoundPolynomials)
{
    // Create 3 valid claims
    std::vector<SrsEvalClaim<Curve>> claims;
    for (size_t i = 0; i < 3; i++) {
        claims.push_back(make_valid_claim());
    }

    Fr gamma = Fr::random_element();
    std::vector<Fr> round_challenges(k);
    for (size_t i = 0; i < k; i++) {
        round_challenges[i] = Fr::random_element();
    }

    auto round_polys = IpaSumcheckAccumulateProver<Curve>::prove(srs_generators, claims, gamma, round_challenges);
    ASSERT_EQ(round_polys.size(), k);

    // Compute target C = Σ γ^i C_i
    Fr gamma_pow = Fr::one();
    GroupElement C = claims[0].claimed_value;
    for (size_t i = 1; i < claims.size(); i++) {
        gamma_pow *= gamma;
        C = C + claims[i].claimed_value * gamma_pow;
    }

    // Check round 1: A_1(0) + A_1(1) = C
    GroupElement round_sum = round_polys[0].sum_over_binary();
    EXPECT_EQ(Commitment(round_sum), Commitment(C));

    // Check subsequent rounds: A_i(r_{i-1}) = A_{i+1}(0) + A_{i+1}(1)
    for (size_t i = 0; i + 1 < k; i++) {
        GroupElement eval_at_r = round_polys[i].evaluate(round_challenges[i]);
        GroupElement next_sum = round_polys[i + 1].sum_over_binary();
        EXPECT_EQ(Commitment(eval_at_r), Commitment(next_sum));
    }
}

/**
 * @brief Test the full accumulate protocol with valid claims.
 */
TEST_F(IpaSumcheckAccumulatorTest, AccumulateValidClaims)
{
    std::vector<SrsEvalClaim<Curve>> claims;
    for (size_t i = 0; i < 4; i++) {
        claims.push_back(make_valid_claim());
    }

    Fr gamma = Fr::random_element();
    std::vector<Fr> round_challenges(k);
    for (size_t i = 0; i < k; i++) {
        round_challenges[i] = Fr::random_element();
    }

    // Prover
    auto round_polys = IpaSumcheckAccumulateProver<Curve>::prove(srs_generators, claims, gamma, round_challenges);

    // Verifier
    auto result = IpaSumcheckAccumulateVerifier<Curve>::verify(claims, gamma, round_challenges, round_polys);

    EXPECT_TRUE(result.verified);

    // The accumulated claim should be decidable
    bool decided = IpaSumcheckAccumulator<Curve>::decide(srs_generators, result.accumulated_claim);
    EXPECT_TRUE(decided);
}

/**
 * @brief Test accumulate-and-decide end-to-end pipeline.
 */
TEST_F(IpaSumcheckAccumulatorTest, AccumulateAndDecideEndToEnd)
{
    std::vector<SrsEvalClaim<Curve>> claims;
    for (size_t i = 0; i < 5; i++) {
        claims.push_back(make_valid_claim());
    }

    bool result = IpaSumcheckAccumulator<Curve>::accumulate_and_decide(srs_generators, claims);
    EXPECT_TRUE(result);
}

/**
 * @brief Test that accumulation with one invalid claim produces a bad accumulated claim.
 *
 * Per the paper's soundness theorem (Lemma 6.1): if any φ_i ∉ L_G, then with
 * overwhelming probability the accumulated φ ∉ L_G either.
 */
TEST_F(IpaSumcheckAccumulatorTest, AccumulateWithInvalidClaimFails)
{
    std::vector<SrsEvalClaim<Curve>> claims;
    // 3 valid claims + 1 invalid
    for (size_t i = 0; i < 3; i++) {
        claims.push_back(make_valid_claim());
    }
    claims.push_back(make_invalid_claim());

    // The accumulate-and-decide should fail (with overwhelming probability)
    // because the invalid claim poisons the accumulation.
    bool result = IpaSumcheckAccumulator<Curve>::accumulate_and_decide(srs_generators, claims);
    EXPECT_FALSE(result);
}

/**
 * @brief Test accumulation with a single claim (t=1 edge case).
 */
TEST_F(IpaSumcheckAccumulatorTest, AccumulateSingleClaim)
{
    std::vector<SrsEvalClaim<Curve>> claims = { make_valid_claim() };
    bool result = IpaSumcheckAccumulator<Curve>::accumulate_and_decide(srs_generators, claims);
    EXPECT_TRUE(result);
}

/**
 * @brief Test accumulation with two claims (matches root rollup's 2-proof structure).
 */
TEST_F(IpaSumcheckAccumulatorTest, AccumulateTwoClaims)
{
    std::vector<SrsEvalClaim<Curve>> claims;
    claims.push_back(make_valid_claim());
    claims.push_back(make_valid_claim());

    bool result = IpaSumcheckAccumulator<Curve>::accumulate_and_decide(srs_generators, claims);
    EXPECT_TRUE(result);
}

/**
 * @brief Benchmark: demonstrate cost savings of accumulate vs individual decide.
 *
 * With t claims:
 * - Naive: t × O(n) MSMs = O(tn) scalar mults
 * - Accumulate: O(nk) prover + O(t + k) verifier + 1 × O(n) MSM = O(nk + t) total
 *
 * For the root rollup scenario (t=2, n=2^15, k=15):
 * - Naive: 2 × 32768 = 65536 scalar mults
 * - Accumulate: ~15×32768 (prover, native) + ~32 (verifier, in-circuit!) + 32768 = ~32800 in-circuit
 *
 * The crucial win is that the verifier (in-circuit) cost is O(t + k) ≈ 17 scalar mults
 * instead of O(tn) ≈ 65536.
 */
TEST_F(IpaSumcheckAccumulatorTest, CostComparisonDemonstration)
{
    const size_t num_claims = 8;
    std::vector<SrsEvalClaim<Curve>> claims;
    for (size_t i = 0; i < num_claims; i++) {
        claims.push_back(make_valid_claim());
    }

    // Approach 1: Decide each claim individually (simulating "no accumulation")
    size_t naive_scalar_mults = 0;
    for (const auto& claim : claims) {
        bool ok = IpaSumcheckAccumulator<Curve>::decide(srs_generators, claim);
        EXPECT_TRUE(ok);
        naive_scalar_mults += n; // Each decide does an n-sized MSM
    }

    // Approach 2: Accumulate then decide once
    size_t accum_verifier_scalar_mults = num_claims + 2 * k; // t + 2k (Section 6, Theorem 4.4)
    size_t accum_decide_scalar_mults = n;                    // One final MSM
    size_t accum_total_verifier = accum_verifier_scalar_mults + accum_decide_scalar_mults;

    bool result = IpaSumcheckAccumulator<Curve>::accumulate_and_decide(srs_generators, claims);
    EXPECT_TRUE(result);

    // Report savings
    info("=== IPA Batching Cost Comparison (n=", n, ", k=", k, ", t=", num_claims, ") ===");
    info("Naive (t individual decides): ", naive_scalar_mults, " scalar mults");
    info("Accumulate verifier:          ", accum_verifier_scalar_mults, " scalar mults (in-circuit!)");
    info("Accumulate + decide total:    ", accum_total_verifier, " scalar mults");
    info("Savings factor (in-circuit):  ",
         naive_scalar_mults,
         "/",
         accum_verifier_scalar_mults,
         " = ",
         (double)naive_scalar_mults / (double)accum_verifier_scalar_mults,
         "x");
}

/**
 * @brief Test with larger SRS to verify scaling.
 */
TEST_F(IpaSumcheckAccumulatorTest, LargerSRS)
{
    // Use n=256 (k=8)
    constexpr size_t k2 = 8;
    constexpr size_t n2 = 1UL << k2;

    std::vector<Commitment> large_srs(n2);
    for (size_t i = 0; i < n2; i++) {
        large_srs[i] = Commitment(GroupElement::random_element());
    }

    // Create claims
    auto make_claim = [&]() -> SrsEvalClaim<Curve> {
        std::vector<Fr> r(k2);
        for (size_t i = 0; i < k2; i++) {
            r[i] = Fr::random_element();
        }
        // Compute ground truth
        auto eq_table = ProverEqPolynomial<Fr>::construct(r, k2);
        GroupElement C = GroupElement::infinity();
        for (size_t b = 0; b < n2; b++) {
            C = C + GroupElement(large_srs[b]) * eq_table.at(b);
        }
        return SrsEvalClaim<Curve>{ r, C };
    };

    std::vector<SrsEvalClaim<Curve>> claims;
    for (size_t i = 0; i < 4; i++) {
        claims.push_back(make_claim());
    }

    // Generate challenges
    Fr gamma = Fr::random_element();
    std::vector<Fr> round_challenges(k2);
    for (size_t i = 0; i < k2; i++) {
        round_challenges[i] = Fr::random_element();
    }

    // Run accumulate
    auto round_polys = IpaSumcheckAccumulateProver<Curve>::prove(large_srs, claims, gamma, round_challenges);
    auto result = IpaSumcheckAccumulateVerifier<Curve>::verify(claims, gamma, round_challenges, round_polys);

    EXPECT_TRUE(result.verified);

    // Decide
    bool decided = IpaSumcheckAccumulator<Curve>::decide(large_srs, result.accumulated_claim);
    EXPECT_TRUE(decided);

    info("Larger SRS test passed: n=", n2, ", k=", k2, ", t=4");
    info("Accumulate verifier cost: ", 4 + 2 * k2, " scalar mults (vs ", 4 * n2, " naive)");
}

} // namespace bb
