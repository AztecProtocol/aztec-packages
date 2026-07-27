#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/honk/proof_length.hpp"

#include <gtest/gtest.h>

using namespace acir_format;
using namespace bb;

class MockVerifierInputsTest : public ::testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Static assertions for proof size constants that must stay in sync with Noir (constants.nr)
// These constants are used by Noir protocol circuits and TypeScript

// Public input component sizes (used in Noir)
static_assert(PAIRING_POINTS_SIZE == 8, "PAIRING_POINTS_SIZE changed - update constants.nr");
static_assert(GRUMPKIN_OPENING_CLAIM_SIZE == 6, "IPA_CLAIM_SIZE changed - update constants.nr");
static_assert(HIDING_KERNEL_PUBLIC_INPUTS_SIZE == 28,
              "HIDING_KERNEL_IO_PUBLIC_INPUTS_SIZE changed - update constants.nr");

// Component proof lengths (used in Noir)
static_assert(MERGE_PROOF_SIZE == 41,
              "MERGE_PROOF_SIZE changed - update CHONK_MERGE_PROOF_SIZE in constants.nr "
              "and run barretenberg/cpp/scripts/remake-constants.sh");
static_assert(ECCVMFlavor::PROOF_LENGTH == 556,
              "ECCVM proof size changed - update CHONK_ECCVM_PROOF_LENGTH in constants.nr "
              "and run barretenberg/cpp/scripts/remake-constants.sh");
static_assert(ECCVMFlavor::TRIPLE_IPA_PROOF_LENGTH == 70, "TripleIPA proof size changed - update constants.nr");
static_assert(IPA_PROOF_LENGTH == 64, "IPA_PROOF_LENGTH changed - update constants.nr");
static_assert(TranslatorFlavor::PROOF_LENGTH == 483, "Translator proof size changed - update constants.nr");

// Full proof lengths (used in Noir)
static_assert(
    ProofLength::Honk<UltraFlavor>::expected_proof_size<stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(
        UltraFlavor::VIRTUAL_LOG_N) == 410,
    "RECURSIVE_PROOF_LENGTH changed - update constants.nr");
static_assert(ChonkProof::PROOF_LENGTH == 1221, "CHONK_PROOF_LENGTH changed - update constants.nr");
static_assert(ChonkProof::HIDING_OINK_LENGTH == 48,
              "ChonkProof::HIDING_OINK_LENGTH changed - update CHONK_HIDING_OINK_LENGTH in constants.nr "
              "and run barretenberg/cpp/scripts/remake-constants.sh");
static_assert(ChonkProof::JOINT_PROOF_LENGTH == 478,
              "ChonkProof::JOINT_PROOF_LENGTH changed - update CHONK_JOINT_PROOF_LENGTH in constants.nr "
              "and run barretenberg/cpp/scripts/remake-constants.sh");
static_assert(MegaAppFlavor::VerificationKey::calc_num_data_types() == 151,
              "MEGA_APP_VK_LENGTH_IN_FIELDS changed - update constants.nr");
static_assert(MegaKernelFlavor::VerificationKey::calc_num_data_types() == 151,
              "MEGA_KERNEL_VK_LENGTH_IN_FIELDS changed - update constants.nr");
static_assert(MegaZKFlavor::VerificationKey::calc_num_data_types() == 119,
              "MEGA_ZK_VK_LENGTH_IN_FIELDS changed - update constants.nr");
static_assert(ProofLength::MultilinearBatching<MultilinearBatchingFlavor_<2>>::LENGTH == 78,
              "MultilinearBatching proof size changed - update constants.nr");

/**
 * @brief Check that mock merge proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockMergeProofSize)
{
    Goblin::MergeProof merge_proof = create_mock_merge_proof();
    EXPECT_EQ(merge_proof.size(), MERGE_PROOF_SIZE);
}

/**
 * @brief Check that mock batch merge proof has the expected size
 */
TEST_F(MockVerifierInputsTest, MockBatchMergeProofSize)
{
    HonkProof batch_merge_proof = create_mock_batch_merge_proof();
    EXPECT_EQ(batch_merge_proof.size(), BATCH_MERGE_PROOF_SIZE);
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
        using Flavor = UltraFlavor;
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
        using Flavor = UltraFlavor;
        using IO = stdlib::recursion::honk::RollupIO;
        HonkProof proof = create_mock_honk_proof<Flavor, IO>();
        // RollupIO has HasIPA=true, so proof includes IPA_PROOF_LENGTH
        constexpr size_t expected = ProofLength::Honk<Flavor>::LENGTH_WITHOUT_PUB_INPUTS(Flavor::VIRTUAL_LOG_N) +
                                    IO::PUBLIC_INPUTS_SIZE + IPA_PROOF_LENGTH;
        EXPECT_EQ(proof.size(), expected);
    }
}

TEST_F(MockVerifierInputsTest, MockAVMProofSize)
{
    const HonkProof avm_proof = create_mock_avm_proof_without_pub_inputs();
    EXPECT_EQ(avm_proof.size(), AVM_V2_PROOF_LENGTH_IN_FIELDS);
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
    using Flavor = MultilinearBatchingFlavor_<2>;
    HonkProof batching_proof = create_mock_multilinear_batch_proof(/*num_claims=*/2);
    EXPECT_EQ(batching_proof.size(), ProofLength::MultilinearBatching<Flavor>::LENGTH);
}
