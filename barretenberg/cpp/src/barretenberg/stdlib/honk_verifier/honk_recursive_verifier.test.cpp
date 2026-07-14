#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/test_utils/proof_structures.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "ultra_verification_keys_comparator.hpp"

namespace bb::stdlib::recursion::honk {

// Test parameters: <RecursiveFlavor, IO>
// IO determines the public inputs structure (DefaultIO or RollupIO) for both inner and outer circuits
template <typename RecursiveFlavor_, typename IO_> struct RecursiveVerifierTestParams {
    using RecursiveFlavor = RecursiveFlavor_;
    using IO = IO_;
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
// Note: UltraRecursiveFlavor_<UltraCircuitBuilder> + RollupIO covers the rollup case
using TestConfigs = testing::Types<
    RecursiveVerifierTestParams<MegaRecursiveFlavor_<MegaCircuitBuilder>, DefaultIO<MegaCircuitBuilder>>,
    RecursiveVerifierTestParams<MegaRecursiveFlavor_<UltraCircuitBuilder>, DefaultIO<UltraCircuitBuilder>>,
    RecursiveVerifierTestParams<UltraRecursiveFlavor_<UltraCircuitBuilder>, DefaultIO<UltraCircuitBuilder>>,
    RecursiveVerifierTestParams<UltraRecursiveFlavor_<UltraCircuitBuilder>, RollupIO>, // Rollup case
    RecursiveVerifierTestParams<UltraRecursiveFlavor_<MegaCircuitBuilder>, DefaultIO<MegaCircuitBuilder>>,
    RecursiveVerifierTestParams<UltraZKRecursiveFlavor_<UltraCircuitBuilder>, DefaultIO<UltraCircuitBuilder>>,
    RecursiveVerifierTestParams<UltraZKRecursiveFlavor_<MegaCircuitBuilder>, DefaultIO<MegaCircuitBuilder>>,
    RecursiveVerifierTestParams<MegaZKRecursiveFlavor_<MegaCircuitBuilder>, DefaultIO<MegaCircuitBuilder>>,
    RecursiveVerifierTestParams<MegaZKRecursiveFlavor_<UltraCircuitBuilder>, DefaultIO<UltraCircuitBuilder>>>;

/**
 * @brief Test suite for recursive verification of  Honk proofs for both Ultra and Mega arithmetisation.
 * @details `Inner*` types describe the type of circuits (and everything else required to generate a proof) that we aim
 * to recursively verify. `Outer*` describes the arithmetisation of the recursive verifier circuit and the types
 * required to ensure the recursive verifier circuit is correct (i.e. by producing a proof and verifying it).
 *
 * @tparam Params contains RecursiveFlavor and IO type for the test
 */
template <typename Params> class RecursiveVerifierTest : public testing::Test {

    using RecursiveFlavor = typename Params::RecursiveFlavor;
    using IO = typename Params::IO;

    // Define types for the inner circuit, i.e. the circuit whose proof will be recursively verified
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerProver = UltraProver_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerCommitment = InnerFlavor::Commitment;
    using InnerFF = InnerFlavor::FF;
    using InnerProof = std::vector<InnerFF>;

    // IO types: InnerIO uses InnerBuilder, OuterIO uses OuterBuilder
    using NativeIO = std::conditional_t<IO::HasIPA, bb::RollupIO, bb::DefaultIO>;
    using InnerVerifier = bb::UltraVerifier_<InnerFlavor, NativeIO>;
    using InnerIO = std::conditional_t<IO::HasIPA, RollupIO, DefaultIO<InnerBuilder>>;

    // Defines types for the outer circuit, i.e. the circuit of the recursive verifier
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = bb::UltraVerifier_<OuterFlavor, NativeIO>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;
    using OuterStdlibProof = bb::stdlib::Proof<OuterBuilder>;
    using OuterIO = IO;

    // RecursiveVerifier uses IO that matches the test's IO type
    using RecursiveVerifier = bb::UltraVerifier_<RecursiveFlavor, IO>;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

    using PairingObject = PairingPoints<OuterBuilder>;
    using VerifierOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<OuterBuilder>;
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
            if constexpr (IO::HasIPA) {
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
        if constexpr (IO::HasIPA) {
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

        bool result = output.points_accumulator.check();
        info("input pairing points result: ", result);
        EXPECT_EQ(result, native_result);

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

    enum class TamperType {
        MODIFY_SUMCHECK_UNIVARIATE, // Tests sumcheck round consistency constraint (circuit FAIL)
        MODIFY_SUMCHECK_EVAL,       // Tests final relation check constraint (circuit FAIL)
        MODIFY_KZG_WITNESS,         // Tests pairing check (circuit PASS, pairing FAIL)
        MODIFY_LIBRA_EVAL,          // Tests Libra consistency constraint (circuit FAIL, ZK only)
        END
    };

    static void tamper_honk_proof(InnerProver& inner_prover,
                                  typename InnerFlavor::Transcript::Proof& inner_proof,
                                  TamperType type)
    {
        using FF = InnerFF;
        static constexpr size_t FIRST_WITNESS_INDEX = InnerFlavor::NUM_PRECOMPUTED_ENTITIES;

        StructuredProof<InnerFlavor> structured_proof;
        const auto num_public_inputs = inner_prover.num_public_inputs();
        const size_t log_n = InnerFlavor::USE_PADDING ? InnerFlavor::VIRTUAL_LOG_N : inner_prover.log_dyadic_size();
        structured_proof.deserialize(inner_prover.get_transcript()->test_get_proof_data(), num_public_inputs, log_n);

        switch (type) {
        case TamperType::MODIFY_SUMCHECK_UNIVARIATE: {
            FF delta = FF::random_element();
            structured_proof.sumcheck_univariates[0].value_at(0) += delta;
            structured_proof.sumcheck_univariates[0].value_at(1) -= delta;
            break;
        }
        case TamperType::MODIFY_SUMCHECK_EVAL:
            structured_proof.sumcheck_evaluations[FIRST_WITNESS_INDEX] = FF::random_element();
            break;
        case TamperType::MODIFY_KZG_WITNESS:
            structured_proof.kzg_w_comm = structured_proof.kzg_w_comm * FF::random_element();
            break;
        case TamperType::MODIFY_LIBRA_EVAL:
            if constexpr (InnerFlavor::HasZK) {
                structured_proof.libra_quotient_eval = FF::random_element();
            }
            break;
        case TamperType::END:
            break;
        }

        structured_proof.serialize(inner_prover.get_transcript()->test_get_proof_data(), log_n);
        inner_prover.get_transcript()->test_set_proof_parsing_state(
            0, ProofLength::Honk<InnerFlavor>::LENGTH_WITHOUT_PUB_INPUTS(log_n) + num_public_inputs);
        inner_proof = inner_prover.export_proof();
    }

    static void test_recursive_verification_fails()
    {
        for (size_t idx = 0; idx < static_cast<size_t>(TamperType::END); idx++) {
            TamperType tamper_type = static_cast<TamperType>(idx);

            if (tamper_type == TamperType::MODIFY_LIBRA_EVAL && !InnerFlavor::HasZK) {
                continue;
            }

            // Create an arbitrary inner circuit
            auto inner_circuit = create_inner_circuit();

            // Generate a proof over the inner circuit
            auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
            auto inner_verification_key =
                std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
            InnerProver inner_prover(prover_instance, inner_verification_key);
            auto inner_proof = inner_prover.construct_proof();

            // Tamper with the proof to be verified
            tamper_honk_proof(inner_prover, inner_proof, tamper_type);

            // Create a recursive verification circuit for the tampered proof
            OuterBuilder outer_circuit;
            auto stdlib_vk_and_hash =
                std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, inner_verification_key);
            RecursiveVerifier verifier{ stdlib_vk_and_hash };
            OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
            VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

            if (tamper_type == TamperType::MODIFY_KZG_WITNESS) {
                // Expected to result in pairing failure but no circuit constraint violations
                EXPECT_TRUE(CircuitChecker::check(outer_circuit));
                EXPECT_FALSE(output.points_accumulator.check());
            } else {
                // All other tamper types should cause a circuit constraint violation
                EXPECT_FALSE(CircuitChecker::check(outer_circuit));
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
        pairing_points.fix_witness();

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

        outer_circuit.finalize_circuit();

        // Run static analysis to detect unconstrained variables
        // Use the appropriate analyzer based on the outer builder type
        using Analyzer =
            std::conditional_t<IsMegaBuilder<OuterBuilder>, cdg::MegaStaticAnalyzer, cdg::UltraStaticAnalyzer>;
        auto graph = Analyzer(outer_circuit);
        auto [cc, variables_in_one_gate] = graph.analyze_circuit(/*filter_cc=*/true);

        // We expect exactly one connected component (all variables properly connected)
        EXPECT_EQ(cc.size(), 1);

        // Expected variables in one gate:
        size_t expected_unconstrained = 0;
        EXPECT_EQ(variables_in_one_gate.size(), expected_unconstrained);
    }

    /**
     * @brief Profile recursive verifier by measuring total gates
     * @details Simple profiling that just runs the verifier and reports total gates
     */
    static void test_recursive_verifier_profiling()
    {
        // Create inner circuit and generate proof (shared between both runs)
        auto inner_circuit = create_inner_circuit();
        auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
        auto verification_key =
            std::make_shared<typename InnerFlavor::VerificationKey>(prover_instance->get_precomputed());
        InnerProver inner_prover(prover_instance, verification_key);
        auto inner_proof = inner_prover.construct_proof();

        auto run_verifier = [&](bool fix_vk_witnesses) {
            OuterBuilder outer_circuit;

            auto stdlib_vk_and_hash =
                std::make_shared<typename RecursiveFlavor::VKAndHash>(outer_circuit, verification_key);

            if (fix_vk_witnesses) {
                // Fix all VK commitments to simulate a known/fixed kernel VK
                stdlib_vk_and_hash->vk->fix_witness();
                stdlib_vk_and_hash->hash.fix_witness();
            }

            RecursiveVerifier verifier{ stdlib_vk_and_hash };

            OuterStdlibProof stdlib_inner_proof(outer_circuit, inner_proof);
            VerifierOutput output = verifier.verify_proof(stdlib_inner_proof);

            // Set pairing points public
            OuterIO inputs;
            inputs.pairing_inputs = output.points_accumulator;
            if constexpr (IO::HasIPA) {
                inputs.ipa_claim = output.ipa_claim;
                outer_circuit.ipa_proof = output.ipa_proof.get_value();
            }
            inputs.set_public();

            return outer_circuit.get_num_finalized_gates_inefficient();
        };

        // Run both configurations for comparison
        const size_t gates_fixed_vk = run_verifier(true);
        const size_t gates_baseline = run_verifier(false);

        const int64_t delta = static_cast<int64_t>(gates_fixed_vk) - static_cast<int64_t>(gates_baseline);
        const double pct = 100.0 * static_cast<double>(delta) / static_cast<double>(gates_baseline);

        info("\n=== RECURSIVE VERIFIER PROFILING ===");
        info("Flavor: ", typeid(RecursiveFlavor).name());
        info("Baseline (all ROM):     ", gates_baseline, " gates");
        info("Fixed VK (split MSM):   ", gates_fixed_vk, " gates");
        info("Delta:                  ", delta, " gates (", pct, "%)");
        info("====================================\n");
    }
};

TYPED_TEST_SUITE(RecursiveVerifierTest, TestConfigs);

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
    using RecursiveFlavor = typename TypeParam::RecursiveFlavor;
    if constexpr (IsAnyOf<RecursiveFlavor,
                          UltraRecursiveFlavor_<UltraCircuitBuilder>,
                          UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
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

/**
 * @brief Test recursive verification circuit with graph analysis for unconstrained variables
 * @details Uses StaticAnalyzer to verify all circuit variables are properly constrained.
 * Originally a separate test in graph_description_ultra_recursive_verifier.test.cpp, now
 * consolidated into the main recursive verifier test suite.
 */
HEAVY_TYPED_TEST(RecursiveVerifierTest, GraphAnalysisOfRecursiveVerifier)
{
    TestFixture::test_recursive_verification_with_graph_analysis();
};

/**
 * @brief Profile recursive verifier to measure gates at each verification stage
 */
HEAVY_TYPED_TEST(RecursiveVerifierTest, ProfilingRecursiveVerifier)
{
    // Run profiling for all UltraCircuitBuilder-based recursive flavors
    using RecursiveFlavor = typename TypeParam::RecursiveFlavor;
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    if constexpr (std::is_same_v<OuterBuilder, UltraCircuitBuilder>) {
        TestFixture::test_recursive_verifier_profiling();
    } else {
        GTEST_SKIP() << "Profiling only for UltraCircuitBuilder-based recursive flavors";
    }
};

#ifdef DISABLE_HEAVY_TESTS
// Null test
TEST(RecursiveVerifierTest, DoNothingTestToEnsureATestExists) {}
#endif
} // namespace bb::stdlib::recursion::honk
