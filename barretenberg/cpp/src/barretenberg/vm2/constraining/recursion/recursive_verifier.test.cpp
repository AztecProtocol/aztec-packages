#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/verifier.hpp"
#include "barretenberg/vm2/proving_helper.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

#include <gtest/gtest.h>

namespace bb::avm2::constraining {

class AvmRecursiveTests : public ::testing::Test {
  public:
    using RecursiveFlavor = AvmRecursiveFlavor;
    using InnerProver = AvmProvingHelper;
    using InnerVerifier = AvmVerifier;
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct NativeProofResult {
        typename InnerProver::Proof proof;
        std::vector<std::vector<FF>> public_inputs_cols;
    };

    // Helper function to create and verify native proof. Due to the way ASSERT_TRUE
    // works, this routine needs to return void and therefore we feed proof_result
    // by reference.
    static void create_and_verify_native_proof(NativeProofResult& proof_result)
    {
        static auto [cached_verified, cached_proof_result] = []() {
            auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

            const auto public_inputs_cols = public_inputs.to_columns();

            InnerProver prover;
            const auto proof = prover.prove(std::move(trace));
            InnerVerifier verifier;

            const bool verified = verifier.verify_proof(proof, public_inputs_cols);

            return std::pair<bool, NativeProofResult>{ verified, NativeProofResult{ proof, public_inputs_cols } };
        }();

        ASSERT_TRUE(cached_verified) << "native proof verification failed";
        proof_result = cached_proof_result;
    }
};

// Parameterized test class for testing with and without proof padding
class AvmRecursiveTestsParameterized : public AvmRecursiveTests, public ::testing::WithParamInterface<bool> {};

/**
 * @brief A test of the Two Layer AVM recursive verifier.
 * @details Constructs a simple AVM circuit for which a proof is verified using the Two Layer AVM recursive verifier. A
 * proof is constructed and verified for the outer (Ultra) circuit produced by this algorithm. See the documentation in
 * TwoLayerAvmRecursiveVerifier for details of the recursive verification algorithm.
 *
 * When pad_proof=true (Padded variant), the proof is padded to AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED to match production
 * behavior where TypeScript pads the proof before passing it to noir circuits.
 */
TEST_P(AvmRecursiveTestsParameterized, TwoLayerAvmRecursion)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    const bool pad_proof = GetParam();

