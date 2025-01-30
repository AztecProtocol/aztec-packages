#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Test suite for recursive verification of  Honk proofs for both Ultra and Mega arithmetisation.
 * @details `Inner*` types describe the type of circuits (and everything else required to generate a proof) that we aim
 * to recursively verify. `Outer*` describes the arithmetisation of the recursive verifier circuit and the types
 * required to ensure the recursive verifier circuit is correct (i.e. by producing a proof and verifying it).
 *
 * @tparam RecursiveFlavor defines the recursive verifier, what the arithmetisation of its circuit should be and what
 * types of proofs it recursively verifies.
 */
template <typename RecursiveFlavor> class RecursiveVerifierTest : public testing::Test {

    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerVerifier = UltraVerifier_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerDeciderProvingKey = DeciderProvingKey_<InnerFlavor>;
    using InnerCurve = bn254<InnerBuilder>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<RecursiveFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using RecursiveVerifier = UltraRecursiveVerifier_<RecursiveFlavor>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

    using AggState = aggregation_state<typename RecursiveFlavor::Curve>;
    using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<RecursiveFlavor>;
    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     */
    static InnerBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
        using fr = typename InnerCurve::ScalarFieldNative;

        InnerBuilder builder;

        // Create 2^log_n many add gates based on input log num gates
        const size_t num_gates = (1 << log_num_gates);
        for (size_t i = 0; i < num_gates; ++i) {
            fr a = fr::random_element();
            uint32_t a_idx = builder.add_variable(a);

            fr b = fr::random_element();
            fr c = fr::random_element();
            fr d = a + b + c;
            uint32_t b_idx = builder.add_variable(b);
            uint32_t c_idx = builder.add_variable(c);
            uint32_t d_idx = builder.add_variable(d);

            builder.create_big_add_gate({ a_idx, b_idx, c_idx, d_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
        PairingPointAccumulatorIndices agg_obj_indices = stdlib::recursion::init_default_agg_obj_indices(builder);
        builder.add_pairing_point_accumulator(agg_obj_indices);

        if constexpr (HasIPAAccumulator<RecursiveFlavor>) {
            auto [stdlib_opening_claim, ipa_proof] =
                IPA<grumpkin<InnerBuilder>>::create_fake_ipa_claim_and_proof(builder);
            builder.add_ipa_claim(stdlib_opening_claim.get_witness_indices());
            builder.ipa_proof = ipa_proof;
        }
        return builder;
    };

  public:
    static void SetUpTestSuite()
    {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        if constexpr (HasIPAAccumulator<RecursiveFlavor>) {
            bb::srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
        }
    }

    /**
     * @brief Create inner circuit and call check_circuit on it
     *
     */
    static void test_inner_circuit()
    {
        auto inner_circuit = create_inner_circuit();

        bool result = CircuitChecker::check(inner_circuit);

        EXPECT_EQ(result, true);
    }

    /**
     * @brief Instantiate a recursive verification key from the native verification key produced by the inner cicuit
     * builder. Check consistency between the native and stdlib types.
     *
     */
    static void test_recursive_verification_key_creation()
    {
        // Create an arbitrary inner circuit
        auto inner_circuit = create_inner_circuit();
        OuterBuilder outer_circuit;

        // Compute native verification key
        auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
        InnerProver prover(proving_key); // A prerequisite for computing VK
        auto honk_vk = std::make_shared<typename InnerFlavor::VerificationKey>(proving_key->proving_key);
        // Instantiate the recursive verifier using the native verification key
        RecursiveVerifier verifier{ &outer_circuit, honk_vk };

        // Spot check some values in the recursive VK to ensure it was constructed correctly
        EXPECT_EQ(verifier.key->circuit_size, honk_vk->circuit_size);
        EXPECT_EQ(verifier.key->log_circuit_size, honk_vk->log_circuit_size);
        EXPECT_EQ(verifier.key->num_public_inputs, honk_vk->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] : zip_view(verifier.key->get_all(), honk_vk->get_all())) {
            EXPECT_EQ(vk_poly.get_value(), native_vk_poly);
        }
    }

    /**
     * @brief  Ensures that the recursive verifier circuit for two inner circuits of different size is the same as the
     * proofs are currently constant. This is done by taking each trace block in part and checking all its selector
     * values.
     *
     */
    static void test_independent_vk_hash()
    {
        // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
        auto get_blocks = [](size_t inner_size) -> std::tuple<typename OuterBuilder::ExecutionTrace,
                                                              std::shared_ptr<typename OuterFlavor::VerificationKey>> {
            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit(inner_size);

            // Generate a proof over the inner circuit
            auto inner_proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
            InnerProver inner_prover(inner_proving_key);
            info("test circuit size: ", inner_proving_key->proving_key.circuit_size);
            auto verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(inner_proving_key->proving_key);
            auto inner_proof = inner_prover.construct_proof();

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            RecursiveVerifier verifier{ &outer_circuit, verification_key };

            typename RecursiveVerifier::Output verifier_output = verifier.verify_proof(
                inner_proof,
                init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit));
            if constexpr (HasIPAAccumulator<OuterFlavor>) {
                outer_circuit.add_ipa_claim(verifier_output.ipa_opening_claim.get_witness_indices());
                outer_circuit.ipa_proof = convert_stdlib_proof_to_native(verifier_output.ipa_proof);
            }

            auto outer_proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            auto outer_verification_key =
                std::make_shared<typename OuterFlavor::VerificationKey>(outer_proving_key->proving_key);

            return { outer_circuit.blocks, outer_verification_key };
        };

        auto [blocks_10, verification_key_10] = get_blocks(10);
        auto [blocks_11, verification_key_11] = get_blocks(11);

        compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_10, blocks_11 },
                                                                { verification_key_10, verification_key_11 });
    }

    /**
     * @brief Construct a recursive verification circuit for the proof of an inner circuit then call check_circuit on
     * it.
     */
    static void test_recursive_verification()
    {
        // Create an arbitrary inner circuit
        auto inner_circuit = create_inner_circuit();

        // Generate a proof over the inner circuit
        auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
        InnerProver inner_prover(proving_key);
        auto verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(proving_key->proving_key);
        auto inner_proof = inner_prover.construct_proof();

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, verification_key };

        AggState agg_obj = init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit);
        VerifierOutput output = verifier.verify_proof(inner_proof, agg_obj);
        AggState pairing_points = output.agg_obj;
        if constexpr (HasIPAAccumulator<OuterFlavor>) {
            outer_circuit.add_ipa_claim(output.ipa_opening_claim.get_witness_indices());
            outer_circuit.ipa_proof = convert_stdlib_proof_to_native(output.ipa_proof);
        }
        info("Recursive Verifier: num gates = ", outer_circuit.get_estimated_num_finalized_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        // Check 1: Perform native verification then perform the pairing on the outputs of the recursive
        // verifier and check that the result agrees.
        bool native_result;
        InnerVerifier native_verifier(verification_key);
        if constexpr (HasIPAAccumulator<OuterFlavor>) {
            native_verifier.ipa_verification_key =
                std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
            native_result = native_verifier.verify_proof(inner_proof, convert_stdlib_proof_to_native(output.ipa_proof));
        } else {
            native_result = native_verifier.verify_proof(inner_proof);
        }
        auto pcs_verification_key = std::make_shared<typename InnerFlavor::VerifierCommitmentKey>();
        bool result = pcs_verification_key->pairing_check(pairing_points.P0.get_value(), pairing_points.P1.get_value());
        info("input pairing points result: ", result);
        auto recursive_result = native_verifier.verification_key->verification_key->pcs_verification_key->pairing_check(
            pairing_points.P0.get_value(), pairing_points.P1.get_value());
        EXPECT_EQ(recursive_result, native_result);

        // Check 2: Ensure that the underlying native and recursive verification algorithms agree by ensuring
        // the manifests produced by each agree.
        auto recursive_manifest = verifier.transcript->get_manifest();
        auto native_manifest = native_verifier.transcript->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
        }

        // Check 3: Construct and verify a proof of the recursive verifier circuit
        if constexpr (!IsSimulator<OuterBuilder>) {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            OuterProver prover(proving_key);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
            auto proof = prover.construct_proof();
            if constexpr (HasIPAAccumulator<OuterFlavor>) {
                auto ipa_verification_key =
                    std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
                OuterVerifier verifier(verification_key, ipa_verification_key);
                ASSERT(verifier.verify_proof(proof, proving_key->proving_key.ipa_proof));
            } else {
                OuterVerifier verifier(verification_key);
                ASSERT(verifier.verify_proof(proof));
            }
        }
    }

    /**
     * @brief Construct a verifier circuit for a proof whose data has been tampered with. Expect failure
     * TODO(bberg #656): For now we get a "bad" proof by arbitrarily tampering with bits in a valid proof. It would be
     * much nicer to explicitly change meaningful components, e.g. such that one of the multilinear evaluations is
     * wrong. This is difficult now but should be straightforward if the proof is a struct.
     */
    static void test_recursive_verification_fails()
    {
        // Create an arbitrary inner circuit
        auto inner_circuit = create_inner_circuit();

        // Generate a proof over the inner circuit
        auto proving_key = std::make_shared<InnerDeciderProvingKey>(inner_circuit);
        InnerProver inner_prover(proving_key);
        auto inner_proof = inner_prover.construct_proof();

        // Arbitrarily tamper with the proof to be verified
        inner_prover.transcript->deserialize_full_transcript();
        inner_prover.transcript->z_perm_comm = InnerCommitment::one() * InnerFF::random_element();
        inner_prover.transcript->serialize_full_transcript();
        inner_proof = inner_prover.export_proof();

        // Generate the corresponding inner verification key
        auto inner_verification_key = std::make_shared<typename InnerFlavor::VerificationKey>(proving_key->proving_key);

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        RecursiveVerifier verifier{ &outer_circuit, inner_verification_key };
        verifier.verify_proof(
            inner_proof, init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit));

        // We expect the circuit check to fail due to the bad proof
        EXPECT_FALSE(CircuitChecker::check(outer_circuit));
    }
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using Flavors = testing::Types<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<CircuitSimulatorBN254>,
                               MegaRecursiveFlavor_<CircuitSimulatorBN254>,
                               MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;

TYPED_TEST_SUITE(RecursiveVerifierTest, Flavors);

HEAVY_TYPED_TEST(RecursiveVerifierTest, InnerCircuit)
{
    TestFixture::test_inner_circuit();
}

HEAVY_TYPED_TEST(RecursiveVerifierTest, RecursiveVerificationKey)
{
    TestFixture::test_recursive_verification_key_creation();
}

HEAVY_TYPED_TEST(RecursiveVerifierTest, SingleRecursiveVerification)
{
    TestFixture::test_recursive_verification();
};

HEAVY_TYPED_TEST(RecursiveVerifierTest, IndependentVKHash)
{
    if constexpr (IsAnyOf<TypeParam,
                          UltraRecursiveFlavor_<UltraCircuitBuilder>,
                          UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                          MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
        TestFixture::test_independent_vk_hash();
    } else {
        GTEST_SKIP() << "Not built for this parameter";
    }
};

HEAVY_TYPED_TEST(RecursiveVerifierTest, SingleRecursiveVerificationFailure)
{
    TestFixture::test_recursive_verification_fails();
};

} // namespace bb::stdlib::recursion::honk