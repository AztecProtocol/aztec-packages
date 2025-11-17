#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include "barretenberg/stdlib/chonk_verifier/chonk_recursive_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "honk_recursion_constraint.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

template <typename Flavor> class MockVerifierInputsTest : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using FlavorTypes = testing::Types<MegaFlavor, UltraFlavor, UltraZKFlavor, UltraRollupFlavor>;

TYPED_TEST_SUITE(MockVerifierInputsTest, FlavorTypes);

/**
 * @brief Check that the size of a mock merge proof matches expectation
 */
TEST(MockVerifierInputsTest, MockMergeProofSize)
{
    size_t CURRENT_MERGE_PROOF_SIZE = 42;
    EXPECT_EQ(CURRENT_MERGE_PROOF_SIZE, MERGE_PROOF_SIZE) << "The length of the Merge proof changed.";

    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Check that the size of a mock pre-ipa proof matches expectation
 */
TEST(MockVerifierInputsTest, MockPreIpaProofSize)
{
    size_t CURRENT_PRE_IPA_PROOF_SIZE = 606;
    EXPECT_EQ(ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH, CURRENT_PRE_IPA_PROOF_SIZE)
        << "The length of the Pre-IPA proof changed.";

    HonkProof pre_ipa_proof = create_mock_pre_ipa_proof();
    EXPECT_EQ(pre_ipa_proof.size(), ECCVMFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH);
}

/**
 * @brief Check that the size of a mock ipa proof matches expectation
 */
TEST(MockVerifierInputsTest, MockIPAProofSize)
{
    size_t CURRENT_IPA_PROOF_SIZE = 64;
    EXPECT_EQ(IPA_PROOF_LENGTH, CURRENT_IPA_PROOF_SIZE) << "The length of the IPA proof changed.";

    HonkProof ipa_proof = create_mock_ipa_proof();
    EXPECT_EQ(ipa_proof.size(), IPA_PROOF_LENGTH);
}

/**
 * @brief Check that the size of a mock translator proof matches expectation
 */
TEST(MockVerifierInputsTest, MockTranslatorProofSize)
{
    size_t CURRENT_TRANSLATOR_PROOF_SIZE = 804;
    EXPECT_EQ(TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS, CURRENT_TRANSLATOR_PROOF_SIZE)
        << "The length of the Translator proof changed.";

    HonkProof translator_proof = create_mock_translator_proof();
    EXPECT_EQ(translator_proof.size(), TranslatorFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
}

/**
 * @brief Check that the size of a mock Oink proof matches expectation for MegaFlavor
 *
 */
TEST(MockVerifierInputsTest, MockMegaOinkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;

    size_t CURRENT_OINK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 96;
    EXPECT_EQ(Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS, CURRENT_OINK_PROOF_SIZE_WITHOUT_PUB_INPUTS)
        << "The length of the Mega Oink proof changed.";

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
 * @brief Check that the size of a mock Oink proof matches expectation for Ultra flavors
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockUltraOinkProofSize)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;

    if (!std::is_same_v<Flavor, MegaFlavor>) {
        // Base Ultra flavors have 8 witness entities, ZK flavors have 9 (includes gemini_masking_poly)
        size_t CURRENT_OINK_PROOF_SIZE_WITHOUT_PUB_INPUTS = Flavor::HasZK ? 36 : 32;
        EXPECT_EQ(Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS, CURRENT_OINK_PROOF_SIZE_WITHOUT_PUB_INPUTS)
            << "The length of the Ultra Oink proof changed.";

        const size_t NUM_PUBLIC_INPUTS = IO::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_oink_proof<Flavor, IO>();
        EXPECT_EQ(honk_proof.size(), Flavor::OINK_PROOF_LENGTH_WITHOUT_PUB_INPUTS + NUM_PUBLIC_INPUTS);
    } else {
        GTEST_SKIP();
    }
}

/**
 * @brief Check that the size of a mock Decider proof matches expectation based on Flavor
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockDeciderProofSize)
{
    using Flavor = TypeParam;

    if (!std::is_same_v<Flavor, UltraZKFlavor>) {
        size_t CURRENT_DECIDER_ULTRAZK_PROOF_SIZE = IsMegaFlavor<Flavor> ? 337 : 409;
        EXPECT_EQ(Flavor::DECIDER_PROOF_LENGTH(), CURRENT_DECIDER_ULTRAZK_PROOF_SIZE)
            << "The length of the Decider UltraZK proof changed.";

        HonkProof honk_proof = create_mock_decider_proof<Flavor>();
        EXPECT_EQ(honk_proof.size(), Flavor::DECIDER_PROOF_LENGTH());
    } else {
        GTEST_SKIP();
    }
}

/**
 * @brief Check that the size of a mock Honk proof matches expectation based for MegaFlavor
 *
 */
TEST(MockVerifierInputsTest, MockMegaHonkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;

    // If this value changes, we need to update the corresponding constants in noir and in yarn-project. Also, we need
    // to update the Prover.toml file for rollup-tx-private to reflect the new length of the MegaHonk proof.
    size_t CURRENT_MEGA_PROOF_SIZE_WITHOUT_PUB_INPUTS = 433;
    EXPECT_EQ(Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(), CURRENT_MEGA_PROOF_SIZE_WITHOUT_PUB_INPUTS)
        << "The length of the Mega Honk proof changed.";

    {
        // AppIO
        const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::AppIO::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::AppIO>();
        EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + NUM_PUBLIC_INPUTS);
    }

    {
        // KernelIO
        const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::KernelIO::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::KernelIO>();
        EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + NUM_PUBLIC_INPUTS);
    }

    {
        // HidingKernelIO
        const size_t NUM_PUBLIC_INPUTS = stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::HidingKernelIO<Builder>>();
        EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + NUM_PUBLIC_INPUTS);
    }
}

