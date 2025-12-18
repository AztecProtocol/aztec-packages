#include "honk_recursion_constraint.hpp"
#include "acir_format.hpp"
#include "acir_format_mocks.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/dsl/acir_format/gate_count_constants.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include "proof_surgeon.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace acir_format;
using namespace bb;

template <typename RecursiveFlavor> class AcirHonkRecursionConstraint : public ::testing::Test {

  public:
    using InnerFlavor = typename RecursiveFlavor::NativeFlavor;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerProver = bb::UltraProver_<InnerFlavor>;
    using InnerVerificationKey = typename InnerFlavor::VerificationKey;
    using InnerIO = std::conditional_t<bb::HasIPAAccumulator<InnerFlavor>, bb::RollupIO, bb::DefaultIO>;
    using InnerVerifier = bb::UltraVerifier_<InnerFlavor, InnerIO>;
    using OuterBuilder = typename RecursiveFlavor::CircuitBuilder;
    using OuterFlavor =
        std::conditional_t<IsMegaBuilder<OuterBuilder>,
                           MegaFlavor,
                           std::conditional_t<HasIPAAccumulator<InnerFlavor>, UltraRollupFlavor, UltraFlavor>>;
    using OuterIO = std::conditional_t<bb::HasIPAAccumulator<OuterFlavor>, bb::RollupIO, bb::DefaultIO>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;
    using OuterProver = bb::UltraProver_<OuterFlavor>;
    using OuterVerificationKey = typename OuterFlavor::VerificationKey;
    using OuterVerifier = bb::UltraVerifier_<OuterFlavor, OuterIO>;

    InnerBuilder create_inner_circuit()
    {
        InnerBuilder builder;

        MockCircuits::add_arithmetic_gates(builder);
        MockCircuits::add_lookup_gates(builder);

        builder.add_public_variable(fr::one());
        builder.add_public_variable(fr::one());

        if constexpr (HasIPAAccumulator<InnerFlavor>) {
            bb::stdlib::recursion::honk::RollupIO::add_default(builder);
        } else {
            bb::stdlib::recursion::honk::DefaultIO<InnerBuilder>::add_default(builder);
        }

        return builder;
    }

    /**
     * @brief Create a circuit that recursively verifies one or more circuits
     * @details This function is parametized by BuilderType because we want to use this function to produce
     * Ultra/UltraRollup circuits sometimes and also Mega circuits other times.
     * @tparam BuilderType
     * @param inner_circuits
     * @return Composer
     */
    template <typename BuilderType>
    BuilderType create_outer_circuit(std::vector<InnerBuilder>& inner_circuits,
                                     bool dummy_witnesses,
                                     bool predicate_val)
    {
        std::vector<RecursionConstraint> honk_recursion_constraints;

        std::vector<fr> witness;

        for (auto& inner_circuit : inner_circuits) {

            auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
            auto verification_key = std::make_shared<InnerVerificationKey>(prover_instance->get_precomputed());
            InnerProver prover(prover_instance, verification_key);
            auto vk_and_hash = std::make_shared<typename InnerFlavor::VKAndHash>(verification_key);
            InnerVerifier verifier(vk_and_hash);
            auto inner_proof = prover.construct_proof();

            std::vector<bb::fr> key_witnesses = verification_key->to_field_elements();
            fr key_hash_witness = verification_key->hash();
            std::vector<fr> proof_witnesses = inner_proof;

            // Compute the number of public inputs to extract (the ones from the circuit) and the proof type based on
            // the Flavor
            auto [num_public_inputs_to_extract, proof_type] = [&]() -> std::pair<size_t, acir_format::PROOF_TYPE> {
                size_t num_public_inputs_to_extract = inner_circuit.num_public_inputs();
                if constexpr (HasIPAAccumulator<InnerFlavor>) {
                    return { num_public_inputs_to_extract - RollupIO::PUBLIC_INPUTS_SIZE, ROLLUP_HONK };
                } else if constexpr (InnerFlavor::HasZK) {
                    return { num_public_inputs_to_extract - DefaultIO::PUBLIC_INPUTS_SIZE, HONK_ZK };
                } else {
                    return { num_public_inputs_to_extract - DefaultIO::PUBLIC_INPUTS_SIZE, HONK };
                }
            }();

            auto [key_indices, key_hash_index, proof_indices, inner_public_inputs] =
                ProofSurgeon<fr>::populate_recursion_witness_data(
                    witness, proof_witnesses, key_witnesses, key_hash_witness, num_public_inputs_to_extract);

            uint32_t predicate_index = add_to_witness_and_track_indices(witness, predicate_val ? fr(1) : fr(0));
            auto predicate = WitnessOrConstant<fr>::from_index(predicate_index);

            RecursionConstraint honk_recursion_constraint{
                .key = key_indices,
                .proof = proof_indices,
                .public_inputs = inner_public_inputs,
                .key_hash = key_hash_index,
                .proof_type = proof_type,
                .predicate = predicate,
            };
            honk_recursion_constraints.push_back(honk_recursion_constraint);
        }

        AcirFormat constraint_system{};
        constraint_system.max_witness_index = static_cast<uint32_t>(witness.size() - 1);
        constraint_system.num_acir_opcodes = static_cast<uint32_t>(honk_recursion_constraints.size());
        constraint_system.honk_recursion_constraints = honk_recursion_constraints;
        constraint_system.original_opcode_indices = create_empty_original_opcode_indices();

        mock_opcode_indices(constraint_system);
        bool constexpr has_ipa_claim = IsAnyOf<InnerFlavor, UltraRollupFlavor>;

        ProgramMetadata metadata{ .has_ipa_claim = has_ipa_claim };
        if (dummy_witnesses) {
            witness = {}; // set it all to 0
        }
        AcirProgram program{ constraint_system, witness };
        auto outer_circuit = create_circuit<BuilderType>(program, metadata);

        return outer_circuit;
    }

    bool verify_proof(const std::shared_ptr<OuterVerificationKey>& verification_key, const HonkProof& proof)
    {
        auto vk_and_hash = std::make_shared<typename OuterFlavor::VKAndHash>(verification_key);
        OuterVerifier verifier(vk_and_hash);
        return verifier.verify_proof(proof).result;
    }

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using Flavors = testing::Types<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRollupRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraRecursiveFlavor_<MegaCircuitBuilder>,
                               UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                               UltraZKRecursiveFlavor_<MegaCircuitBuilder>>;

TYPED_TEST_SUITE(AcirHonkRecursionConstraint, Flavors);

TYPED_TEST(AcirHonkRecursionConstraint, TestHonkRecursionConstraintVKGeneration)
{
#ifndef NDEBUG
    BB_DISABLE_ASSERTS();
#endif
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit = TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(
        layer_1_circuits, /*dummy_witnesses=*/false, /*predicate_val=*/true);

    auto layer_2_circuit_with_dummy_witnesses =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits,
                                                                                       /*dummy_witnesses=*/true,
                                                                                       /*predicate_val=*/true);

    auto prover_instance = std::make_shared<typename TestFixture::OuterProverInstance>(layer_2_circuit);
    auto verification_key =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance->get_precomputed());

    auto prover_instance_dummy =
        std::make_shared<typename TestFixture::OuterProverInstance>(layer_2_circuit_with_dummy_witnesses);
    auto verification_key_dummy =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance_dummy->get_precomputed());

    // Compare the two vks
    EXPECT_EQ(*verification_key_dummy, *verification_key);
}

