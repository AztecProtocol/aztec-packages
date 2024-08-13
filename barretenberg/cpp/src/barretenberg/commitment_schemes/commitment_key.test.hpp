#pragma once

#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include "claim.hpp"

#include <gtest/gtest.h>

namespace bb {

constexpr size_t COMMITMENT_TEST_NUM_POINTS = 4096;

template <class CK> inline std::shared_ptr<CK> CreateCommitmentKey();

template <> inline std::shared_ptr<CommitmentKey<curve::BN254>> CreateCommitmentKey<CommitmentKey<curve::BN254>>()
{
    srs::init_crs_factory("../srs_db/ignition");
    return std::make_shared<CommitmentKey<curve::BN254>>(COMMITMENT_TEST_NUM_POINTS);
}
// For IPA
template <> inline std::shared_ptr<CommitmentKey<curve::Grumpkin>> CreateCommitmentKey<CommitmentKey<curve::Grumpkin>>()
{
    srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    return std::make_shared<CommitmentKey<curve::Grumpkin>>(COMMITMENT_TEST_NUM_POINTS);
}

template <typename CK> inline std::shared_ptr<CK> CreateCommitmentKey()
// requires std::default_initializable<CK>
{
    return std::make_shared<CK>();
}

template <class VK> inline std::shared_ptr<VK> CreateVerifierCommitmentKey();

template <>
inline std::shared_ptr<VerifierCommitmentKey<curve::BN254>> CreateVerifierCommitmentKey<
    VerifierCommitmentKey<curve::BN254>>()
{
    return std::make_shared<VerifierCommitmentKey<curve::BN254>>();
}
// For IPA
template <>
inline std::shared_ptr<VerifierCommitmentKey<curve::Grumpkin>> CreateVerifierCommitmentKey<
    VerifierCommitmentKey<curve::Grumpkin>>()
{
    auto crs_factory = std::make_shared<srs::factories::FileCrsFactory<curve::Grumpkin>>("../srs_db/grumpkin",
                                                                                         COMMITMENT_TEST_NUM_POINTS);
    return std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(COMMITMENT_TEST_NUM_POINTS, crs_factory);
}
template <typename VK> inline std::shared_ptr<VK> CreateVerifierCommitmentKey()
// requires std::default_initializable<VK>
{
    return std::make_shared<VK>();
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

    std::shared_ptr<CK> ck() { return commitment_key; }
    std::shared_ptr<VK> vk() { return verification_key; }

    Commitment commit(const Polynomial& polynomial) { return commitment_key->commit(polynomial); }

    Polynomial random_polynomial(const size_t n)
    {
        Polynomial p(n);
        for (size_t i = 0; i < n; ++i) {
            p[i] = Fr::random_element(engine);
        }
        return p;
    }

    Fr random_element() { return Fr::random_element(engine); }

    OpeningPair<Curve> random_eval(const Polynomial& polynomial)
    {
        Fr x{ random_element() };
        Fr y{ polynomial.evaluate(x) };
        return { x, y };
    }

    std::pair<OpeningClaim<Curve>, Polynomial> random_claim(const size_t n)
    {
        auto polynomial = random_polynomial(n);
        auto opening_pair = random_eval(polynomial);
        auto commitment = commit(polynomial);
        auto opening_claim = OpeningClaim<Curve>{ opening_pair, commitment };
        return { opening_claim, polynomial };
    };

    std::vector<Fr> random_evaluation_point(const size_t num_variables)
    {
        std::vector<Fr> u(num_variables);
        for (size_t l = 0; l < num_variables; ++l) {
            u[l] = random_element();
        }
        return u;
    }

    void verify_opening_claim(const OpeningClaim<Curve>& claim, const Polynomial& witness)
    {
        auto& commitment = claim.commitment;
        auto& [x, y] = claim.opening_pair;
        Fr y_expected = witness.evaluate(x);
        EXPECT_EQ(y, y_expected) << "OpeningClaim: evaluations mismatch";
        Commitment commitment_expected = commit(witness);
        // found it
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
    void verify_batch_opening_pair(std::span<const OpeningPair<Curve>> opening_pairs,
                                   std::span<const Polynomial> witnesses)
    {
        const size_t num_pairs = opening_pairs.size();
        ASSERT_EQ(witnesses.size(), num_pairs);

        for (size_t j = 0; j < num_pairs; ++j) {
            this->verify_opening_pair(opening_pairs[j], witnesses[j]);
        }
    }

    numeric::RNG* engine;

    // Per-test-suite set-up.
    // Called before the first test in this test suite.
    // Can be omitted if not needed.
    static void SetUpTestSuite()
    {
        // Avoid reallocating static objects if called in subclasses of FooTest.
        if (commitment_key == nullptr) {
            commitment_key = CreateCommitmentKey<CK>();
        }
        if (verification_key == nullptr) {
            verification_key = CreateVerifierCommitmentKey<VK>();
        }
    }

    // Per-test-suite tear-down.
    // Called after the last test in this test suite.
    // Can be omitted if not needed.
    static void TearDownTestSuite() {}

    static typename std::shared_ptr<CK> commitment_key;
    static typename std::shared_ptr<VK> verification_key;
};

template <typename Curve>
typename std::shared_ptr<CommitmentKey<Curve>> CommitmentTest<Curve>::commitment_key = nullptr;
template <typename Curve>
typename std::shared_ptr<VerifierCommitmentKey<Curve>> CommitmentTest<Curve>::verification_key = nullptr;

using CommitmentSchemeParams = ::testing::Types<curve::BN254>;
using IpaCommitmentSchemeParams = ::testing::Types<curve::Grumpkin>;

} // namespace bb
