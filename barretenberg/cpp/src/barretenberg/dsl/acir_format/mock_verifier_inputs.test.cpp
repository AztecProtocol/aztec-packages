#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/honk/proof_length.hpp"

#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;

class MockVerifierInputsTest : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Static assertions for proof length constants
static_assert(MERGE_PROOF_SIZE == 42, "Merge proof size changed");
static_assert(ECCVMFlavor::PROOF_LENGTH == 608, "ECCVM proof size changed");
static_assert(IPA_PROOF_LENGTH == 64, "IPA proof size changed");
static_assert(TranslatorFlavor::PROOF_LENGTH == 786, "Translator proof size changed");

static_assert(ProofLength::Oink<MegaFlavor>::LENGTH_WITHOUT_PUB_INPUTS == 96, "Mega Oink proof size changed");
static_assert(ProofLength::Oink<UltraFlavor>::LENGTH_WITHOUT_PUB_INPUTS == 32, "Ultra Oink proof size changed");
static_assert(ProofLength::Oink<UltraZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS == 36, "UltraZK Oink proof size changed");
static_assert(ProofLength::Oink<UltraRollupFlavor>::LENGTH_WITHOUT_PUB_INPUTS == 32,
              "UltraRollup Oink proof size changed");

static_assert(ProofLength::Honk<MegaFlavor>::LENGTH_WITHOUT_PUB_INPUTS(MegaFlavor::VIRTUAL_LOG_N) == 433,
              "Mega Honk proof size changed");
static_assert(ProofLength::Honk<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS(MegaZKFlavor::VIRTUAL_LOG_N) == 407,
              "MegaZK Honk (hiding kernel) proof size changed");
static_assert(ProofLength::Honk<UltraFlavor>::LENGTH_WITHOUT_PUB_INPUTS(UltraFlavor::VIRTUAL_LOG_N) == 441,
              "Ultra Honk proof size changed");
static_assert(ProofLength::Honk<UltraZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS(UltraZKFlavor::VIRTUAL_LOG_N) == 492,
              "UltraZK Honk proof size changed");
static_assert(ProofLength::Honk<UltraRollupFlavor>::LENGTH_WITHOUT_PUB_INPUTS(UltraRollupFlavor::VIRTUAL_LOG_N) == 505,
              "UltraRollup Honk proof size changed");

static_assert(ProofLength::MultilinearBatching<MultilinearBatchingFlavor>::LENGTH == 121,
              "MultilinearBatching proof size changed");

static_assert(ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS == 1907, "Chonk proof size changed");

/**
 * @brief Check that mock merge proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockMergeProofSize)
{
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Check that mock ECCVM proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockPreIpaProofSize)
{
    HonkProof eccvm_proof = create_mock_eccvm_proof();
    EXPECT_EQ(eccvm_proof.size(), ECCVMFlavor::PROOF_LENGTH);
}

/**
 * @brief Check that mock IPA proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockIPAProofSize)
{
    HonkProof ipa_proof = create_mock_ipa_proof();
    EXPECT_EQ(ipa_proof.size(), IPA_PROOF_LENGTH);
}

/**
 * @brief Check that mock Translator proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockTranslatorProofSize)
{
    HonkProof translator_proof = create_mock_translator_proof();
    EXPECT_EQ(translator_proof.size(), TranslatorFlavor::PROOF_LENGTH);
}

/**
 * @brief Check that mock Oink proofs have the expected size for MegaFlavor
 */
TEST_F(MockVerifierInputsTest, MockMegaOinkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;
    constexpr size_t OINK_LENGTH = ProofLength::Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS;

    HonkProof app_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::AppIO>();
    EXPECT_EQ(app_proof.size(), OINK_LENGTH + stdlib::recursion::honk::AppIO::PUBLIC_INPUTS_SIZE);

    HonkProof kernel_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::KernelIO>();
    EXPECT_EQ(kernel_proof.size(), OINK_LENGTH + stdlib::recursion::honk::KernelIO::PUBLIC_INPUTS_SIZE);

    HonkProof hiding_proof = create_mock_oink_proof<Flavor, stdlib::recursion::honk::HidingKernelIO<Builder>>();
    EXPECT_EQ(hiding_proof.size(), OINK_LENGTH + stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE);
}

/**
 * @brief Check that mock Oink proofs have the expected size for Ultra flavors
 */
