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

MultilinearBatchingProverClaim create_valid_claim()
{
    using Polynomial = MultilinearBatchingFlavor::Polynomial;

    MultilinearBatchingProverClaim claim;

    claim.challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
    for (size_t i = 0; i < MultilinearBatchingFlavor::VIRTUAL_LOG_N; i++) {
        claim.challenge[i] = FF::random_element();
    }

    const size_t dyadic_size = 16;
    claim.non_shifted_polynomial = Polynomial(dyadic_size);
    claim.shifted_polynomial = Polynomial::shiftable(dyadic_size);

    claim.non_shifted_polynomial.at(0) = FF::random_element();
    for (size_t i = 1; i < dyadic_size; i++) {
        claim.non_shifted_polynomial.at(i) = FF::random_element();
        claim.shifted_polynomial.at(i) = FF::random_element();
    }

    claim.non_shifted_commitment = Commitment::random_element();
    claim.shifted_commitment = Commitment::random_element();

    auto eq_polynomial = ProverEqPolynomial<FF>::construct(claim.challenge, 4);

    // Compute non-shifted evaluation
    claim.non_shifted_evaluation = 0;
    for (size_t i = 0; i < claim.non_shifted_polynomial.size(); i++) {
        claim.non_shifted_evaluation += claim.non_shifted_polynomial.at(i) * eq_polynomial.at(i);
    }

    // Compute shifted evaluation using the shifted polynomial
    auto shifted = claim.shifted_polynomial.shifted();
    claim.shifted_evaluation = 0;
    for (size_t i = 0; i < shifted.size(); i++) {
        claim.shifted_evaluation += shifted.at(i) * eq_polynomial.at(i);
    }

    claim.dyadic_size = dyadic_size;
    return claim;
}

TEST(MultilinearBatchingProver, ConstructProof)
{
    auto transcript = std::make_shared<Transcript>();
    auto accumulator_claim = std::make_shared<MultilinearBatchingProverClaim>(create_valid_claim());
    auto instance_claim = std::make_shared<MultilinearBatchingProverClaim>(create_valid_claim());
    MultilinearBatchingProver prover{ accumulator_claim, instance_claim, transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
}

TEST(MultilinearBatchingVerifier, VerifyProof)
{
    auto prover_transcript = std::make_shared<Transcript>();
    auto accumulator_claim = std::make_shared<MultilinearBatchingProverClaim>(create_valid_claim());
    auto instance_claim = std::make_shared<MultilinearBatchingProverClaim>(create_valid_claim());
    MultilinearBatchingProver prover{ accumulator_claim, instance_claim, prover_transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
    auto verifier_transcript = std::make_shared<Transcript>();
    verifier_transcript->load_proof(proof);
    MultilinearBatchingVerifier<MultilinearBatchingFlavor> verifier{ verifier_transcript };

    auto [verified, sumcheck_output] = verifier.verify_proof();
    EXPECT_TRUE(verified);
    auto challenge = sumcheck_output.challenge;
    auto new_challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
}

} // namespace
} // namespace bb
