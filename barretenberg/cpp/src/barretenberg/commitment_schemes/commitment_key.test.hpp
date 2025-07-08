// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "claim.hpp"

#include <gtest/gtest.h>

namespace bb {

constexpr size_t COMMITMENT_TEST_NUM_BN254_POINTS = 4096;
constexpr size_t COMMITMENT_TEST_NUM_GRUMPKIN_POINTS = 1 << CONST_ECCVM_LOG_N;

template <class Curve> class UnivariateClaimData {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using OpeningPair = OpeningPair<Curve>;

  public:
    Polynomial poly;
    Commitment commitment;
    OpeningPair opening_pair;

    UnivariateClaimData(Polynomial& poly, Commitment& commitment, OpeningPair& opening_pair)
        : poly(poly)
        , commitment(commitment)
        , opening_pair(opening_pair)
    {}

    ProverOpeningClaim<Curve> prover_opening_claim() const { return { poly, opening_pair }; }

    OpeningClaim<Curve> verifier_opening_claim() const { return { opening_pair, commitment }; }

    Commitment polynomial_commiment() const { return commitment; };

    static std::vector<ProverOpeningClaim<Curve>> prover_opening_claims(
        const std::vector<UnivariateClaimData>& claim_data)
    {
        std::vector<ProverOpeningClaim<Curve>> prover_claims;
        for (const auto& claim : claim_data) {
            prover_claims.emplace_back(claim.prover_opening_claim());
        }

        return prover_claims;
    }

    static std::vector<OpeningClaim<Curve>> verifier_opening_claims(const std::vector<UnivariateClaimData>& claim_data)
    {
        std::vector<OpeningClaim<Curve>> verifier_claims;
        for (const auto& claim : claim_data) {
            verifier_claims.emplace_back(claim.verifier_opening_claim());
        }

        return verifier_claims;
    }

    static std::vector<Commitment> polynomial_commitments(const std::vector<UnivariateClaimData>& claim_data)
    {
        std::vector<Commitment> commitments;
        for (const auto& claim : claim_data) {
            commitments.emplace_back(claim.polynomial_commiment());
        }

        return commitments;
    }
};

template <class CK> CK create_commitment_key(const size_t num_points = 0);

template <>
inline CommitmentKey<curve::BN254> create_commitment_key<CommitmentKey<curve::BN254>>(const size_t num_points)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    if (num_points != 0) {
        return CommitmentKey<curve::BN254>(num_points);
    };
    return CommitmentKey<curve::BN254>(COMMITMENT_TEST_NUM_BN254_POINTS);
}
// For IPA
template <>
inline CommitmentKey<curve::Grumpkin> create_commitment_key<CommitmentKey<curve::Grumpkin>>(const size_t num_points)
{
    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    if (num_points != 0) {
        return CommitmentKey<curve::Grumpkin>(num_points);
    }
    return CommitmentKey<curve::Grumpkin>(COMMITMENT_TEST_NUM_GRUMPKIN_POINTS);
}

template <typename CK> inline CK create_commitment_key(size_t num_points)
// requires std::default_initializable<CK>
{
    return CK(num_points);
}

template <class VK> inline VK create_verifier_commitment_key();

