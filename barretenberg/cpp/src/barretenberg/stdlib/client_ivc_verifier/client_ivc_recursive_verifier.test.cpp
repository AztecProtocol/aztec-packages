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
    static ClientIVCProverOutput construct_client_ivc_prover_output(ClientIVC& ivc)
    {
        // Construct and accumulate a series of mocked private function execution circuits
        MockCircuitProducer circuit_producer;

        for (size_t idx = 0; idx < ivc.get_num_circuits(); ++idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc);
            ivc.accumulate(circuit);
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
    size_t NUM_CIRCUITS = 2;
    ClientIVC ivc{ NUM_CIRCUITS, trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Confirm that the IVC proof can be natively verified
    EXPECT_TRUE(ivc.verify(proof));
}

/**
 * @brief Construct and Check a recursive ClientIVC verification circuit
 *
 */
TEST_F(ClientIVCRecursionTests, Basic)
{
    using CIVCRecVerifierOutput = ClientIVCRecursiveVerifier::Output;

    // Generate a genuine ClientIVC prover output
    const size_t NUM_CIRCUITS = 2;

    ClientIVC ivc{ NUM_CIRCUITS, trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Construct the ClientIVC recursive verifier
    auto builder = std::make_shared<Builder>();
    ClientIVCVerifier verifier{ builder, ivc_vk };

    // Generate the recursive verification circuit
    StdlibProof stdlib_proof(*builder, proof);
    CIVCRecVerifierOutput output = verifier.verify(stdlib_proof);

    EXPECT_EQ(builder->failed(), false) << builder->err();

    EXPECT_TRUE(CircuitChecker::check(*builder));

    // Print the number of gates post finalisation
    info("Recursive Verifier: finalised num gates = ", builder->num_gates);
}

TEST_F(ClientIVCRecursionTests, ClientTubeBase)
{
    using CIVCRecVerifierOutput = ClientIVCRecursiveVerifier::Output;

    // Generate a genuine ClientIVC prover output
    const size_t NUM_CIRCUITS = 2;

    ClientIVC ivc{ NUM_CIRCUITS, trace_settings };
    auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

    // Construct the ClientIVC recursive verifier
    auto tube_builder = std::make_shared<Builder>();
    ClientIVCVerifier verifier{ tube_builder, ivc_vk };

    // Generate the recursive verification circuit
    StdlibProof stdlib_proof(*tube_builder, proof);
    CIVCRecVerifierOutput client_ivc_rec_verifier_output = verifier.verify(stdlib_proof);

    client_ivc_rec_verifier_output.points_accumulator.set_public();
    // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
    client_ivc_rec_verifier_output.opening_claim.set_public();
    tube_builder->ipa_proof = client_ivc_rec_verifier_output.ipa_proof.get_value();

    info("ClientIVC Recursive Verifier: num prefinalized gates = ", tube_builder->num_gates);

    EXPECT_EQ(tube_builder->failed(), false) << tube_builder->err();

    // EXPECT_TRUE(CircuitChecker::check(*tube_builder));

    // Construct and verify a proof for the ClientIVC Recursive Verifier circuit
    auto proving_key = std::make_shared<DeciderProvingKey_<NativeFlavor>>(*tube_builder);
    auto native_vk_with_ipa = std::make_shared<NativeFlavor::VerificationKey>(proving_key->get_precomputed());
    UltraProver_<NativeFlavor> tube_prover{ proving_key, native_vk_with_ipa };
    // Prove the CIVCRecursiveVerifier circuit
    auto native_tube_proof = tube_prover.construct_proof();

    // Natively verify the tube proof
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    UltraVerifier_<NativeFlavor> native_verifier(native_vk_with_ipa, ipa_verification_key);
    EXPECT_TRUE(native_verifier.verify_proof(native_tube_proof, tube_prover.proving_key->ipa_proof));

    // Construct a base rollup circuit that recursively verifies the tube proof and forwards the IPA proof.
    Builder base_builder;
    auto tube_vk = std::make_shared<NativeFlavor::VerificationKey>(proving_key->get_precomputed());
    auto stdlib_tube_vk_and_hash = std::make_shared<RollupFlavor::VKAndHash>(base_builder, tube_vk);
    stdlib::Proof<Builder> base_tube_proof(base_builder, native_tube_proof);
    UltraRecursiveVerifier base_verifier{ &base_builder, stdlib_tube_vk_and_hash };
    UltraRecursiveVerifierOutput<Builder> output = base_verifier.verify_proof(base_tube_proof);
    info("Tube UH Recursive Verifier: num prefinalized gates = ", base_builder.num_gates);
    output.points_accumulator.set_public();
    output.ipa_claim.set_public();
    base_builder.ipa_proof = tube_prover.proving_key->ipa_proof;
    EXPECT_EQ(base_builder.failed(), false) << base_builder.err();
    EXPECT_TRUE(CircuitChecker::check(base_builder));

    // Natively verify the IPA proof for the base rollup circuit
    auto base_proving_key = std::make_shared<DeciderProvingKey_<NativeFlavor>>(base_builder);
    auto ipa_transcript = std::make_shared<NativeTranscript>();
    ipa_transcript->load_proof(base_proving_key->ipa_proof);
    IPA<curve::Grumpkin>::reduce_verify(
        ipa_verification_key, output.ipa_claim.get_native_opening_claim(), ipa_transcript);
}

// Ensure that the Client IVC Recursive Verifier Circuit does not depend on the Client IVC input
TEST_F(ClientIVCRecursionTests, TubeVKIndependentOfInputCircuits)
{
    // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
    auto get_blocks = [](size_t inner_size)
        -> std::tuple<typename Builder::ExecutionTrace, std::shared_ptr<NativeFlavor::VerificationKey>> {
        ClientIVC ivc{ inner_size, trace_settings };

        auto [proof, ivc_vk] = construct_client_ivc_prover_output(ivc);

        auto tube_builder = std::make_shared<Builder>();
        ClientIVCVerifier verifier{ tube_builder, ivc_vk };

        StdlibProof stdlib_proof(*tube_builder, proof);
        auto client_ivc_rec_verifier_output = verifier.verify(stdlib_proof);

        client_ivc_rec_verifier_output.points_accumulator.set_public();
        // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
        client_ivc_rec_verifier_output.opening_claim.set_public();
        tube_builder->ipa_proof = client_ivc_rec_verifier_output.ipa_proof.get_value();

        info("ClientIVC Recursive Verifier: num prefinalized gates = ", tube_builder->num_gates);

        EXPECT_EQ(tube_builder->failed(), false) << tube_builder->err();

        // Construct and verify a proof for the ClientIVC Recursive Verifier circuit
        auto proving_key = std::make_shared<DeciderProvingKey_<NativeFlavor>>(*tube_builder);

        auto tube_vk = std::make_shared<NativeFlavor::VerificationKey>(proving_key->get_precomputed());

        return { tube_builder->blocks, tube_vk };
    };

    auto [blocks_2, verification_key_2] = get_blocks(2);
    auto [blocks_4, verification_key_4] = get_blocks(4);

    compare_ultra_blocks_and_verification_keys<NativeFlavor>({ blocks_2, blocks_4 },
                                                             { verification_key_2, verification_key_4 });
}
} // namespace bb::stdlib::recursion::honk
