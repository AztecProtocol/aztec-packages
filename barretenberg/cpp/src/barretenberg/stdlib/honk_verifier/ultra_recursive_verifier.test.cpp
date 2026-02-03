#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib/test_utils/tamper_proof.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using Flavors = testing::Types<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                               MegaZKRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaZKRecursiveFlavor_<UltraCircuitBuilder>>;

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
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerProof = std::vector<InnerFF>;

    // IO types for native verifiers (non-templated, in bb:: namespace)
    using NativeInnerIO = std::conditional_t<HasIPAAccumulator<InnerFlavor>, bb::RollupIO, bb::DefaultIO>;
    using InnerVerifier = bb::UltraVerifier_<InnerFlavor, NativeInnerIO>;

    // IO types for recursive verifiers (templated on Builder)
    using InnerIO = std::conditional_t<HasIPAAccumulator<RecursiveFlavor>,
                                       bb::stdlib::recursion::honk::RollupIO, // If RecursiveFlavor has IPA, then
                                                                              // OuterVerifier is Rollup flavor
                                       bb::stdlib::recursion::honk::DefaultIO<InnerBuilder>>;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<RecursiveFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using NativeOuterIO = std::conditional_t<HasIPAAccumulator<OuterFlavor>, bb::RollupIO, bb::DefaultIO>;
    using OuterVerifier = bb::UltraVerifier_<OuterFlavor, NativeOuterIO>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;
    using OuterStdlibProof = bb::stdlib::Proof<OuterBuilder>;
    using OuterIO = std::conditional_t<HasIPAAccumulator<RecursiveFlavor>,
                                       bb::stdlib::recursion::honk::RollupIO, // If RecursiveFlavor has IPA, then
                                                                              // OuterVerifier is Rollup flavor
                                       bb::stdlib::recursion::honk::DefaultIO<OuterBuilder>>;

    using RecursiveVerifier = bb::UltraVerifier_<RecursiveFlavor, DefaultRecursiveIO<RecursiveFlavor>>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

    using PairingObject = PairingPoints<OuterBuilder>;
    using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<OuterBuilder>;
    using NativeVerifierCommitmentKey = typename InnerFlavor::VerifierCommitmentKey;
    /**
     * @brief Create a non-trivial arbitrary inner circuit, the proof of which will be recursively verified
     *
     * @param builder
     * @param public_inputs
     * @param log_num_gates
     */
    static InnerBuilder create_inner_circuit(size_t log_num_gates = 10)
    {
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

        InnerIO::add_default(builder);

        return builder;
    }

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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
        auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
        auto honk_vk = std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
        auto stdlib_vk_and_hash = std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, honk_vk);
        // Instantiate the recursive verifier using the native verification key
        RecursiveVerifier verifier{ stdlib_vk_and_hash };

        // Spot check some values in the recursive VK to ensure it was constructed correctly
        EXPECT_EQ(
            static_cast<uint64_t>(verifier.get_verifier_instance()->vk_and_hash->vk->log_circuit_size.get_value()),
            honk_vk->log_circuit_size);
        EXPECT_EQ(
            static_cast<uint64_t>(verifier.get_verifier_instance()->vk_and_hash->vk->num_public_inputs.get_value()),
            honk_vk->num_public_inputs);
        for (auto [vk_poly, native_vk_poly] :
             zip_view(verifier.get_verifier_instance()->vk_and_hash->vk->get_all(), honk_vk->get_all())) {
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
            auto inner_prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
            auto verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(inner_prover_instance->get_precomputed());
            InnerProver inner_prover(inner_prover_instance, verification_key);
            info("test circuit size: ", inner_prover_instance->dyadic_size());
            auto inner_proof = inner_prover.construct_proof();

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            auto stdlib_vk_and_hash =
                std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, verification_key);
            RecursiveVerifier verifier{ stdlib_vk_and_hash };

            // Convert native proof to stdlib and verify (verifier handles IPA splitting internally)
            OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
            typename RecursiveVerifier::Output verifier_output = verifier.verify_proof(stdlib_inner_proof);

            // IO of outer_circuit
            OuterIO inputs;
            inputs.pairing_inputs = verifier_output.points_accumulator;
            if constexpr (HasIPAAccumulator<OuterFlavor>) {
                // Add ipa claim
                inputs.ipa_claim = verifier_output.ipa_claim;

                // Store ipa_proof
                outer_circuit.ipa_proof = verifier_output.ipa_proof.get_value();
            };
            inputs.set_public();

            auto outer_prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
            auto outer_verification_key =
                std::make_shared<typename OuterFlavor::VerificationKey>(outer_prover_instance->get_precomputed());

            return { outer_circuit.blocks, outer_verification_key };
        };

        auto [blocks_10, verification_key_10] = get_blocks(10);
        auto [blocks_14, verification_key_14] = get_blocks(14);

        compare_ultra_blocks_and_verification_keys<OuterFlavor>({ blocks_10, blocks_14 },
                                                                { verification_key_10, verification_key_14 });
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
        auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
        auto verification_key =
            std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
        InnerProver inner_prover(prover_instance, verification_key);
        auto inner_proof = inner_prover.construct_proof();

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        auto stdlib_vk_and_hash =
            std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, verification_key);
        auto recursive_transcript = std::make_shared<typename RecursiveFlavor::Transcript>();
        recursive_transcript->enable_manifest();
        RecursiveVerifier verifier{ stdlib_vk_and_hash, recursive_transcript };

        OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
        VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

        // IO of outer_circuit
        OuterIO inputs;
        inputs.pairing_inputs = output.points_accumulator;
        if constexpr (HasIPAAccumulator<OuterFlavor>) {
            // Add ipa claim
            inputs.ipa_claim = output.ipa_claim;

            // Store ipa_proof
            outer_circuit.ipa_proof = output.ipa_proof.get_value();
        };
        inputs.set_public();

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        // Check 1: Perform native verification then perform the pairing on the outputs of the recursive
        // verifier and check that the result agrees.
        auto vk_and_hash = std::make_shared<typename InnerFlavor::VKAndHash>(verification_key);
        auto native_transcript = std::make_shared<typename InnerFlavor::Transcript>();
        native_transcript->enable_manifest();
        InnerVerifier native_verifier(vk_and_hash, native_transcript);
        // inner_proof already contains combined honk + IPA for rollup flavors
        bool native_result = native_verifier.verify_proof(inner_proof).result;

        NativeVerifierCommitmentKey pcs_vkey{};
        bool result =
            pcs_vkey.pairing_check(output.points_accumulator.P0.get_value(), output.points_accumulator.P1.get_value());
        info("input pairing points result: ", result);
        auto recursive_result =
            pcs_vkey.pairing_check(output.points_accumulator.P0.get_value(), output.points_accumulator.P1.get_value());
        EXPECT_EQ(recursive_result, native_result);

        // Check 2: Ensure that the underlying native and recursive verification algorithms agree by ensuring
        // the manifests produced by each agree.
        auto recursive_manifest = verifier.get_transcript()->get_manifest();
        auto native_manifest = native_verifier.get_transcript()->get_manifest();
        for (size_t i = 0; i < recursive_manifest.size(); ++i) {
            EXPECT_EQ(recursive_manifest[i], native_manifest[i]);
        }

        // Check 3: Construct and verify a proof of the recursive verifier circuit
        {
            auto prover_instance = std::make_shared<OuterProverInstance>(outer_circuit);
            auto verification_key =
                std::make_shared<typename OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
            info("Recursive Verifier: num gates = ", outer_circuit.get_num_finalized_gates());
            OuterProver prover(prover_instance, verification_key);
            // construct_proof() already returns combined proof (honk + IPA) for rollup flavors
            auto proof = prover.construct_proof();
            auto outer_vk_and_hash = std::make_shared<typename OuterFlavor::VKAndHash>(verification_key);
            OuterVerifier verifier(outer_vk_and_hash);
            bool result = verifier.verify_proof(proof).result;
            ASSERT_TRUE(result);
        }
        // Check the size of the recursive verifier
        if constexpr (std::same_as<RecursiveFlavor, MegaZKRecursiveFlavor_<UltraCircuitBuilder>>) {
            const auto expected_gate_count = std::get<0>(acir_format::HONK_RECURSION_CONSTANTS<RecursiveFlavor>());
            ASSERT_EQ(outer_circuit.get_num_finalized_gates(), expected_gate_count)
                << "MegaZKHonk Recursive verifier changed in Ultra gate count! Update this value if you "
                   "are sure this is expected.";
        }
    }

    /**
     * @brief Construct verifier circuits for proofs whose data have been tampered with. Expect failure
     *
     */
    static void test_recursive_verification_fails()
        requires(!IsAnyOf<InnerFlavor, MegaZKFlavor, MegaFlavor>)
    {
        for (size_t idx = 0; idx < static_cast<size_t>(TamperType::END); idx++) {
            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Generate a proof over the inner circuit
            auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
            // Generate the corresponding inner verification key
            auto inner_verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
            InnerProver inner_prover(prover_instance, inner_verification_key);
            auto inner_proof = inner_prover.construct_proof();

            // Tamper with the proof to be verified
            TamperType tamper_type = static_cast<TamperType>(idx);
            tamper_with_proof<InnerProver, InnerFlavor>(inner_prover, inner_proof, tamper_type);

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            auto stdlib_vk_and_hash =
                std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, inner_verification_key);
            RecursiveVerifier verifier{ stdlib_vk_and_hash };
            OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
            VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

            // Wrong Gemini witnesses lead to the pairing check failure in non-ZK case but don't break any
            // constraints. In ZK-cases, tampering with Gemini witnesses leads to SmallSubgroupIPA consistency check
            // failure.
            if ((tamper_type != TamperType::MODIFY_GEMINI_WITNESS) || (InnerFlavor::HasZK)) {
                // We expect the circuit check to fail due to the bad proof.
                EXPECT_FALSE(CircuitChecker::check(outer_circuit));
            } else {
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));
                NativeVerifierCommitmentKey pcs_vkey{};
                bool result = pcs_vkey.pairing_check(output.points_accumulator.P0.get_value(),
                                                     output.points_accumulator.P1.get_value());
                EXPECT_FALSE(result);
            }
        }
    }
    /**
     * @brief Tamper with a MegaZK proof in two ways. First, we modify the first non-zero value in the proof, which has
     * to lead to a CircuitChecker failure. Then we also modify the last commitment ("KZG:W") in the proof, in this
     * case, CircuitChecker succeeds, but the pairing check must fail.
     *
     */
    static void test_recursive_verification_fails()
        requires(IsAnyOf<InnerFlavor, MegaZKFlavor, MegaFlavor>)

    {
        for (size_t idx = 0; idx < 2; idx++) {
            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Generate a proof over the inner circuit
            auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
            // Generate the corresponding inner verification key
            auto inner_verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
            InnerProver inner_prover(prover_instance, inner_verification_key);
            auto inner_proof = inner_prover.construct_proof();

            // Tamper with the proof to be verified
            tamper_with_proof<InnerProver, InnerFlavor>(inner_proof, /*end_of_proof*/ static_cast<bool>(idx));

            // Create a recursive verification circuit for the proof of the inner circuit
            OuterBuilder outer_circuit;
            auto stdlib_vk_and_hash =
                std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, inner_verification_key);
            RecursiveVerifier verifier{ stdlib_vk_and_hash };
            OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
            VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

            if (idx == 0) {
                // We expect the circuit check to fail due to the bad proof.
                EXPECT_FALSE(CircuitChecker::check(outer_circuit));
            } else {
                // Wrong  witnesses lead to the pairing check failure in non-ZK case but don't break any
                // constraints. In ZK-cases, tampering with Gemini witnesses leads to SmallSubgroupIPA consistency check
                // failure.
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));
                NativeVerifierCommitmentKey pcs_vkey{};
                bool result = pcs_vkey.pairing_check(output.points_accumulator.P0.get_value(),
                                                     output.points_accumulator.P1.get_value());
                EXPECT_FALSE(result);
            }
        }
    }

    /**
     * @brief Test recursive verification with static graph analysis to detect unconstrained variables
     * @details This test constructs a recursive verification circuit and uses the StaticAnalyzer
     * to verify that all variables are properly constrained, with the expected exception of variables
     * that appear in only one gate (e.g., unused Shplonk powers due to PCS structure).
     *
     * This test was moved from graph_description_ultra_recursive_verifier.test.cpp to consolidate
     * recursive verifier testing.
     */
    static void test_recursive_verification_with_graph_analysis()
    {
        // Create an arbitrary inner circuit
        auto inner_circuit = create_inner_circuit();

        // Generate a proof over the inner circuit
        auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
        auto verification_key =
            std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
        InnerProver inner_prover(prover_instance, verification_key);
        auto inner_proof = inner_prover.construct_proof();

        // Create a recursive verification circuit for the proof of the inner circuit
        OuterBuilder outer_circuit;
        auto stdlib_vk_and_hash =
            std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, verification_key);
        RecursiveVerifier verifier{ stdlib_vk_and_hash };

        // Fix witness for VK fields to ensure they're properly constrained
        verifier.get_verifier_instance()->vk_and_hash->vk->num_public_inputs.fix_witness();
        verifier.get_verifier_instance()->vk_and_hash->vk->pub_inputs_offset.fix_witness();
        verifier.get_verifier_instance()->vk_and_hash->vk->log_circuit_size.fix_witness();

        OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
        VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);
        auto pairing_points = output.points_accumulator;

        // The pairing points are public outputs from the recursive verifier that will be verified externally via a
        // pairing check. While they are computed within the circuit (via batch_mul for P0 and negation for P1), their
        // output coordinates may not appear in multiple constraint gates. Calling fix_witness() adds explicit
        // constraints on these values. Without these constraints, the StaticAnalyzer detects unconstrained variables
        // (coordinate limbs) that appear in only one gate. This ensures the pairing point coordinates are properly
        // constrained within the circuit itself, rather than relying solely on them being public outputs.
        pairing_points.P0.fix_witness();
        pairing_points.P1.fix_witness();

        // For RollupIO: Fix the IPA claim's bigfield elements (challenge and evaluation).
        // When reconstructed from public inputs, bigfield::construct_from_limbs creates a prime_basis_limb
        // that's computed as a linear combination of the binary limbs. Since the IPA claim is just propagated, this
        // prime_basis_limb appears in only one gate.
        if constexpr (IO::HasIPA) {
            output.ipa_claim.opening_pair.challenge.fix_witness();
            output.ipa_claim.opening_pair.evaluation.fix_witness();
        }

        info("Recursive Verifier: num gates = ", outer_circuit.get_num_finalized_gates_inefficient());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        outer_circuit.finalize_circuit(false);

        // Run static analysis to detect unconstrained variables
        // Use the appropriate analyzer based on the outer builder type
        using Analyzer =
            std::conditional_t<IsMegaBuilder<OuterBuilder>, cdg::MegaStaticAnalyzer, cdg::UltraStaticAnalyzer>;
        auto graph = Analyzer(outer_circuit);
        auto [cc, variables_in_one_gate] = graph.analyze_circuit(/*filter_cc=*/true);

        // We expect exactly one connected component (all variables properly connected)
        EXPECT_EQ(cc.size(), 1);

        // Expected variables in one gate:
        // - Base count of is_infinity booleans (MegaBuilder only, one per deserialized commitment)
        // - +1 for unused Shplonk power (non-ZK flavors only)
        //
        // AUDITTODO: When using MegaBuilder as outer circuit, goblin_element::from_witness() creates
        // is_point_at_infinity boolean witnesses for each deserialized commitment. These bools are only
        // constrained to be 0/1 (via bool gate) but are not linked to the actual point coordinates.
        size_t expected_unconstrained = 0;
        if constexpr (IsMegaBuilder<OuterBuilder>) {
            // Number of is_infinity booleans depends on number of commitments in the proof
            if constexpr (IsAnyOf<RecursiveFlavor,
                                  MegaRecursiveFlavor_<OuterBuilder>,
                                  MegaZKRecursiveFlavor_<OuterBuilder>>) {
                expected_unconstrained = 31; // Mega proofs have more commitments
            } else {
                expected_unconstrained = 28; // Ultra proofs have fewer commitments
            }
        }
        // Add 1 for unused Shplonk power in non-ZK flavors
        if constexpr (!RecursiveFlavor::HasZK) {
            expected_unconstrained += 1;
        }
        EXPECT_EQ(variables_in_one_gate.size(), expected_unconstrained);
    }
};

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
                          UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
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

#ifdef DISABLE_HEAVY_TESTS
// Null test
TEST(RecursiveVerifierTest, DoNothingTestToEnsureATestExists) {}
#endif
} // namespace bb::stdlib::recursion::honk
