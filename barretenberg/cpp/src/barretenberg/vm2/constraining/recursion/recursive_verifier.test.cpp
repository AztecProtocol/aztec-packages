#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
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
    using RecursiveFlavor = AvmRecursiveFlavor_<UltraCircuitBuilder>;
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
        auto [trace, public_inputs] = testing::get_minimal_trace_with_pi();

        InnerProver prover;
        const auto [proof, vk_data] = prover.prove(std::move(trace));
        const auto verification_key = prover.create_verification_key(vk_data);
        InnerVerifier verifier(verification_key);

        const auto public_inputs_cols = public_inputs.to_columns();
        const bool verified = verifier.verify_proof(proof, public_inputs_cols);

        // Should be in principle ASSERT_TRUE, but compiler does not like it.
        EXPECT_TRUE(verified) << "native proof verification failed";

        proof_result = { proof, verification_key, public_inputs_cols };
    }
};

// TODO: Makes more sense to migrate this one over a Mega-arithmetized AVM recursive verifier?
/**
 * @brief A test of the "vanilla" Ultra-arithmetized AVM recursive verifier.
 *
 */
TEST_F(AvmRecursiveTests, StandardRecursion)
{
    using RecursiveVerifier = AvmRecursiveVerifier_<RecursiveFlavor>;
    using OuterProver = UltraProver;
    using OuterVerifier = UltraVerifier;
    using OuterDeciderProvingKey = DeciderProvingKey_<UltraFlavor>;
    using NativeVerifierCommitmentKey = typename AvmFlavor::VerifierCommitmentKey;

    if (testing::skip_slow_tests()) {
        GTEST_SKIP();
    }

    NativeProofResult proof_result;
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });

    auto [proof, verification_key, public_inputs_cols] = proof_result;
    proof.insert(proof.begin(), 0); // TODO(#14234)[Unconditional PIs validation]: remove this

    // Create the outer verifier, to verify the proof
    OuterBuilder outer_circuit;

    // Scoped to free memory of RecursiveVerifier.
    {
        RecursiveVerifier recursive_verifier{ outer_circuit, verification_key };

        auto pairing_points = recursive_verifier.verify_proof(proof, public_inputs_cols);

        NativeVerifierCommitmentKey pcs_vkey{};
        bool pairing_points_valid =
            pcs_vkey.pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value());

        // Check that the output of the recursive verifier is well-formed for aggregation as this pair of points will
        // be aggregated with others.
        ASSERT_TRUE(pairing_points_valid) << "Pairing points are not valid.";

        // Check that no failure flag was raised in the recursive verifier circuit
        ASSERT_FALSE(outer_circuit.failed()) << outer_circuit.err();

        // Check that the circuit is valid.
        bool outer_circuit_checked = CircuitChecker::check(outer_circuit);
        ASSERT_TRUE(outer_circuit_checked) << "outer circuit check failed";

        auto manifest = AvmFlavor::Transcript(proof).get_manifest();
        auto recursive_manifest = recursive_verifier.transcript->get_manifest();

        // We sanity check that the recursive manifest matches its counterpart one.
        ASSERT_EQ(manifest.size(), recursive_manifest.size());
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], manifest[i]);
        }

        // We sanity check that the recursive verifier key (precomputed columns) matches its counterpart one.
        for (const auto [key_el, rec_key_el] :
             zip_view(verification_key->get_all(), recursive_verifier.key->get_all())) {
            EXPECT_EQ(key_el, rec_key_el.get_value());
        }

        // Sanity checks on circuit_size and num_public_inputs match.
        EXPECT_EQ(verification_key->circuit_size,
                  static_cast<uint64_t>(recursive_verifier.key->circuit_size.get_value()));
        EXPECT_EQ(verification_key->num_public_inputs,
                  static_cast<uint64_t>(recursive_verifier.key->num_public_inputs.get_value()));
    }

    // Make a proof of the verification of an AVM proof
    const size_t srs_size = 1 << 24; // Current outer_circuit size is 9.6 millions
    auto ultra_instance = std::make_shared<OuterDeciderProvingKey>(
        outer_circuit, TraceSettings{}, bb::CommitmentKey<curve::BN254>(srs_size));

    // Scoped to free memory of OuterProver.
    auto outer_proof = [&]() {
        auto verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
        OuterProver ultra_prover(ultra_instance, verification_key);
        return ultra_prover.construct_proof();
    }();

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    auto ultra_verification_key = std::make_shared<UltraFlavor::VerificationKey>(ultra_instance->proving_key);
    OuterVerifier ultra_verifier(ultra_verification_key);
    EXPECT_TRUE(ultra_verifier.verify_proof(outer_proof)) << "outer/recursion proof verification failed";
}

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
    using UltraRollupRecursiveFlavor = UltraRollupRecursiveFlavor_<UltraRollupFlavor::CircuitBuilder>;
    using UltraFF = UltraRollupRecursiveFlavor::FF;
    using UltraRollupProver = UltraProver_<UltraRollupFlavor>;
    using NativeVerifierCommitmentKey = typename AvmFlavor::VerifierCommitmentKey;

    NativeProofResult proof_result;
    ASSERT_NO_FATAL_FAILURE({ create_and_verify_native_proof(proof_result); });

    auto [proof, verification_key, public_inputs_cols] = proof_result;
    proof.insert(proof.begin(), 0); // TODO(#14234)[Unconditional PIs validation]: remove this

    // Construct stdlib representations of the proof, public inputs and verification key
    OuterBuilder outer_circuit;
    StdlibProof<OuterBuilder> stdlib_proof = bb::convert_native_proof_to_stdlib(&outer_circuit, proof);

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
        AvmRecursiveVerifier avm_rec_verifier(outer_circuit, outer_key_fields);
        return avm_rec_verifier.verify_proof(stdlib_proof, public_inputs_ct);
    }();

    verifier_output.points_accumulator.set_public();
    verifier_output.ipa_claim.set_public();
    outer_circuit.ipa_proof = convert_stdlib_proof_to_native(verifier_output.ipa_proof);

    // Ensure that the pairing check is satisfied on the outputs of the recursive verifier
    NativeVerifierCommitmentKey pcs_vkey{};
    bool agg_output_valid = pcs_vkey.pairing_check(verifier_output.points_accumulator.P0.get_value(),
                                                   verifier_output.points_accumulator.P1.get_value());
    ASSERT_TRUE(agg_output_valid) << "Pairing points (aggregation state) are not valid.";
    ASSERT_FALSE(outer_circuit.failed()) << "Outer circuit has failed.";

    vinfo("Recursive verifier: finalized num gates = ", outer_circuit.num_gates);

    // Construct and verify an Ultra Rollup proof of the AVM recursive verifier circuit. This proof carries an IPA claim
    // from ECCVM recursive verification in its public inputs that will be verified as part of the UltraRollupVerifier.
    auto outer_proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(outer_circuit);

    // Scoped to free memory of UltraRollupProver.
    auto outer_proof = [&]() {
        auto verification_key = std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->proving_key);
        UltraRollupProver outer_prover(outer_proving_key, verification_key);
        return outer_prover.construct_proof();
    }();

    // Verify the proof of the Ultra circuit that verified the AVM recursive verifier circuit
    auto outer_verification_key = std::make_shared<UltraRollupFlavor::VerificationKey>(outer_proving_key->proving_key);
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    UltraRollupVerifier final_verifier(outer_verification_key, ipa_verification_key);

    EXPECT_TRUE(final_verifier.verify_proof(outer_proof, outer_proving_key->proving_key.ipa_proof));
}

} // namespace bb::avm2::constraining
