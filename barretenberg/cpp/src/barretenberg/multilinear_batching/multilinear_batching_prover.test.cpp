#include "barretenberg/multilinear_batching/multilinear_batching_prover.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_proving_key.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation.hpp"
#include "barretenberg/relations/multilinear_batching/multilinear_batching_relation_consistency.test.cpp"

#include <gtest/gtest.h>

namespace bb {
namespace {

using FF = MultilinearBatchingFlavor::FF;
using Transcript = MultilinearBatchingFlavor::Transcript;
using Commitment = MultilinearBatchingFlavor::Commitment;

struct DummyClaim : MultilinearBatchingProverClaim {
    DummyClaim()
    {
        auto challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
        for (size_t i = 0; i < MultilinearBatchingFlavor::VIRTUAL_LOG_N; i++) {
            challenge[i] = FF::random_element();
        }
        const size_t dyadic_size = 16;
        auto non_shifted_polynomial = Polynomial(dyadic_size);
        auto to_be_shifted_polynomial = Polynomial::shiftable(dyadic_size);
        non_shifted_polynomial.at(0) = FF::random_element();
        for (size_t i = 1; i < dyadic_size; i++) {
            non_shifted_polynomial.at(i) = FF::random_element();
            to_be_shifted_polynomial.at(i) = FF::random_element();
        }
        auto non_shifted_commitment = Commitment::random_element();
        auto shifted_commitment = Commitment::random_element();

        auto eq_polynomial = ProverEqPolynomial<FF>::construct(challenge, 4);

        auto accumulator_evaluations = std::vector<FF>(2);
        auto instance_evaluations = std::vector<FF>(2);
        accumulator_evaluations[0] = 0;
        for (size_t i = 0; i < non_shifted_polynomial.size(); i++) {
            accumulator_evaluations[0] += non_shifted_polynomial.at(i) * eq_polynomial.at(i);
        }
        accumulator_evaluations[1] = 0;
        for (size_t i = 0; i < shifted_polynomial.size(); i++) {
            accumulator_evaluations[1] += shifted_polynomial.at(i) * eq_polynomial.at(i);
        }
        this->challenge = challenge;
        this->non_shifted_polynomial = non_shifted_polynomial;
        this->shifted_polynomial = to_be_shifted_polynomial;
        this->non_shifted_commitment = non_shifted_commitment;
        this->shifted_commitment = shifted_commitment;
        this->shifted_evaluation = accumulator_evaluations[1];
        this->non_shifted_evaluation = accumulator_evaluations[0];
        this->dyadic_size = dyadic_size;
    }
};

TEST(MultilinearBatchingProver, ConstructProof)
{
    auto transcript = std::make_shared<Transcript>();
    auto accumulator_claim = std::make_shared<DummyClaim>();
    auto instance_claim = std::make_shared<DummyClaim>();
    MultilinearBatchingProver prover{ accumulator_claim, instance_claim, transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
}

TEST(MultilinearBatchingVerifier, VerifyProof)
{
    auto prover_transcript = std::make_shared<Transcript>();
    auto accumulator_claim = std::make_shared<DummyClaim>();
    auto instance_claim = std::make_shared<DummyClaim>();
    MultilinearBatchingProver prover{ accumulator_claim, instance_claim, prover_transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
    auto verifier_transcript = std::make_shared<Transcript>();
    MultilinearBatchingVerifier<MultilinearBatchingFlavor> verifier{ verifier_transcript };

    auto [verified, sumcheck_output] = verifier.verify_proof(proof);
    EXPECT_TRUE(verified);
    auto challenge = sumcheck_output.challenge;
    auto new_challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
}

} // namespace
} // namespace bb
