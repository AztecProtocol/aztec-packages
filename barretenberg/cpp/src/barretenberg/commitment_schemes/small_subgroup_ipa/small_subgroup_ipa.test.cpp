#pragma once
#include "../commitment_key.test.hpp"
#include <cstddef>
#include <cstdint>
#include <gtest/gtest.h>
// #include "barretenberg/commitment_schemes/claim.hpp"

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <array>
#include <vector>

namespace bb {
template <class Params> class SmallSubgroupIPATest : public CommitmentTest<Params> {};

auto& engine = numeric::get_debug_randomness();

using CurveTypes = ::testing::Types<curve::BN254, curve::Grumpkin>;

TYPED_TEST_SUITE(SmallSubgroupIPATest, CurveTypes);

TYPED_TEST(SmallSubgroupIPATest, BatchedQuotientComputation)
{
    using FF = typename TypeParam::ScalarField;
    using SmallSubgroupIPA = SmallSubgroupIPAProver<TypeParam, NativeTranscript, CommitmentKey<TypeParam>>;
    using ZKSumcheckData = ZKSumcheckData<TypeParam, NativeTranscript, CommitmentKey<TypeParam>>;
    static constexpr size_t SUBGROUP_SIZE = TypeParam::SUBGROUP_SIZE;
    auto prover_transcript = NativeTranscript::prover_init_empty();

    const size_t log_circuit_size = 7;
    ZKSumcheckData zk_sumcheck_data = ZKSumcheckData(log_circuit_size, prover_transcript, this->ck());

    std::vector<FF> multivariate_challenge = this->random_evaluation_point(log_circuit_size);

    FF claimed_ipa_eval = zk_sumcheck_data.constant_term;
    for (auto& [challenge, libra_univariate] : zip_view(multivariate_challenge, zk_sumcheck_data.libra_univariates)) {
        claimed_ipa_eval += libra_univariate.evaluate(challenge);
    }

    SmallSubgroupIPA small_subgroup_ipa_prover =
        SmallSubgroupIPA(zk_sumcheck_data, multivariate_challenge, claimed_ipa_eval, prover_transcript, this->ck());

    auto batched_polynomial = small_subgroup_ipa_prover.get_batched_polynomial();

    auto batched_quotient = small_subgroup_ipa_prover.get_witness_polynomials()[2];

    // Check that batched polynomial is divisible by Z_H(X)
    for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
        EXPECT_EQ(batched_polynomial.evaluate(zk_sumcheck_data.interpolation_domain[idx]), FF{ 0 });
    }

    std::vector<FF> Z_H(SUBGROUP_SIZE + 1);
    Z_H[0] = -FF(1);
    Z_H[SUBGROUP_SIZE] = FF(1);

    std::vector<FF> product;
    for (size_t i = 0; i < Z_H.size(); i++) {
        for (size_t j = 0; j < batched_quotient.size(); j++) {
            product[i + j] = Z_H[i] * batched_quotient[j];
        }
    }

    info("product size", product.size());
    EXPECT_EQ(product.size(), batched_polynomial.size());

    for (auto [coeff_expected, coeff] : zip_view(product, batched_polynomial)) {
        EXPECT_EQ(coeff, coeff_expected);
    }
}
} // namespace bb