/**
 * @brief Check that the size of a mock Honk proof matches expectation for Ultra flavors
 *
 */
TYPED_TEST(MockVerifierInputsTest, MockUltraHonkProofSize)
{
    using Flavor = TypeParam;
    using Builder = Flavor::CircuitBuilder;
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;

    if (!std::is_same_v<Flavor, MegaFlavor>) {
        // If this value changes, we need to update the corresponding constants in noir and in yarn-project. Also, we
        // need to update the relevant Prover.toml files to reflect the new length of the Ultra Honk proof.
        size_t CURRENT_ULTRA_HONK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 0;
        if constexpr (std::is_same_v<Flavor, UltraFlavor>) {
            CURRENT_ULTRA_HONK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 441;
        } else if constexpr (std::is_same_v<Flavor, UltraRollupFlavor>) {
            CURRENT_ULTRA_HONK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 505;
        } else if constexpr (std::is_same_v<Flavor, UltraZKFlavor>) {
            CURRENT_ULTRA_HONK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 492;
        }
        const size_t NUM_PUBLIC_INPUTS = IO::PUBLIC_INPUTS_SIZE;
        HonkProof honk_proof = create_mock_honk_proof<Flavor, IO>();
        EXPECT_EQ(honk_proof.size(), Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + NUM_PUBLIC_INPUTS);
        EXPECT_EQ(Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS(), CURRENT_ULTRA_HONK_PROOF_SIZE_WITHOUT_PUB_INPUTS)
            << "The length of the Ultra Honk proof changed.";
    } else {
        GTEST_SKIP();
    }
}

/**
 * @brief Check that the size of a mock Chonk proof matches expectation
 *
 */
TEST(MockVerifierInputsTest, MockChonkProofSize)
{
    using Builder = MegaCircuitBuilder;

    // If this value changes, we need to update the corresponding constants in noir and in yarn-project. Also, we need
    // to update the Prover.toml file for rollup-tx-private to reflect the new length of the Chonk proof.
    size_t CURRENT_CHONK_PROOF_SIZE_WITHOUT_PUB_INPUTS = 1993;
    HonkProof chonk_proof = create_mock_chonk_proof<Builder>();
    EXPECT_EQ(chonk_proof.size(), Chonk::Proof::PROOF_LENGTH());
    EXPECT_EQ(chonk_proof.size(),
              CURRENT_CHONK_PROOF_SIZE_WITHOUT_PUB_INPUTS +
                  stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE)
        << "The length of the Chonk proof changed.";
}

/**
 * @brief Check that the size of a mock MultiLinearBatching proof matches expectation
 */
TEST(MockVerifierInputsTest, MockMultilinearBatchingProofSize)
{
    size_t CURRENT_MULTILINEAR_BATCHING_PROOF_SIZE_WITHOUT_PUB_INPUTS = 121;
    HonkProof batching_proof = create_mock_multilinear_batch_proof();
    EXPECT_EQ(batching_proof.size(), MultilinearBatchingFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS());
    EXPECT_EQ(batching_proof.size(), CURRENT_MULTILINEAR_BATCHING_PROOF_SIZE_WITHOUT_PUB_INPUTS)
        << "The length of the MultiLinearBatching proof changed.";
}
