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

struct DummyProvingKey : MultilinearBatchingProvingKey {
    DummyProvingKey()
    {
        auto polys = MultilinearBatchingFlavor::ProverPolynomials(16);
        // for (size_t i = 0; i < 2; i++) {

        //     polys.w_non_shifted_accumulator.at(i) = FF(1);
        //     polys.w_evaluations_accumulator.at(i) = FF(1);
        //     polys.w_non_shifted_instance.at(i) = FF(1);
        //     polys.w_evaluations_instance.at(i) = FF(1);
        // }
        for (size_t i = 0; i < polys.w_non_shifted_accumulator.size(); i++) {
            polys.w_non_shifted_accumulator.at(i) = FF::random_element();
        }
        for (size_t i = 0; i < polys.w_shifted_accumulator.size(); i++) {
            polys.w_shifted_accumulator.at(i) = FF::random_element();
        }
        for (size_t i = 0; i < polys.w_non_shifted_instance.size(); i++) {
            polys.w_non_shifted_instance.at(i) = FF::random_element();
        }
        for (size_t i = 0; i < polys.w_shifted_instance.size(); i++) {
            polys.w_shifted_instance.at(i) = FF::random_element();
        }
        auto accumulator_challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
        auto instance_challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
        for (size_t i = 0; i < MultilinearBatchingFlavor::VIRTUAL_LOG_N; i++) {
            accumulator_challenge[i] = FF::random_element();
            instance_challenge[i] = FF::random_element();
        }
        polys.w_evaluations_accumulator = ProverEqPolynomial<FF>::construct(accumulator_challenge, 4);
        polys.w_evaluations_instance = ProverEqPolynomial<FF>::construct(instance_challenge, 4);

        for (size_t i = 0; i < polys.w_evaluations_accumulator.size(); i++) {
            std::vector<FF> index_challenge(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
            for (size_t j = 0; j < MultilinearBatchingFlavor::VIRTUAL_LOG_N; j++) {
                index_challenge[j] = (i >> j) & 1;
            }
            BB_ASSERT_EQ(polys.w_evaluations_accumulator.at(i),
                         EqVerifierPolynomial<FF>::eval(accumulator_challenge, index_challenge));
        }
        for (size_t i = 0; i < polys.w_evaluations_instance.size(); i++) {
            std::vector<FF> index_challenge(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
            for (size_t j = 0; j < MultilinearBatchingFlavor::VIRTUAL_LOG_N; j++) {
                index_challenge[j] = (i >> j) & 1;
            }
            BB_ASSERT_EQ(polys.w_evaluations_instance.at(i),
                         EqVerifierPolynomial<FF>::eval(instance_challenge, index_challenge));
        }

        auto accumulator_evaluations = std::vector<FF>(2);
        auto instance_evaluations = std::vector<FF>(2);
        accumulator_evaluations[0] = 0;
        for (size_t i = 0; i < polys.w_non_shifted_accumulator.size(); i++) {
            accumulator_evaluations[0] += polys.w_non_shifted_accumulator[i] * polys.w_evaluations_accumulator[i];
        }
        accumulator_evaluations[1] = 0;
        for (size_t i = 0; i < polys.w_shifted_accumulator.size(); i++) {
            accumulator_evaluations[1] += polys.w_shifted_accumulator[i] * polys.w_evaluations_accumulator[i];
        }
        instance_evaluations[0] = 0;
        for (size_t i = 0; i < polys.w_non_shifted_instance.size(); i++) {
            instance_evaluations[0] += polys.w_non_shifted_instance[i] * polys.w_evaluations_instance[i];
        }
        instance_evaluations[1] = 0;
        for (size_t i = 0; i < polys.w_shifted_instance.size(); i++) {
            instance_evaluations[1] += polys.w_shifted_instance[i] * polys.w_evaluations_instance[i];
        }

        proving_key = std::make_shared<ProvingKey>(std::move(polys),
                                                   std::move(accumulator_challenge),
                                                   std::move(instance_challenge),
                                                   std::move(accumulator_evaluations),
                                                   std::move(instance_evaluations));
    }
};

TEST(MultilinearBatchingProver, ConstructProof)
{
    auto transcript = std::make_shared<Transcript>();
    DummyProvingKey dummy_key;
    MultilinearBatchingProver prover{ std::make_shared<MultilinearBatchingProvingKey>(dummy_key), transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
}

TEST(MultilinearBatchingVerifier, VerifyProof)
{
    auto prover_transcript = std::make_shared<Transcript>();
    DummyProvingKey dummy_key;
    MultilinearBatchingProver prover{ std::make_shared<MultilinearBatchingProvingKey>(dummy_key), prover_transcript };

    auto proof = prover.construct_proof();
    EXPECT_FALSE(proof.empty());
    auto verifier_transcript = std::make_shared<Transcript>();
    MultilinearBatchingVerifier verifier{ verifier_transcript };

    auto [verified, sumcheck_output] = verifier.verify_proof(proof);
    EXPECT_TRUE(verified);
    auto challenge = sumcheck_output.challenge;
    auto new_challenge = std::vector<FF>(MultilinearBatchingFlavor::VIRTUAL_LOG_N);
}

} // namespace
} // namespace bb
