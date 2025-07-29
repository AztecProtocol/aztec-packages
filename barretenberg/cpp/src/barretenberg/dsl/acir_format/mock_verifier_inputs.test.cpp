#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
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

    if constexpr (IsMegaFlavor<Flavor>) {
        {
            // AppIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::AppIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::AppIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }

        {
            // KernelIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::KernelIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::KernelIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }

        {
            // HidingKernelIO
            const size_t NUM_PUBLIC_INPUTS =
                stdlib::recursion::honk::HidingKernelIO<typename Flavor::CircuitBuilder>::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof =
                create_mock_oink_proof<Flavor,
                                       stdlib::recursion::honk::HidingKernelIO<typename Flavor::CircuitBuilder>>();
            EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    } else if constexpr (HasIPAAccumulator<Flavor>) {
        {
            // RollupIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::RollupIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::RollupIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    } else {
        {
            // DefaultIO
            const size_t NUM_PUBLIC_INPUTS =
                stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof =
                create_mock_oink_proof<Flavor, stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>>();
            EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    }
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

    if constexpr (IsMegaFlavor<Flavor>) {
        {
            // AppIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::AppIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::AppIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }

        {
            // KernelIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::KernelIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::KernelIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }

        {
            // HidingKernelIO
            const size_t NUM_PUBLIC_INPUTS =
                stdlib::recursion::honk::HidingKernelIO<typename Flavor::CircuitBuilder>::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof =
                create_mock_honk_proof<Flavor,
                                       stdlib::recursion::honk::HidingKernelIO<typename Flavor::CircuitBuilder>>();
            EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    } else if constexpr (HasIPAAccumulator<Flavor>) {
        {
            // RollupIO
            const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::RollupIO::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::RollupIO>();
            EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    } else {
        {
            // DefaultIO
            const size_t NUM_PUBLIC_INPUTS =
                stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>::PUBLIC_INPUTS_SIZE;
            HonkProof honk_proof =
                create_mock_honk_proof<Flavor, stdlib::recursion::honk::DefaultIO<typename Flavor::CircuitBuilder>>();
            EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
        }
    }
}
