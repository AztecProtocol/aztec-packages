#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {
class ChonkRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ChonkVerifier = ChonkRecursiveVerifier;
    using Proof = ChonkProof;
    using StdlibProof = ChonkStdlibProof;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using VKAndHash = MegaZKFlavor::VKAndHash;
    using PairingAccumulator = PairingPoints<Builder>;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ChonkProverOutput {
        Proof proof;
        std::shared_ptr<VKAndHash> vk_and_hash;
    };

    /**
     * @brief Construct a genuine Chonk prover output based on accumulation of an arbitrary set of mock
     * circuits
     *
     */
    static ChonkProverOutput construct_chonk_prover_output(const size_t num_app_circuits = 1)
    {
        // Construct and accumulate a series of mocked private function execution circuits
        MockCircuitProducer circuit_producer{ num_app_circuits };
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ circuit_producer.circuit_kinds() };

        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }
};

/**
 * @brief Ensure the Chonk proof used herein can be natively verified
 *
 */
TEST_F(ChonkRecursionTests, NativeVerification)
{
    auto [proof, vk_and_hash] = construct_chonk_prover_output();

    // Confirm that the IVC proof can be natively verified
    ChonkNativeVerifier verifier(vk_and_hash);
    EXPECT_TRUE(verifier.verify(proof));
}

TEST_F(ChonkRecursionTests, NativeVerifierCanBeReused)
{
    auto [proof, vk_and_hash] = construct_chonk_prover_output();
    ChonkNativeVerifier verifier(vk_and_hash);

    EXPECT_TRUE(verifier.verify(proof));
    EXPECT_TRUE(verifier.verify(proof));
}

/**
 * @brief A proof carrying trailing data the transcript never reads must be rejected.
 * @details The joint proof is the last segment loaded into the shared transcript, so an appended element is pure
 * trailing data: no subsequent read shifts and Fiat-Shamir is unaffected. The structural check rejects the
 * oversized segment before verification.
 */
TEST_F(ChonkRecursionTests, NativeVerificationRejectsTrailingProofData)
{
    auto [proof, vk_and_hash] = construct_chonk_prover_output();

    proof.joint_proof.push_back(fr::random_element());

    ChonkNativeVerifier verifier(vk_and_hash);
    EXPECT_FALSE(verifier.verify(proof));
}

/**
 * @brief A proof with a shifted segment boundary must be rejected even though the concatenated stream is unchanged.
 * @details Moving the first element of the ECCVM segment to the end of the merge segment leaves the concatenated
 * transcript stream identical, so every transcript read yields the same data and Fiat-Shamir is unaffected. Only
 * per-segment boundary enforcement (each sub-verifier consumes exactly its own segment) distinguishes the two
 * structurally different proofs.
 */
TEST_F(ChonkRecursionTests, NativeVerificationRejectsShiftedSegmentBoundary)
{
    auto [proof, vk_and_hash] = construct_chonk_prover_output();

    proof.merge_proof.push_back(proof.eccvm_proof.front());
    proof.eccvm_proof.erase(proof.eccvm_proof.begin());

    ChonkNativeVerifier verifier(vk_and_hash);
    EXPECT_FALSE(verifier.verify(proof));
}

/**
 * @brief Trailing data appended to the TripleIPA proof must be rejected.
 * @details The structural check covers the IPA segment even though its verification is deferred and uses a
 * separate transcript.
 */
TEST_F(ChonkRecursionTests, NativeVerificationRejectsTrailingIpaProofData)
{
    auto [proof, vk_and_hash] = construct_chonk_prover_output();

    proof.ipa_proof.push_back(fr::random_element());

    ChonkNativeVerifier verifier(vk_and_hash);
    EXPECT_FALSE(verifier.verify(proof));
}

/**
 * @brief Construct and Check a recursive Chonk verification circuit
 *
 */
TEST_F(ChonkRecursionTests, Basic)
{
    using ChonkRecVerifierOutput = ChonkVerifier::Output;

    // Generate a genuine Chonk prover output
    auto [proof, native_vk_and_hash] = construct_chonk_prover_output();

    // Construct the Chonk recursive verifier
    Builder builder;
    auto recursive_vk_and_hash = std::make_shared<ChonkVerifier::VKAndHash>(builder, native_vk_and_hash->vk);
    ChonkVerifier verifier{ recursive_vk_and_hash };

    // Generate the recursive verification circuit
    StdlibProof stdlib_proof(builder, proof);
    ChonkRecVerifierOutput output = verifier.verify(stdlib_proof);

    EXPECT_TRUE(output.all_checks_passed);
    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Print the number of gates post finalization
    info("Recursive Verifier: finalized num gates = ", builder.get_num_finalized_gates_inefficient());
}
} // namespace bb::stdlib::recursion::honk
