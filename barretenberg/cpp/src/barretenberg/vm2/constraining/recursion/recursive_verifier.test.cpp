#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/constraining/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
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

    // Helper function to create and verify native proof
    struct NativeProofResult {
        using AvmVerificationKey = AvmFlavor::VerificationKey;
        typename InnerProver::Proof proof;
        std::shared_ptr<AvmVerificationKey> verification_key;
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
            const auto [proof, vk_data] = prover.prove(std::move(trace));
            const auto verification_key = InnerProver::create_verification_key(vk_data);
            InnerVerifier verifier(verification_key);

            const bool verified = verifier.verify_proof(proof, public_inputs_cols);

            return std::pair<bool, NativeProofResult>{
                verified, NativeProofResult{ proof, verification_key, public_inputs_cols }
            };
        }();

        ASSERT_TRUE(cached_verified) << "native proof verification failed";
        proof_result = cached_proof_result;
    }
};

/**
 * @brief A test of the Goblinized AVM recursive verifier.
 * @details Constructs a simple AVM circuit for which a proof is verified using the Goblinized AVM recursive verifier. A
 * proof is constructed and verified for the outer (Ultra) circuit produced by this algorithm. See the documentation in
 * AvmGoblinRecursiveVerifier for details of the recursive verification algorithm.
 *
 */
TEST_F(AvmRecursiveTests, GoblinRecursion)
{
    // Type aliases specific to GoblinRecursion test
    using AvmRecursiveVerifier = AvmGoblinRecursiveVerifier;
    using OuterBuilder = typename UltraRollupFlavor::CircuitBuilder;
    using UltraFF = UltraRecursiveFlavor_<OuterBuilder>::FF;
    using UltraRollupProver = UltraProver_<UltraRollupFlavor>;
    using NativeVerifierCommitmentKey = typename AvmFlavor::VerifierCommitmentKey;

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, verification_key, public_inputs_cols] = proof_result;
    proof.insert(proof.begin(), 0); // TODO(#14234)[Unconditional PIs validation]: remove this

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

    auto key_fields_native = verification_key->to_field_elements();
    std::vector<UltraFF> outer_key_fields;
    for (const auto& f : key_fields_native) {
        UltraFF val = UltraFF::from_witness(&outer_circuit, f);
        outer_key_fields.push_back(val);
    }

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    auto verifier_output = [&]() {
        std::cout << "Constructing AvmRecursiveVerifier and verifying proof..." << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        AvmRecursiveVerifier avm_rec_verifier(outer_circuit, outer_key_fields);
        auto result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
        return result;
    }();

    verifier_output.points_accumulator.set_public();
    verifier_output.ipa_claim.set_public();
    outer_circuit.ipa_proof = verifier_output.ipa_proof.get_value();

    // Ensure that the pairing check is satisfied on the outputs of the recursive verifier
    NativeVerifierCommitmentKey pcs_vkey{};
    bool agg_output_valid = pcs_vkey.pairing_check(verifier_output.points_accumulator.P0.get_value(),
                                                   verifier_output.points_accumulator.P1.get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // Construct and verify an Ultra Rollup proof of the AVM recursive verifier circuit. This proof carries an IPA claim
    // from ECCVM recursive verification in its public inputs that will be verified as part of the UltraRollupVerifier.
    auto outer_proving_key = std::make_shared<ProverInstance_<UltraRollupFlavor>>(outer_circuit);

    // Scoped to free memory of UltraRollupProver.
    auto outer_proof = [&]() {
        auto verification_key =
            std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->get_precomputed());
        UltraRollupProver outer_prover(outer_proving_key, verification_key);
        return outer_prover.construct_proof();
    }();

    // Verify the proof of the Ultra circuit that verified the AVM recursive verifier circuit
    auto outer_verification_key =
        std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->get_precomputed());
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

    bool result = final_verifier.template verify_proof<bb::RollupIO>(outer_proof, outer_proving_key->ipa_proof).result;
    EXPECT_TRUE(result);
}

