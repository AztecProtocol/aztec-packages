#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "honk_recursion_constraint.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

template <typename Flavor> class MockVerifierInputsTest : public ::testing::Test {};

using FlavorTypes = testing::Types<UltraFlavor, MegaFlavor>;

TYPED_TEST_SUITE(MockVerifierInputsTest, FlavorTypes);

/**
 * @brief Check that the size of a mock merge proof matches expectation
 */
TEST(MockVerifierInputsTest, MockMergeProofSize)
{
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Check that the size of a mock Oink proof matches expectation based on Flavor
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockOinkProofSize)
{
    using Flavor = TypeParam;

    const size_t NUM_PUBLIC_INPUTS = PAIRING_POINTS_SIZE;
    HonkProof honk_proof = create_mock_oink_proof<Flavor>(NUM_PUBLIC_INPUTS);
    EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
}

/**
 * @brief Check that the size of a mock Decider proof matches expectation based on Flavor
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockDeciderProofSize)
{
    using Flavor = TypeParam;

    HonkProof honk_proof = create_mock_decider_proof<Flavor>();
    EXPECT_EQ(honk_proof.size(), Flavor::DECIDER_PROOF_LENGTH);
}

/**
 * @brief Check that the size of a mock Honk proof matches expectation based on Flavor
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockHonkProofSize)
{
    using Flavor = TypeParam;

    const size_t NUM_PUBLIC_INPUTS = PAIRING_POINTS_SIZE;
    HonkProof honk_proof = create_mock_honk_proof<Flavor>(NUM_PUBLIC_INPUTS);
    EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
}