    // Type aliases specific to TwoLayerAvmRecursion test
    using OuterBuilder = typename UltraFlavor::CircuitBuilder;
    using UltraFF = UltraRecursiveFlavor_<OuterBuilder>::FF;
    using UltraRollupProver = UltraProver_<UltraFlavor>;
    using NativeVerifierCommitmentKey = typename AvmFlavor::VerifierCommitmentKey;

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, public_inputs_cols] = proof_result;

    // Optionally pad the proof to match production behavior
    if (pad_proof) {
        std::cout << "Padding proof from " << proof.size() << " to " << AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED
                  << " fields" << std::endl;
        ASSERT_LE(proof.size(), AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) << "Proof exceeds padded length";
        proof.resize(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, 0);
    }

    // Construct stdlib representations of the proof, public inputs and verification key
    OuterBuilder outer_circuit;
    stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, proof);

    std::vector<std::vector<UltraFF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_cols.size());
    for (const auto& vec : public_inputs_cols) {
        std::vector<UltraFF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& val : vec) {
            vec_ct.push_back(UltraFF::from_witness(&outer_circuit, val));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    auto verifier_output = [&]() {
        std::cout << "Constructing AvmRecursiveVerifier and verifying " << (pad_proof ? "padded " : "") << "proof..."
                  << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        TwoLayerAvmRecursiveVerifier avm_rec_verifier(outer_circuit);
        auto result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
        return result;
    }();

    stdlib::recursion::honk::RollupIO inputs;
    inputs.pairing_inputs = verifier_output.points_accumulator;
    inputs.ipa_claim = verifier_output.ipa_claim;
    inputs.set_public();
    outer_circuit.ipa_proof = verifier_output.ipa_proof.get_value();

    // Ensure that the pairing check is satisfied on the outputs of the recursive verifier
    NativeVerifierCommitmentKey pcs_vkey{};
    bool agg_output_valid = pcs_vkey.pairing_check(verifier_output.points_accumulator.P0().get_value(),
                                                   verifier_output.points_accumulator.P1().get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    vinfo("Recursive verifier",
          (pad_proof ? " (padded proof)" : ""),
          ": finalized num gates = ",
          outer_circuit.num_gates());

    // Construct and verify an Ultra Rollup proof of the AVM recursive verifier circuit. This proof carries an IPA claim
    // from ECCVM recursive verification in its public inputs that will be verified as part of the UltraRollupVerifier.
    auto outer_proving_key = std::make_shared<ProverInstance_<UltraFlavor>>(outer_circuit);

    // Scoped to free memory of UltraRollupProver.
    auto outer_proof = [&]() {
        auto verification_key = std::make_shared<UltraFlavor::VerificationKey>(outer_proving_key->get_precomputed());
        UltraRollupProver outer_prover(outer_proving_key, verification_key);
        return outer_prover.construct_proof();
    }();

    // Verify the proof of the Ultra circuit that verified the AVM recursive verifier circuit
    auto outer_verification_key = std::make_shared<UltraFlavor::VerificationKey>(outer_proving_key->get_precomputed());
    auto outer_vk_and_hash = std::make_shared<UltraFlavor::VKAndHash>(outer_verification_key);
    UltraRollupVerifier final_verifier(outer_vk_and_hash);

    bool result = final_verifier.verify_proof(outer_proof).result;
    EXPECT_TRUE(result);
}

// Test that the transcript operations performed during AVM recursive verification match the ones performed by the
// function defined in the AvmRecursiveFlavor::Transcript class
TEST_P(AvmRecursiveTestsParameterized, TranscriptOperations)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    using FF = stdlib::field_t<MegaCircuitBuilder>;

    const bool pad_proof = GetParam();

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, public_inputs_cols] = proof_result;

    // Optionally pad the proof to match production behavior
    if (pad_proof) {
        std::cout << "Padding proof from " << proof.size() << " to " << AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED
                  << " fields" << std::endl;
        ASSERT_LE(proof.size(), AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED) << "Proof exceeds padded length";
        proof.resize(AVM_V2_PROOF_LENGTH_IN_FIELDS_PADDED, 0);
    }

    // Construct stdlib representations of the proof, public inputs and verification key
    MegaCircuitBuilder builder;
    stdlib::Proof<MegaCircuitBuilder> stdlib_proof(builder, proof);

    std::vector<std::vector<FF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_cols.size());
    for (const auto& vec : public_inputs_cols) {
        std::vector<FF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& val : vec) {
            vec_ct.push_back(FF::from_witness(&builder, val));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    FF final_state_full_verification;
    auto transcript = std::make_shared<AvmRecursiveFlavor::Transcript>();
    transcript->enable_manifest();
    {
        std::cout << "Constructing AvmRecursiveVerifier and verifying proof..." << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        AvmRecursiveVerifier avm_rec_verifier(builder, transcript);
        [[maybe_unused]] auto _result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
        final_state_full_verification = avm_rec_verifier.hash_avm_transcript(stdlib_proof);
    };

    // Perform only transcript operations
    FF final_state_transcript_operations_only;
    auto mocked_transcript = std::make_shared<AvmRecursiveFlavor::Transcript>();
    {
        std::tie(final_state_transcript_operations_only, mocked_transcript) =
            AvmRecursiveFlavor::Transcript::hash_avm_transcript_for_testing(builder, stdlib_proof, public_inputs_ct);
    }

    // Check that the native values underlying the final states match
    EXPECT_EQ(final_state_full_verification.get_value(), final_state_transcript_operations_only.get_value());

    // Check consistency of the transcripts
    auto manifest = transcript->get_manifest();
    auto mocked_manifest = mocked_transcript->get_manifest();

    BB_ASSERT_GT(manifest.size(), 0U);
    BB_ASSERT_EQ(manifest.size(), mocked_manifest.size());
    for (size_t round = 0; round < manifest.size(); ++round) {
        ASSERT_EQ(manifest[round], mocked_manifest[round])
            << std::format("Real/Mocked manifest discrepancy in round {}", round);
    }

    // Check that the circuit is satisfied
    final_state_transcript_operations_only.assert_equal(final_state_full_verification);
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_TRUE(!builder.failed());
}

INSTANTIATE_TEST_SUITE_P(PaddingVariants,
                         AvmRecursiveTestsParameterized,
                         ::testing::Values(false, true),
                         [](const auto& info) { return info.param ? "Padded" : "Unpadded"; });

// Ensures that the recursive verifier fails with wrong PIs.
TEST_F(AvmRecursiveTests, TwoLayerAvmRecursionFailsWithWrongPIs)
{
    if (testing::skip_slow_tests()) {
        GTEST_SKIP() << "Skipping slow test";
    }

    // Type aliases specific to TwoLayerAvmRecursion test
    using OuterBuilder = typename UltraFlavor::CircuitBuilder;
    using UltraFF = UltraRecursiveFlavor_<OuterBuilder>::FF;

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, public_inputs_cols] = proof_result;

    // Construct stdlib representations of the proof, public inputs and verification key
    OuterBuilder outer_circuit;
    stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, proof);

    std::vector<std::vector<UltraFF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_cols.size());
    for (const auto& vec : public_inputs_cols) {
        std::vector<UltraFF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& val : vec) {
            vec_ct.push_back(UltraFF::from_witness(&outer_circuit, val));
        }
        public_inputs_ct.push_back(vec_ct);
    }
    // Mutate a PI entry to verify that validation correctly fails with incorrect public inputs
    public_inputs_ct[1][5] += 1;

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    {
        std::cout << "Constructing AvmRecursiveVerifier and verifying proof..." << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        TwoLayerAvmRecursiveVerifier avm_rec_verifier(outer_circuit);
        auto result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
    };

    ASSERT_TRUE(outer_circuit.failed()) << "Outer circuit SHOULD fail with bad PIs.";
}

} // namespace bb::avm2::constraining