// Similar to GoblinRecursion, but with PI validation disabled and garbage PIs in the public inputs.
// This is important as long as we use a fallback mechanism for the AVM proofs.
TEST_F(AvmRecursiveTests, GoblinRecursionWithoutPIValidation)
{
    // Type aliases specific to GoblinRecursion test
    using AvmRecursiveVerifier = AvmGoblinRecursiveVerifier;
    using OuterBuilder = typename UltraRollupFlavor::CircuitBuilder;
    using UltraFF = UltraRecursiveFlavor_<OuterBuilder>::FF;
    using UltraRollupProver = UltraProver_<UltraRollupFlavor>;
    using NativeVerifierCommitmentKey = typename AvmFlavor::VerifierCommitmentKey;

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, verification_key, public_inputs_cols] = proof_result;
    // Set fallback / disable PI validation
    proof.insert(proof.begin(),
                 1); // TODO(#14234)[Unconditional PIs validation]: PI validation is disabled for this test.

    // Construct stdlib representations of the proof, public inputs and verification key
    OuterBuilder outer_circuit;
    stdlib::Proof<OuterBuilder> stdlib_proof(outer_circuit, proof);

    std::vector<std::vector<UltraFF>> public_inputs_ct;
    public_inputs_ct.reserve(public_inputs_cols.size());
    // Use GARBAGE in public inputs and confirm that PI validation is disabled!
    for (const auto& vec : public_inputs_cols) {
        std::vector<UltraFF> vec_ct;
        vec_ct.reserve(vec.size());
        for (const auto& _ : vec) {
            vec_ct.push_back(UltraFF::from_witness(&outer_circuit, FF::random_element()));
        }
        public_inputs_ct.push_back(vec_ct);
    }

    auto key_fields_native = verification_key->to_field_elements();
    std::vector<UltraFF> outer_key_fields;
    for (const auto& f : key_fields_native) {
        UltraFF val = UltraFF::from_witness(&outer_circuit, f);
        outer_key_fields.push_back(val);
    }

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    auto verifier_output = [&]() {
        std::cout << "Constructing AvmRecursiveVerifier and verifying proof..." << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        AvmRecursiveVerifier avm_rec_verifier(outer_circuit, outer_key_fields);
        auto result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
        return result;
    }();

    verifier_output.points_accumulator.set_public();
    verifier_output.ipa_claim.set_public();
    outer_circuit.ipa_proof = verifier_output.ipa_proof.get_value();

    // Ensure that the pairing check is satisfied on the outputs of the recursive verifier
    NativeVerifierCommitmentKey pcs_vkey{};
    bool agg_output_valid = pcs_vkey.pairing_check(verifier_output.points_accumulator.P0.get_value(),
                                                   verifier_output.points_accumulator.P1.get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // Construct and verify an Ultra Rollup proof of the AVM recursive verifier circuit. This proof carries an IPA claim
    // from ECCVM recursive verification in its public inputs that will be verified as part of the UltraRollupVerifier.
    auto outer_proving_key = std::make_shared<ProverInstance_<UltraRollupFlavor>>(outer_circuit);

    // Scoped to free memory of UltraRollupProver.
    auto outer_proof = [&]() {
        auto verification_key =
            std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->get_precomputed());
        UltraRollupProver outer_prover(outer_proving_key, verification_key);
        return outer_prover.construct_proof();
    }();

    // Verify the proof of the Ultra circuit that verified the AVM recursive verifier circuit
    auto outer_verification_key =
        std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->get_precomputed());
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

    bool result = final_verifier.template verify_proof<bb::RollupIO>(outer_proof, outer_proving_key->ipa_proof).result;
    EXPECT_TRUE(result);
}

// Ensures that the recursive verifier fails with wrong PIs.
TEST_F(AvmRecursiveTests, GoblinRecursionFailsWithWrongPIs)
{
    // Type aliases specific to GoblinRecursion test
    using AvmRecursiveVerifier = AvmGoblinRecursiveVerifier;
    using OuterBuilder = typename UltraRollupFlavor::CircuitBuilder;
    using UltraFF = UltraRecursiveFlavor_<OuterBuilder>::FF;

    NativeProofResult proof_result;
    std::cout << "Creating and verifying native proof..." << std::endl;
    std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });
    std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
    std::cout << "Time taken (native proof): " << std::chrono::duration_cast<std::chrono::seconds>(end - start).count()
              << "s" << std::endl;

    auto [proof, verification_key, public_inputs_cols] = proof_result;
    // PI validation is enabled.
    proof.insert(proof.begin(), 0); // TODO(#14234)[Unconditional PIs validation]: remove this

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
    // Mutate some PI entry so that we can confirm that PI validation is enabled and fails!
    public_inputs_ct[1][5] += 1;

    auto key_fields_native = verification_key->to_field_elements();
    std::vector<UltraFF> outer_key_fields;
    for (const auto& f : key_fields_native) {
        UltraFF val = UltraFF::from_witness(&outer_circuit, f);
        outer_key_fields.push_back(val);
    }

    // Construct the AVM recursive verifier and verify the proof
    // Scoped to free memory of AvmRecursiveVerifier.
    {
        std::cout << "Constructing AvmRecursiveVerifier and verifying proof..." << std::endl;
        std::chrono::steady_clock::time_point start = std::chrono::steady_clock::now();
        AvmRecursiveVerifier avm_rec_verifier(outer_circuit, outer_key_fields);
        auto result = avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
        std::chrono::steady_clock::time_point end = std::chrono::steady_clock::now();
        std::cout << "Time taken (recursive verification): "
                  << std::chrono::duration_cast<std::chrono::seconds>(end - start).count() << "s" << std::endl;
    };

    ASSERT_TRUE(outer_circuit.failed()) << "Outer circuit SHOULD fail with bad PIs.";
}

} // namespace bb::avm2::constraining