TYPED_TEST(AcirHonkRecursionConstraint, TestBasicSingleHonkRecursionConstraint)
{
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true);

    auto prover_instance = std::make_shared<typename TestFixture::OuterProverInstance>(layer_2_circuit);
    auto verification_key =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::OuterProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    EXPECT_EQ(TestFixture::verify_proof(verification_key, proof), true);
}

TYPED_TEST(AcirHonkRecursionConstraint, TestBasicDoubleHonkRecursionConstraints)
{
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    auto layer_2_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_1_circuits, false, false);

    auto prover_instance = std::make_shared<typename TestFixture::OuterProverInstance>(layer_2_circuit);
    auto verification_key =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::OuterProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    EXPECT_EQ(TestFixture::verify_proof(verification_key, proof), true);
}

TYPED_TEST(AcirHonkRecursionConstraint, TestOneOuterRecursiveCircuit)
{
    /**
     * We want to test the following:
     * 1. circuit that verifies a proof of another circuit
     * 2. the above, but the inner circuit contains a recursive proof output that we have to aggregate
     * 3. the above, but the outer circuit verifies 2 proofs, the aggregation outputs from the 2 proofs (+ the
     recursive
     * proof output from 2) are aggregated together
     *
     * A = basic circuit
     * B = circuit that verifies proof of A
     * C = circuit that verifies proof of B and a proof of A
     *
     * Layer 1 = proof of A
     * Layer 2 = verifies proof of A and proof of B
     * Layer 3 = verifies proof of C
     *
     * Attempt at a visual graphic
     * ===========================
     *
     *     C
     *     ^
     *     |
     *     | - B
     *     ^   ^
     *     |   |
     *     |    -A
     *     |
     *      - A
     *
     * ===========================
     *
     * Final aggregation object contains aggregated proofs for 2 instances of A and 1 instance of B
     */
    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());
    info("created first inner circuit");

    std::vector<typename TestFixture::InnerBuilder> layer_2_circuits;
    layer_2_circuits.push_back(TestFixture::create_inner_circuit());
    info("created second inner circuit");

    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_1_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true));
    info("created first outer circuit");

    auto layer_3_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_2_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true);
    info("created second outer circuit");

    auto prover_instance = std::make_shared<typename TestFixture::OuterProverInstance>(layer_3_circuit);
    auto verification_key =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::OuterProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    EXPECT_EQ(TestFixture::verify_proof(verification_key, proof), true);
}

