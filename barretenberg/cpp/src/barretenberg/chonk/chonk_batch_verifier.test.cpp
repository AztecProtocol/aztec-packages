#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"

using namespace bb;

static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

class ChonkBatchVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_chonk_proof(
        size_t num_app_circuits = 1)
    {
        CircuitProducer circuit_producer(num_app_circuits);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        Chonk ivc{ num_circuits };

        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }
};

TEST_F(ChonkBatchVerifierTests, BatchVerifyTwoValidProofs)
{
    auto [proof1, vk1] = generate_chonk_proof();
    auto [proof2, vk2] = generate_chonk_proof();

    std::vector<ChonkBatchVerifier::Input> inputs = {
        { std::move(proof1), vk1 },
        { std::move(proof2), vk2 },
    };
    EXPECT_TRUE(ChonkBatchVerifier::verify(inputs));
}

TEST_F(ChonkBatchVerifierTests, BatchVerifySingleProof)
{
    auto [proof, vk] = generate_chonk_proof();

    std::vector<ChonkBatchVerifier::Input> inputs = {
        { std::move(proof), vk },
    };
    EXPECT_TRUE(ChonkBatchVerifier::verify(inputs));
}

/**
 * @brief Tamper with only the IPA proof, keeping all other proof components valid.
 * @details Targets the batch IPA verification path (Phase 2 of ChonkBatchVerifier).
 */
TEST_F(ChonkBatchVerifierTests, BatchVerifyTamperedIPAProof)
{
    BB_DISABLE_ASSERTS();

    auto [proof1, vk1] = generate_chonk_proof();
    auto [proof2, vk2] = generate_chonk_proof();

    // Corrupt a field element in the IPA proof portion of the goblin proof
    ASSERT_FALSE(proof2.goblin_proof.ipa_proof.empty());
    proof2.goblin_proof.ipa_proof[0] = proof2.goblin_proof.ipa_proof[0] + bb::fr(1);

    std::vector<ChonkBatchVerifier::Input> inputs = {
        { std::move(proof1), vk1 },
        { std::move(proof2), vk2 },
    };
    EXPECT_FALSE(ChonkBatchVerifier::verify(inputs));
}

/**
 * @brief Swap goblin proofs between two valid Chonk proofs to test non-IPA verification failures.
 */
TEST_F(ChonkBatchVerifierTests, BatchVerifySwappedGoblinProofs)
{
    BB_DISABLE_ASSERTS();

    auto [proof1, vk1] = generate_chonk_proof();
    auto [proof2, vk2] = generate_chonk_proof();

    // Swap goblin proofs: each mega_proof is now paired with the wrong goblin proof
    std::swap(proof1.goblin_proof, proof2.goblin_proof);

    std::vector<ChonkBatchVerifier::Input> inputs = {
        { std::move(proof1), vk1 },
        { std::move(proof2), vk2 },
    };
    EXPECT_FALSE(ChonkBatchVerifier::verify(inputs));
}