template <>
inline VerifierCommitmentKey<curve::BN254> create_verifier_commitment_key<VerifierCommitmentKey<curve::BN254>>()
{
    return VerifierCommitmentKey<curve::BN254>();
}
// For IPA
template <>
inline VerifierCommitmentKey<curve::Grumpkin> create_verifier_commitment_key<VerifierCommitmentKey<curve::Grumpkin>>()
{
    srs::init_file_crs_factory(bb::srs::bb_crs_path());
    return VerifierCommitmentKey<curve::Grumpkin>(COMMITMENT_TEST_NUM_GRUMPKIN_POINTS, srs::get_grumpkin_crs_factory());
}
template <typename VK> VK create_verifier_commitment_key()
// requires std::default_initializable<VK>
{
    return VK();
}
template <typename Curve> class CommitmentTest : public ::testing::Test {
    using CK = CommitmentKey<Curve>;
    using VK = VerifierCommitmentKey<Curve>;

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    CommitmentTest()
        : engine{ &numeric::get_randomness() }
    {}

    const CK& ck() { return commitment_key; }
    VK& vk() { return verification_key; }

    Commitment commit(const Polynomial& polynomial) { return commitment_key.commit(polynomial); }

    Fr random_element() { return Fr::random_element(engine); }

    Polynomial random_polynomial(const size_t poly_size) { return Polynomial::random(poly_size); }

    OpeningPair<Curve> random_eval(const Polynomial& polynomial)
    {
        Fr x{ random_element() };
        Fr y{ polynomial.evaluate(x) };
        return { x, y };
    }

    std::vector<Fr> random_evaluation_point(const size_t num_variables)
    {
        std::vector<Fr> u(num_variables);
        for (size_t l = 0; l < num_variables; ++l) {
            u[l] = random_element();
        }
        return u;
    }

    void verify_opening_claim(const OpeningClaim<Curve>& claim,
                              const Polynomial& witness,
                              CommitmentKey<Curve> ck = CommitmentKey<Curve>())
    {
        auto& commitment = claim.commitment;
        auto& [x, y] = claim.opening_pair;
        Fr y_expected = witness.evaluate(x);
        EXPECT_EQ(y, y_expected) << "OpeningClaim: evaluations mismatch";
        Commitment commitment_expected;

        if (!ck.srs) {
            commitment_expected = commit(witness);
        } else {
            commitment_expected = ck.commit(witness);
        }

        EXPECT_EQ(commitment, commitment_expected) << "OpeningClaim: commitment mismatch";
    }

    void verify_opening_pair(const OpeningPair<Curve>& opening_pair, const Polynomial& witness)
    {
        auto& [x, y] = opening_pair;
        Fr y_expected = witness.evaluate(x);
        EXPECT_EQ(y, y_expected) << "OpeningPair: evaluations mismatch";
    }

    /**
     * @brief Ensures that a 'BatchOpeningClaim' is correct by checking that
     * - all evaluations are correct by recomputing them from each witness polynomial.
     * - commitments are correct by recomputing a commitment from each witness polynomial.
     * - each 'queries' is a subset of 'all_queries' and 'all_queries' is the union of all 'queries'
     * - each 'commitment' of each 'SubClaim' appears only once.
     */
    void verify_batch_opening_claim(std::span<const OpeningClaim<Curve>> multi_claims,
                                    std::span<const Polynomial> witnesses)
    {
        const size_t num_claims = multi_claims.size();
        ASSERT_EQ(witnesses.size(), num_claims);

        for (size_t j = 0; j < num_claims; ++j) {
            this->verify_opening_claim(multi_claims[j], witnesses[j]);
        }
    }

    /**
     * @brief Ensures that a set of opening pairs is correct by checking that evaluations are
     * correct by recomputing them from each witness polynomial.
     */
    void verify_batch_opening_pair(std::vector<ProverOpeningClaim<Curve>> opening_claims)
    {
        for (auto claim : opening_claims) {
            auto& [x, y] = claim.opening_pair;
            Fr y_expected = claim.polynomial.evaluate(x);
            EXPECT_EQ(y, y_expected) << "OpeningPair: evaluations mismatch";
        }
    }

    // Generate random claim data
    std::vector<UnivariateClaimData<Curve>> generate_claim_data(const std::vector<size_t>& poly_sizes)
    {
        const size_t num_claims = poly_sizes.size();
        std::vector<UnivariateClaimData<Curve>> claims;
        claims.reserve(num_claims);
        for (const auto& poly_size : poly_sizes) {
            auto r = this->random_element();
            auto poly = this->random_polynomial(poly_size);
            auto eval = poly.evaluate(r);
            auto commitment = this->commit(poly);

            OpeningPair<Curve> opening_pair(r, eval);
            UnivariateClaimData<Curve> claim(poly, commitment, opening_pair);
            claims.emplace_back(claim);
        }

        return claims;
    }

    // Linearly combine multiple claims and append new claim
    std::pair<std::vector<Fr>, std::vector<Fr>> combine_claims(std::vector<UnivariateClaimData<Curve>>& claims)
    {
        const size_t num_claims = claims.size();
        size_t max_poly_size = 0;

        // Generate random coefficients and find max poly size
        std::vector<Fr> coefficients;
        coefficients.reserve(num_claims);
        for (size_t idx = 0; idx < num_claims; idx++) {
            coefficients.emplace_back(this->random_element());
            max_poly_size = std::max(max_poly_size, claims[idx].poly.size());
        }
        // Generate random linear combination
        auto challenge = this->random_element();
        Polynomial linear_combination(max_poly_size);
        Fr eval = 0;
        std::vector<Fr> evals;
        evals.reserve(num_claims);
        for (const auto& [coeff, claim] : zip_view(coefficients, claims)) {
            linear_combination.add_scaled(claim.poly, coeff);
            // Compute evaluation
            auto tmp = claim.poly.evaluate(challenge);
            evals.emplace_back(tmp);
            eval += coeff * tmp;
        }

        Commitment commitment = this->commit(linear_combination);
        OpeningPair<Curve> opening_pair(challenge, eval);
        UnivariateClaimData<Curve> new_claim(linear_combination, commitment, opening_pair);
        claims.emplace_back(new_claim);

        return std::make_pair(coefficients, evals);
    }

    numeric::RNG* engine;

    // Per-test-suite set-up.
    // Called before the first test in this test suite.
    // Can be omitted if not needed.
    static void SetUpTestSuite()
    {
        // Avoid reallocating static objects if called in subclasses of FooTest.
        if (!commitment_key.initialized()) {
            commitment_key = create_commitment_key<CK>();
        }
        if (!verification_key.initialized()) {
            verification_key = create_verifier_commitment_key<VK>();
        }
    }

    // Per-test-suite tear-down.
    // Called after the last test in this test suite.
    // Can be omitted if not needed.
    static void TearDownTestSuite() {}

    static CK commitment_key;
    static VK verification_key;
};

template <typename Curve> CommitmentKey<Curve> CommitmentTest<Curve>::commitment_key;
template <typename Curve> VerifierCommitmentKey<Curve> CommitmentTest<Curve>::verification_key;

using CommitmentSchemeParams = ::testing::Types<curve::BN254>;
using IpaCommitmentSchemeParams = ::testing::Types<curve::Grumpkin>;

} // namespace bb
