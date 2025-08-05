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
 * @brief Check that the size of a mock Oink proof matches expectation for MegaFlavor
 *
 */
TEST(MockVerifierInputsTest, MockMegaOinkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;

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
        const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::HidingKernelIO<Builder>>();
        EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
    }
}

/**
 * @brief Check that the size of a mock Oink proof matches expectation for UltraFlavor
 *
 */
TEST(MockVerifierInputsTest, MockUltraOinkProofSize)
{
    using Flavor = UltraFlavor;
    using Builder = UltraCircuitBuilder;

    // DefaultIO
    const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::DefaultIO<Builder>::PUBLIC_INPUTS_SIZE;
    HonkProof honk_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::DefaultIO<Builder>>();
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
 * @brief Check that the size of a mock Honk proof matches expectation based for MegaFlavor
 *
 */
TEST(MockVerifierInputsTest, MockMegaHonkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;

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
        const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::HidingKernelIO<Builder>>();
        EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
    }
}

/**
 * @brief Check that the size of a mock Honk proof matches expectation for UltraFlavor
 *
 */
TEST(MockVerifierInputsTest, MockHonkProofSize)
{
    using Flavor = UltraFlavor;
    using Builder = UltraCircuitBuilder;

    // DefaultIO
    const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::DefaultIO<Builder>::PUBLIC_INPUTS_SIZE;
    HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::DefaultIO<Builder>>();
    EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
}