/**
 * @brief Similar to previous test but one extra node in tree of recursion.
 * @details Layer 1 is two separate circuits, layer 2 is two circuits, each which verify one circuit of layer 1. The
 * layer 3 circuit verifies both circuits of layer 2.
 *
 * ===========================
 *
 *       C
 *       ^
 *       |
 *     B - B
 *     ^   ^
 *     |   |
 *     A   A
 *
 * ===========================
 */
TYPED_TEST(AcirHonkRecursionConstraint, TestFullRecursiveComposition)
{
    std::vector<typename TestFixture::InnerBuilder> layer_b_1_circuits;
    layer_b_1_circuits.push_back(TestFixture::create_inner_circuit());
    info("created first inner circuit");

    std::vector<typename TestFixture::InnerBuilder> layer_b_2_circuits;
    layer_b_2_circuits.push_back(TestFixture::create_inner_circuit());
    info("created second inner circuit");

    std::vector<typename TestFixture::InnerBuilder> layer_2_circuits;
    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_b_1_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true));
    info("created first outer circuit");

    layer_2_circuits.push_back(
        TestFixture::template create_outer_circuit<typename TestFixture::InnerBuilder>(layer_b_2_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true));
    info("created second outer circuit");

    auto layer_3_circuit =
        TestFixture::template create_outer_circuit<typename TestFixture::OuterBuilder>(layer_2_circuits,
                                                                                       /*dummy_witnesses=*/false,
                                                                                       /*predicate_val=*/true);
    info("created third outer circuit");

    auto prover_instance = std::make_shared<typename TestFixture::OuterProverInstance>(layer_3_circuit);
    auto verification_key =
        std::make_shared<typename TestFixture::OuterVerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::OuterProver prover(prover_instance, verification_key);
    auto proof = prover.construct_proof();

    EXPECT_EQ(TestFixture::verify_proof(verification_key, proof), true);
}

