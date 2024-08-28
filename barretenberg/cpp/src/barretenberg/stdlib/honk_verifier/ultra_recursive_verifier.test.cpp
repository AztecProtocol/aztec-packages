#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/stdlib/hash/blake3s/blake3s.hpp"
#include "barretenberg/stdlib/hash/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

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
    using OuterFlavor = std::conditional_t<IsMegaBuilder<OuterBuilder>, MegaFlavor, UltraFlavor>;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using RecursiveVerifier = UltraRecursiveVerifier_<RecursiveFlavor>;
    using RecursiveTranscript = typename RecursiveVerifier::Transcript;
    using VerificationKey = typename RecursiveVerifier::VerificationKey;

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
        AggregationObjectIndices agg_obj_indices = stdlib::recursion::init_default_agg_obj_indices(builder);
        builder.add_recursive_proof(agg_obj_indices);
        return builder;
    };

  public:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }

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
     * proofs are currently constant. This is done by taking each trace block in part and checking all it's selector
     * values.
     *
     */
    static void test_independent_vk_hash()
    {
        // Retrieves the trace blocks (each consisting of a specific gate) from the recursive verifier circuit
        auto get_blocks = [](size_t inner_size)
            -> std::tuple<typename OuterBuilder::GateBlocks, std::shared_ptr<typename OuterFlavor::VerificationKey>> {
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
            [[maybe_unused]] auto pairing_points = verifier.verify_proof(
                inner_proof,
                init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit));

            auto outer_proving_key = std::make_shared<OuterDeciderProvingKey>(outer_circuit);
            auto outer_verification_key =
                std::make_shared<typename OuterFlavor::VerificationKey>(outer_proving_key->proving_key);

            return { outer_circuit.blocks, outer_verification_key };
        };

        bool broke(false);
        auto check_eq = [&broke](auto& p1, auto& p2) {
            EXPECT_TRUE(p1.size() == p2.size());
            for (size_t idx = 0; idx < p1.size(); idx++) {
                if (p1[idx] != p2[idx]) {
                    broke = true;
                    break;
                }
            }
        };

        auto [blocks_10, verification_key_10] = get_blocks(10);
        auto [blocks_11, verification_key_11] = get_blocks(11);

        size_t block_idx = 0;
        for (auto [b_10, b_11] : zip_view(blocks_10.get(), blocks_11.get())) {
            info("block index: ", block_idx);
            size_t sel_idx = 0;
            EXPECT_TRUE(b_10.selectors.size() == 13);
            EXPECT_TRUE(b_11.selectors.size() == 13);
            for (auto [p_10, p_11] : zip_view(b_10.selectors, b_11.selectors)) {

                info("sel index: ", sel_idx);
                check_eq(p_10, p_11);
                sel_idx++;
            }
            block_idx++;
        }

        typename OuterFlavor::CommitmentLabels labels;
        for (auto [vk_10, vk_11, label] :
             zip_view(verification_key_10->get_all(), verification_key_11->get_all(), labels.get_precomputed())) {
            if (vk_10 != vk_11) {
                broke = true;
                info("Mismatch verification key label: ", label, " left: ", vk_10, " right: ", vk_11);
            }
        }

        EXPECT_TRUE(verification_key_10->circuit_size == verification_key_11->circuit_size);
        EXPECT_TRUE(verification_key_10->num_public_inputs == verification_key_11->num_public_inputs);

        EXPECT_FALSE(broke);
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
        typename RecursiveFlavor::CommitmentLabels commitment_labels;
        for (auto [label, key] : zip_view(commitment_labels.get_precomputed(), verifier.key->get_all())) {
            info("label: ", label, " value: ", key.get_value());
        }
        aggregation_state<typename RecursiveFlavor::Curve> agg_obj =
            init_default_aggregation_state<OuterBuilder, typename RecursiveFlavor::Curve>(outer_circuit);
        auto pairing_points = verifier.verify_proof(inner_proof, agg_obj);
        info("Recursive Verifier: num gates = ", outer_circuit.get_num_gates());

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_EQ(outer_circuit.failed(), false) << outer_circuit.err();

        // Check 1: Perform native verification then perform the pairing on the outputs of the recursive
        // verifier and check that the result agrees.
        InnerVerifier native_verifier(verification_key);
        auto native_result = native_verifier.verify_proof(inner_proof);
        using VerifierCommitmentKey = typename InnerFlavor::VerifierCommitmentKey;
        auto pcs_verification_key = std::make_shared<VerifierCommitmentKey>();
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
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
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

    static void test_full_relation_tags()
    {
        using FF_ct = typename RecursiveFlavor::FF;
        using Fr = bb::fr;
        using CommitmentLabels = typename RecursiveFlavor::CommitmentLabels;
        const size_t NUM_PUBLIC_INPUTS = 2;
        HonkProof proof;
        proof.insert(proof.begin(), 300, Fr(0));
        typename RecursiveFlavor::AllValues evaluations;
        RelationParameters<FF_ct> relation_parameters;
        CommitmentLabels labels;
        OuterBuilder builder;
        StdlibProof<OuterBuilder> stdlib_proof = bb::convert_proof_to_witness(&builder, proof);
        std::string domain_separator = "";
        auto transcript = std::make_shared<RecursiveTranscript>(stdlib_proof);

        std::vector<FF_ct> public_inputs;
        for (size_t i = 0; i < NUM_PUBLIC_INPUTS; ++i) {
            public_inputs.emplace_back(transcript->template receive_from_prover<FF_ct>(
                domain_separator + "public_input_" + std::to_string(i)));
        }
        evaluations.w_l = transcript->template receive_from_prover<FF_ct>("w_l");
        evaluations.w_r = transcript->template receive_from_prover<FF_ct>("w_r");
        evaluations.w_o = transcript->template receive_from_prover<FF_ct>("w_o");

        if constexpr (IsGoblinFlavor<RecursiveFlavor>) {
            // Receive ECC op wire commitments
            for (auto [element, label] : zip_view(evaluations.get_ecc_op_wires(), labels.get_ecc_op_wires())) {
                element = transcript->template receive_from_prover<FF_ct>(label);
            }

            // Receive DataBus related polynomial commitments
            for (auto [element, label] : zip_view(evaluations.get_databus_entities(), labels.get_databus_entities())) {
                element = transcript->template receive_from_prover<FF_ct>(label);
            }
        }

        // Get eta challenges; used in RAM/ROM memory records and log derivative lookup argument
        auto [eta, eta_two, eta_three] = transcript->template get_challenges<FF_ct>(
            domain_separator + "eta", domain_separator + "eta_two", domain_separator + "eta_three");

        // Get commitments to lookup argument polynomials and fourth wire
        evaluations.lookup_read_counts =
            transcript->template receive_from_prover<FF_ct>(domain_separator + labels.lookup_read_counts);
        evaluations.lookup_read_tags =
            transcript->template receive_from_prover<FF_ct>(domain_separator + labels.lookup_read_tags);
        evaluations.w_4 = transcript->template receive_from_prover<FF_ct>(domain_separator + labels.w_4);

        // Get permutation challenges
        auto [beta, gamma] =
            transcript->template get_challenges<FF_ct>(domain_separator + "beta", domain_separator + "gamma");

        evaluations.lookup_inverses =
            transcript->template receive_from_prover<FF_ct>(domain_separator + labels.lookup_inverses);

        // If Goblin (i.e. using DataBus) receive commitments to log-deriv inverses polynomials
        if constexpr (IsGoblinFlavor<RecursiveFlavor>) {
            for (auto [element, label] : zip_view(evaluations.get_databus_inverses(), labels.get_databus_inverses())) {
                element = transcript->template receive_from_prover<FF_ct>(domain_separator + label);
            }
        }
        const size_t circuit_size = 2048;
        const size_t pub_inputs_offset = 16;
        const FF_ct public_input_delta =
            compute_public_input_delta<RecursiveFlavor>(public_inputs, beta, gamma, circuit_size, pub_inputs_offset);

        relation_parameters = RelationParameters<FF_ct>{ eta, eta_two, eta_three, beta, gamma, public_input_delta };

        // Get commitment to permutation and lookup grand products
        evaluations.z_perm = transcript->template receive_from_prover<FF_ct>(domain_separator + labels.z_perm);

        typename RecursiveFlavor::RelationSeparator alphas;
        for (size_t idx = 0; idx < alphas.size(); idx++) {
            alphas[idx] = transcript->template get_challenge<FF_ct>(domain_separator + "alpha_" + std::to_string(idx));
        }

        FF_ct pow_evaluation = transcript->template get_challenge<FF_ct>("Sumcheck:gate_challenge");

        for (auto [element, shifted_element] : zip_view(evaluations.get_to_be_shifted(), evaluations.get_shifted())) {
            shifted_element = element;
        }
        FF_ct libra_evaluation = transcript->template receive_from_prover<FF_ct>("libra_evaluation");

        // auto sumcheck = SumcheckVerifier<RecursiveFlavor>(log_circuit_size, transcript, ff_ct(0));
        SumcheckVerifierRound<RecursiveFlavor> round;
        std::vector temp = { FF_ct(0) };
        PowPolynomial<FF_ct> pow_polynomial(temp);
        pow_polynomial.partial_evaluation_result = pow_evaluation;
        round.compute_full_honk_relation_purported_value(
            evaluations, relation_parameters, pow_polynomial, alphas, libra_evaluation);
    }
};

// Run the recursive verifier tests with conventional Ultra builder and Goblin builder
using Flavors = testing::Types<MegaRecursiveFlavor_<MegaCircuitBuilder>,
                               MegaRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraRecursiveFlavor_<CircuitSimulatorBN254>,
                               MegaRecursiveFlavor_<CircuitSimulatorBN254>>;

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
    if constexpr (std::same_as<TypeParam, UltraRecursiveFlavor_<UltraCircuitBuilder>>) {
        TestFixture::test_independent_vk_hash();
    } else {
        GTEST_SKIP() << "Not built for this parameter";
    }
};

HEAVY_TYPED_TEST(RecursiveVerifierTest, SingleRecursiveVerificationFailure)
{
    TestFixture::test_recursive_verification_fails();
};

TYPED_TEST(RecursiveVerifierTest, RelationTags)
{
    TestFixture::test_full_relation_tags();
}

} // namespace bb::stdlib::recursion::honk