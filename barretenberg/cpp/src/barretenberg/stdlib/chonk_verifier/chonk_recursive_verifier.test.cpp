#include "barretenberg/stdlib/chonk_verifier/chonk_recursive_verifier.hpp"
#include "barretenberg/chonk/test_bench_shared.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {
class ChonkRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ChonkVerifier = ChonkRecursiveVerifier;
    using Proof = SumcheckChonk::Proof;
    using StdlibProof = ChonkVerifier::StdlibProof;
    using RollupFlavor = UltraRollupRecursiveFlavor_<Builder>;
    using NativeFlavor = RollupFlavor::NativeFlavor;
    using UltraRecursiveVerifier = UltraRecursiveVerifier_<RollupFlavor>;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using IVCVerificationKey = SumcheckChonk::VerificationKey;
    using PairingAccumulator = PairingPoints<Builder>;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ChonkProverOutput {
        Proof proof;
        IVCVerificationKey ivc_vk;
    };

    /**
     * @brief Construct a genuine LegacyChonk prover output based on accumulation of an arbitrary set of mock
     * circuits
     *
     */
    static ChonkProverOutput construct_chonk_prover_output(const size_t num_app_circuits = 1)
    {
        // Construct and accumulate a series of mocked private function execution circuits
        MockCircuitProducer circuit_producer{ num_app_circuits };
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        SumcheckChonk ivc{ NUM_CIRCUITS };

        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        return { ivc.prove(), ivc.get_vk() };
    }
};

/**
 * @brief Ensure the LegacyChonk proof used herein can be natively verified
 *
 */
TEST_F(ChonkRecursionTests, NativeVerification)
{
    auto [proof, vk] = construct_chonk_prover_output();

    // Confirm that the IVC proof can be natively verified
    EXPECT_TRUE(SumcheckChonk::verify(proof, vk));
}

/**
 * @brief Construct and Check a recursive LegacyChonk verification circuit
 *
 */
TEST_F(ChonkRecursionTests, Basic)
{
    using ChonkRecVerifierOutput = ChonkRecursiveVerifier::Output;

    // Generate a genuine LegacyChonk prover output
    auto [proof, vk] = construct_chonk_prover_output();

    // Construct the LegacyChonk recursive verifier
    Builder builder;
    ChonkVerifier verifier{ &builder, vk.mega };

    // Generate the recursive verification circuit
    StdlibProof stdlib_proof(builder, proof);
    ChonkRecVerifierOutput output = verifier.verify(stdlib_proof);

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Print the number of gates post finalization
    info("Recursive Verifier: finalized num gates = ", builder.num_gates());
}
} // namespace bb::stdlib::recursion::honk