TYPED_TEST(AcirHonkRecursionConstraint, GateCountSingleHonkRecursion)
{
    using InnerFlavor = TestFixture::InnerFlavor;
    using RecursiveFlavor = TypeParam;
    using InnerVerificationKey = TestFixture::InnerVerificationKey;
    using InnerProverInstance = TestFixture::InnerProverInstance;
    using OuterBuilder = TestFixture::OuterBuilder;

    std::vector<typename TestFixture::InnerBuilder> layer_1_circuits;
    layer_1_circuits.push_back(TestFixture::create_inner_circuit());

    // Create outer circuit with gate counting enabled
    std::vector<RecursionConstraint> honk_recursion_constraints;
    std::vector<fr> witness;

    auto& inner_circuit = layer_1_circuits[0];
    auto prover_instance = std::make_shared<InnerProverInstance>(inner_circuit);
    auto verification_key = std::make_shared<InnerVerificationKey>(prover_instance->get_precomputed());
    typename TestFixture::InnerProver prover(prover_instance, verification_key);
    auto inner_proof = prover.construct_proof();

    std::vector<bb::fr> key_witnesses = verification_key->to_field_elements();
    fr key_hash_witness = verification_key->hash();

    auto [num_public_inputs_to_extract, proof_type] = [&]() -> std::pair<size_t, acir_format::PROOF_TYPE> {
        size_t num_public_inputs_to_extract = inner_circuit.num_public_inputs();
        if constexpr (HasIPAAccumulator<InnerFlavor>) {
            return { num_public_inputs_to_extract - RollupIO::PUBLIC_INPUTS_SIZE, ROLLUP_HONK };
        } else if constexpr (InnerFlavor::HasZK) {
            return { num_public_inputs_to_extract - DefaultIO::PUBLIC_INPUTS_SIZE, HONK_ZK };
        } else {
            return { num_public_inputs_to_extract - DefaultIO::PUBLIC_INPUTS_SIZE, HONK };
        }
    }();

    auto [key_indices, key_hash_index, proof_indices, inner_public_inputs] =
        ProofSurgeon<fr>::populate_recursion_witness_data(
            witness, inner_proof, key_witnesses, key_hash_witness, num_public_inputs_to_extract);

    // We pin the number of gates with predicate set to witness true, so this is an upper bound for when the constraint
    // is added with a constant predicate
    uint32_t predicate_index = add_to_witness_and_track_indices(witness, fr(1));
    auto predicate = WitnessOrConstant<fr>::from_index(predicate_index);

    RecursionConstraint honk_recursion_constraint{
        .key = key_indices,
        .proof = proof_indices,
        .public_inputs = inner_public_inputs,
        .key_hash = key_hash_index,
        .proof_type = proof_type,
        .predicate = predicate,
    };
    honk_recursion_constraints.push_back(honk_recursion_constraint);

    AcirFormat constraint_system{};
    constraint_system.max_witness_index = static_cast<uint32_t>(witness.size() - 1);
    constraint_system.num_acir_opcodes = 1;
    constraint_system.honk_recursion_constraints = honk_recursion_constraints;
    constraint_system.original_opcode_indices = create_empty_original_opcode_indices();
    mock_opcode_indices(constraint_system);

    bool constexpr has_ipa_claim = IsAnyOf<InnerFlavor, UltraRollupFlavor>;
    ProgramMetadata metadata{ .has_ipa_claim = has_ipa_claim, .collect_gates_per_opcode = true };

    AcirProgram program{ constraint_system, witness };
    auto outer_circuit = create_circuit<OuterBuilder>(program, metadata);

    // Verify the gate count was recorded
    EXPECT_EQ(program.constraints.gates_per_opcode.size(), 1);

    // Get expected values from shared constants
    static auto [EXPECTED_GATE_COUNT, EXPECTED_ECC_ROWS, EXPECTED_ULTRA_OPS] =
        HONK_RECURSION_CONSTANTS<RecursiveFlavor>;

    // Assert gate count
    EXPECT_EQ(program.constraints.gates_per_opcode[0], EXPECTED_GATE_COUNT);

    // For MegaBuilder, also assert ECC row count and ultra ops count
    if constexpr (IsMegaBuilder<OuterBuilder>) {
        size_t actual_ecc_rows = outer_circuit.op_queue->get_num_rows();
        EXPECT_EQ(actual_ecc_rows, EXPECTED_ECC_ROWS);
        size_t actual_ultra_ops = outer_circuit.op_queue->get_current_subtable_size();
        EXPECT_EQ(actual_ultra_ops, EXPECTED_ULTRA_OPS);
    }
}
