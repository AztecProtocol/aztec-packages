#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/test_bench_shared.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {
class ClientIVCRecursionTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ClientIVCVerifier = ClientIVCRecursiveVerifier;
    using Proof = ClientIVC::Proof;
    using StdlibProof = ClientIVCVerifier::StdlibProof;
    using RollupFlavor = UltraRollupRecursiveFlavor_<Builder>;
    using NativeFlavor = RollupFlavor::NativeFlavor;
    using UltraRecursiveVerifier = UltraRecursiveVerifier_<RollupFlavor>;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using IVCVerificationKey = ClientIVC::VerificationKey;
    using PairingAccumulator = PairingPoints<Builder>;

    static constexpr TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ClientIVCProverOutput {
        Proof proof;
        IVCVerificationKey ivc_vk;
    };

    /**
     * @brief Construct a genuine ClientIVC prover output based on accumulation of an arbitrary set of mock circuits
     *
     */
    static ClientIVCProverOutput construct_client_ivc_prover_output(const size_t num_app_circuits = 1)
    {
        // Construct and accumulate a series of mocked private function execution circuits
        MockCircuitProducer circuit_producer{ num_app_circuits };
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ClientIVC ivc{ NUM_CIRCUITS, trace_settings };

        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        return { ivc.prove(), ivc.get_vk() };
    }
};

/**
 * @brief Ensure the ClientIVC proof used herein can be natively verified
 *
 */
TEST_F(ClientIVCRecursionTests, NativeVerification)
{
    auto [proof, vk] = construct_client_ivc_prover_output();

    // Confirm that the IVC proof can be natively verified
    EXPECT_TRUE(ClientIVC::verify(proof, vk));
}

/**
 * @brief Construct and Check a recursive ClientIVC verification circuit
 *
 */
TEST_F(ClientIVCRecursionTests, Basic)
{
    using CIVCRecVerifierOutput = ClientIVCRecursiveVerifier::Output;

    // Generate a genuine ClientIVC prover output
    auto [proof, vk] = construct_client_ivc_prover_output();

    // Construct the ClientIVC recursive verifier
    Builder builder;
    ClientIVCVerifier verifier{ &builder, vk.mega };

    // Generate the recursive verification circuit
    StdlibProof stdlib_proof(builder, proof);
    CIVCRecVerifierOutput output = verifier.verify(stdlib_proof);

    EXPECT_EQ(builder.failed(), false) << builder.err();

    EXPECT_TRUE(CircuitChecker::check(builder));

    // Print the number of gates post finalization
    info("Recursive Verifier: finalized num gates = ", builder.num_gates);
}
} // namespace bb::stdlib::recursion::honk