TEST_F(MockVerifierInputsTest, MockUltraOinkProofSize)
{
    {
        using Flavor = UltraFlavor;
        using IO = stdlib::recursion::honk::DefaultIO<Flavor::CircuitBuilder>;
        HonkProof proof = create_mock_oink_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(), ProofLength::Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + IO::PUBLIC_INPUTS_SIZE);
    }
    {
        using Flavor = UltraZKFlavor;
        using IO = stdlib::recursion::honk::DefaultIO<Flavor::CircuitBuilder>;
        HonkProof proof = create_mock_oink_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(), ProofLength::Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + IO::PUBLIC_INPUTS_SIZE);
    }
    {
        using Flavor = UltraRollupFlavor;
        using IO = stdlib::recursion::honk::RollupIO;
        HonkProof proof = create_mock_oink_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(), ProofLength::Oink<Flavor>::LENGTH_WITHOUT_PUB_INPUTS + IO::PUBLIC_INPUTS_SIZE);
    }
}

/**
 * @brief Check that mock Honk proofs have the expected size for MegaFlavor
 */
TEST_F(MockVerifierInputsTest, MockMegaHonkProofSize)
{
    using Flavor = MegaFlavor;
    using Builder = MegaCircuitBuilder;
    constexpr size_t HONK_LENGTH = ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N);

    HonkProof app_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::AppIO>();
    EXPECT_EQ(app_proof.size(), HONK_LENGTH + stdlib::recursion::honk::AppIO::PUBLIC_INPUTS_SIZE);

    HonkProof kernel_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::KernelIO>();
    EXPECT_EQ(kernel_proof.size(), HONK_LENGTH + stdlib::recursion::honk::KernelIO::PUBLIC_INPUTS_SIZE);

    HonkProof hiding_proof = create_mock_honk_proof<Flavor, stdlib::recursion::honk::HidingKernelIO<Builder>>();
    EXPECT_EQ(hiding_proof.size(), HONK_LENGTH + stdlib::recursion::honk::HidingKernelIO<Builder>::PUBLIC_INPUTS_SIZE);
}

/**
 * @brief Check that mock Honk proofs have the expected size for Ultra flavors
 */
TEST_F(MockVerifierInputsTest, MockUltraHonkProofSize)
{
    {
        using Flavor = UltraFlavor;
        using IO = stdlib::recursion::honk::DefaultIO<Flavor::CircuitBuilder>;
        HonkProof proof = create_mock_honk_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(),
                  ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) + IO::PUBLIC_INPUTS_SIZE);
    }
    {
        using Flavor = UltraZKFlavor;
        using IO = stdlib::recursion::honk::DefaultIO<Flavor::CircuitBuilder>;
        HonkProof proof = create_mock_honk_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(),
                  ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) + IO::PUBLIC_INPUTS_SIZE);
    }
    {
        using Flavor = UltraRollupFlavor;
        using IO = stdlib::recursion::honk::RollupIO;
        HonkProof proof = create_mock_honk_proof<Flavor, IO>();
        EXPECT_EQ(proof.size(),
                  ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) + IO::PUBLIC_INPUTS_SIZE);
    }
}

// TODO(@fcarreiro): Re-enable this test once proof size is fixed.
TEST_F(MockVerifierInputsTest, DISABLED_MockAVMProofSize)
{
    const HonkProof avm_proof = create_mock_avm_proof_without_pub_inputs(/*add_padding=*/false);
    EXPECT_EQ(avm_proof.size(), 16040);
}

TEST_F(MockVerifierInputsTest, MockAVMProofSizePadded)
{
    const HonkProof padded_avm_proof = create_mock_avm_proof_without_pub_inputs(/*add_padding=*/true);
    EXPECT_EQ(padded_avm_proof.size(), 16200);
}

/**
 * @brief Check that mock Chonk proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockChonkProofSize)
{
    using Builder = MegaCircuitBuilder;
    HonkProof chonk_proof = create_mock_chonk_proof<Builder>();
    EXPECT_EQ(chonk_proof.size(), ChonkProof::PROOF_LENGTH);
}

/**
 * @brief Check that mock MultilinearBatching proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockMultilinearBatchingProofSize)
{
    using Flavor = MultilinearBatchingFlavor;
    HonkProof batching_proof = create_mock_multilinear_batch_proof();
    EXPECT_EQ(batching_proof.size(), ProofLength::MultilinearBatching<Flavor>::LENGTH);
}
