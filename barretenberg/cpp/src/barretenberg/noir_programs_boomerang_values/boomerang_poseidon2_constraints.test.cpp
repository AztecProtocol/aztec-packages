#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

namespace {

// Helper to create WitnessOrConstant from index
WitnessOrConstant<fr> witness_from_index(uint32_t idx)
{
    return WitnessOrConstant<fr>::from_index(idx);
}

// Helper to build AcirFormat from individual constraints through the full ACIR serde flow
template <typename... Constraints> AcirFormat build_acir_format(const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes), /*is_mega=*/false);
}

struct Poseidon2TestContext {
    Poseidon2Constraint constraint;
    WitnessVector witness;
};

/**
 * @brief Creates a correctly-formed Poseidon2 constraint with actual permutation outputs
 * @details Computes the Poseidon2 permutation of the given inputs and stores the correct
 *          output values at result witness indices 4-7.
 */
Poseidon2TestContext make_poseidon2_test_context(std::array<fr, 4> inputs)
{
    using Poseidon2 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    using State = typename Poseidon2::State;

    State input_state = { inputs[0], inputs[1], inputs[2], inputs[3] };
    State output_state = Poseidon2::permutation(input_state);

    return {
        Poseidon2Constraint{
            .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
            .result = { 4, 5, 6, 7 },
        },
        WitnessVector{ inputs[0],
                       inputs[1],
                       inputs[2],
                       inputs[3],
                       output_state[0],
                       output_state[1],
                       output_state[2],
                       output_state[3] }
    };
}

/**
 * @brief Runs a matrix layer (arithmetic block) corruption test
 * @param find_gate  Predicate returning true when the gate to corrupt is found
 * @param corrupt_gate  Mutates the gate at the found index
 * @param expect_circuit_checker_fail  If true, asserts CircuitChecker detects the corruption
 */
template <typename FindFn, typename CorruptFn>
void run_arith_corruption_test(FindFn find_gate, CorruptFn corrupt_gate, bool expect_circuit_checker_fail)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& block = builder.blocks.arithmetic;
    bool found = false;
    for (size_t i = 0; i < block.size() && !found; i++) {
        if (find_gate(block, i)) {
            corrupt_gate(block, i);
            found = true;
        }
    }
    ASSERT_TRUE(found) << "Could not find matrix layer gate to corrupt";
    if (expect_circuit_checker_fail) {
        EXPECT_FALSE(CircuitChecker::check(builder));
    }

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect.empty());
    EXPECT_GT(incorrect.count(0), 0U);
}

/**
 * @brief Runs an external round corruption test
 * @param corrupt_gate  Mutates the first enabled external gate found
 */
template <typename CorruptFn> void run_ext_round_corruption_test(CorruptFn corrupt_gate)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& block = builder.blocks.poseidon2_external;
    ASSERT_GT(block.size(), 0U) << "No external round gates found";
    bool found = false;
    for (size_t i = 0; i < block.size() && !found; i++) {
        if (block.gate_selector_for(bb::GateKind::Poseidon2Ext)[i] == fr::one()) {
            corrupt_gate(block, i);
            found = true;
        }
    }
    ASSERT_TRUE(found) << "Could not find external round gate to corrupt";

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect.empty());
    EXPECT_GT(incorrect.count(0), 0U);
}

/**
 * @brief Runs an internal round corruption test
 * @param corrupt_gate  Mutates the first enabled internal gate found
 */
template <typename CorruptFn> void run_int_round_corruption_test(CorruptFn corrupt_gate)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& block = builder.blocks.poseidon2_internal;
    ASSERT_GT(block.size(), 0U) << "No internal round gates found";
    bool found = false;
    for (size_t i = 0; i < block.size() && !found; i++) {
        if (block.gate_selector_for(bb::GateKind::Poseidon2Int)[i] == fr::one()) {
            corrupt_gate(block, i);
            found = true;
        }
    }
    ASSERT_TRUE(found) << "Could not find internal round gate to corrupt";

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect.empty());
    EXPECT_GT(incorrect.count(0), 0U);
}

} // namespace

/**
 * @brief Test suite for Poseidon2 constraint processing in StaticAnalyzerAcir
 * @details Tests validate the analyzer's ability to verify Poseidon2 permutation circuits,
 *          including the matrix multiplication layer (6 arithmetic gates), external rounds,
 *          and internal rounds. Corruption tests verify detection of tampered circuits.
 */
class BoomerangPoseidon2ConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// =============================================================================
// Valid circuit tests
// =============================================================================

/**
 * @brief Test basic Poseidon2 constraint processing
 * @details Creates a valid Poseidon2 constraint and verifies the analyzer processes it correctly
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, BasicPoseidon2Constraint)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 with zero inputs
 * @details Verifies Poseidon2 works correctly when all inputs are zero
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2ZeroInputs)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(0), fr(0), fr(0), fr(0) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 with large field element inputs
 * @details Verifies Poseidon2 works correctly with random values
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2LargeInputs)
{
    std::array<fr, 4> inputs = {
        fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
    };
    auto [constraint, witness] = make_poseidon2_test_context(inputs);
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

// =============================================================================
// Matrix layer corruption tests (7 separate tests, one per selector)
// =============================================================================

/**
 * @brief Test that corrupting matrix layer q_1 selector is detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedMatrixLayerSelectors)
{
    // corrupting matrix layer q_1 selector is detected
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(2) && b.q_4()[i] == fr(-1);
        },
        [](auto& b, size_t i) { b.q_1().set(i, fr(2)); },
        /*expect_circuit_checker_fail=*/true);

    // corrupting matrix layer q_4 selector is detected
    run_arith_corruption_test(
        [](auto& b, size_t i) { return b.q_4()[i] == fr(-1) && b.gate_selector_for(bb::GateKind::Arith)[i] == fr(1); },
        [](auto& b, size_t i) { b.q_4().set(i, fr(-2)); },
        /*expect_circuit_checker_fail=*/true);

    // corrupting matrix layer q_m selector is detected
    // Matrix layer gates should have q_m=0; setting it non-zero should be detected
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(2) && b.q_4()[i] == fr(-1) &&
                   b.q_m()[i] == fr::zero();
        },
        [](auto& b, size_t i) { b.q_m().set(i, fr(1)); },
        /*expect_circuit_checker_fail=*/true);

    // corrupting q_arith in matrix layer is detected
    // Matrix layer gates should have q_arith=1; setting it to 0 disables the gate
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(2) && b.q_4()[i] == fr(-1) &&
                   b.gate_selector_for(bb::GateKind::Arith)[i] == fr(1);
        },
        [](auto& b, size_t i) { b.gate_selector_for(bb::GateKind::Arith).set(i, fr(0)); },
        /*expect_circuit_checker_fail=*/false);

    // test that corrupting matrix layer q_2 selector is detected
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(2) && b.q_4()[i] == fr(-1);
        },
        [](auto& b, size_t i) { b.q_2().set(i, fr(3)); },
        /*expect_circuit_checker_fail=*/true);

    // test that corrupting matrix layer q_3 selector is detected
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(2) && b.q_4()[i] == fr(-1);
        },
        [](auto& b, size_t i) { b.q_3().set(i, fr(5)); },
        /*expect_circuit_checker_fail=*/true);

    // test that corrupting matrix layer q_c selector is detected for operator+ gates
    run_arith_corruption_test(
        [](auto& b, size_t i) {
            return b.q_1()[i] == fr(1) && b.q_2()[i] == fr(1) && b.q_3()[i] == fr(-1) && b.q_4()[i] == fr(0) &&
                   b.q_c()[i] == fr(0);
        },
        [](auto& b, size_t i) { b.q_c().set(i, fr(1)); },
        /*expect_circuit_checker_fail=*/true);
}

// =============================================================================
// External round corruption tests
// =============================================================================

/**
 * @brief Test that corrupting q_poseidon2_external selector is detected
 * @details External rounds require q_poseidon2_external=1; disabling it should be detected
 * Note: CircuitChecker may not detect disabled poseidon2 selector
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRoundSelector)
{
    auto [constraint, witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });
    auto constraint_system = build_acir_format(constraint);
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    auto& ext_block = builder.blocks.poseidon2_external;
    ASSERT_GT(ext_block.size(), 0U) << "No external round gates found";
    bool found_gate = false;
    for (size_t i = 0; i < ext_block.size() && !found_gate; i++) {
        if (ext_block.gate_selector_for(bb::GateKind::Poseidon2Ext)[i] == fr::one()) {
            ext_block.gate_selector_for(bb::GateKind::Poseidon2Ext).set(i, fr::zero());
            found_gate = true;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find external round gate to corrupt";
    // Note: CircuitChecker may not detect disabled poseidon2 selector

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    auto incorrect = analyzer.get_incorrect_opcodes();
    EXPECT_FALSE(incorrect.empty());
    EXPECT_GT(incorrect.count(0), 0U);
}

/**
 * @brief Test that corrupting external round constants (q_1, q_2, q_3, q_4) is detected
 * @details Round constants are fixed by the Poseidon2 algorithm; changing any of them should be detected
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedExternalRoundConstants)
{
    // Corrupt q_1 (first round constant element)
    run_ext_round_corruption_test([](auto& b, size_t i) { b.q_1().set(i, b.q_1()[i] + fr(1)); });
    // Corrupt q_2 (second round constant element)
    run_ext_round_corruption_test([](auto& b, size_t i) { b.q_2().set(i, b.q_2()[i] + fr(1)); });
    // Corrupt q_3 (third round constant element)
    run_ext_round_corruption_test([](auto& b, size_t i) { b.q_3().set(i, b.q_3()[i] + fr(1)); });
    // Corrupt q_4 (fourth round constant element)
    run_ext_round_corruption_test([](auto& b, size_t i) { b.q_4().set(i, b.q_4()[i] + fr(1)); });
}

// =============================================================================
// Internal round corruption tests
// =============================================================================

/**
 * @brief Test that corrupting internal round selector and round constant is detected
 * @details Tests both: disabling the enabling selector and corrupting the round constant q_1
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, DetectCorruptedInternalRound)
{
    // Corrupt enabling selector (disable the gate)
    run_int_round_corruption_test(
        [](auto& b, size_t i) { b.gate_selector_for(bb::GateKind::Poseidon2Int).set(i, fr::zero()); });
    // Corrupt round constant q_1
    run_int_round_corruption_test([](auto& b, size_t i) { b.q_1().set(i, b.q_1()[i] + fr(1)); });
}

// =============================================================================
// Mixed constraint tests
// =============================================================================

/**
 * @brief Test multiple Poseidon2 constraints in sequence
 * @details Verifies analyzer handles multiple independent Poseidon2 operations.
 *          Uses completely independent witness sets to avoid copy constraint interference.
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, MultiplePoseidon2Constraints)
{
    using Poseidon2 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;
    using State = typename Poseidon2::State;

    // First Poseidon2: inputs 0-3, outputs 4-7
    State input_state1 = { fr(1), fr(2), fr(3), fr(4) };
    State output_state1 = Poseidon2::permutation(input_state1);

    // Second Poseidon2: inputs 8-11, outputs 12-15 (completely independent)
    State input_state2 = { fr(10), fr(20), fr(30), fr(40) };
    State output_state2 = Poseidon2::permutation(input_state2);

    Poseidon2Constraint poseidon_constraint1{
        .state = { witness_from_index(0), witness_from_index(1), witness_from_index(2), witness_from_index(3) },
        .result = { 4, 5, 6, 7 },
    };
    Poseidon2Constraint poseidon_constraint2{
        .state = { witness_from_index(8), witness_from_index(9), witness_from_index(10), witness_from_index(11) },
        .result = { 12, 13, 14, 15 },
    };

    auto constraint_system = build_acir_format(poseidon_constraint1, poseidon_constraint2);

    WitnessVector witness = { input_state1[0],  input_state1[1],  input_state1[2],  input_state1[3],
                              output_state1[0], output_state1[1], output_state1[2], output_state1[3],
                              input_state2[0],  input_state2[1],  input_state2[2],  input_state2[3],
                              output_state2[0], output_state2[1], output_state2[2], output_state2[3] };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 mixed with other constraint types
 * @details Verifies analyzer handles Poseidon2 alongside range constraints
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithRangeConstraints)
{
    auto [poseidon_constraint, witness] = make_poseidon2_test_context({ fr(100), fr(200), fr(300), fr(400) });
    // Range constraints use witnesses 0 and 1, which are already in the witness vector
    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    auto constraint_system = build_acir_format(poseidon_constraint, range_0, range_1);

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 mixed with QUAD constraint
 * @details Verifies analyzer handles Poseidon2 alongside a standalone QUAD constraint
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithQuadConstraint)
{
    auto [poseidon_constraint, poseidon_witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });

    // QUAD constraint: a*b*mul + a*a_sc + b*b_sc + c*c_sc + d*d_sc + const = 0
    // With a=2, b=3, c=4: 2*3*1 + 2*1 + 3*1 + 4*1 = 6+2+3+4 = 15, so d=15 with d_scaling=-1
    QuadConstraint quad_constraint{
        .a = 8,
        .b = 9,
        .c = 10,
        .d = 11,
        .mul_scaling = fr(1),
        .a_scaling = fr(1),
        .b_scaling = fr(1),
        .c_scaling = fr(1),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(poseidon_constraint, quad_constraint);

    // Witness: poseidon inputs/outputs (0-7), quad wires (8-11)
    WitnessVector witness = poseidon_witness;
    witness.insert(witness.end(), { fr(2), fr(3), fr(4), fr(15) });

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 mixed with BIG_QUAD constraint
 * @details Verifies analyzer handles Poseidon2 alongside a BigQuadConstraint (chain of gates).
 *          Note: BIG_QUAD requires using program.constraints (mutated by create_circuit).
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithBigQuadConstraint)
{
    auto [poseidon_constraint, poseidon_witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });

    // BigQuadConstraint with 2 gates
    // Gate 0: a*b + a + b + c + d*0 => intermediate stored in next gate's w_4
    // Gate 1: a*b + a + b + c - d + intermediate = 0
    BigQuadConstraint big_quad_constraint = {
        QuadConstraint{
            .a = 8,
            .b = 9,
            .c = 10,
            .d = 11,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(0), // Will be set by create_big_quad_constraint
            .const_scaling = fr(0),
        },
        QuadConstraint{
            .a = 12,
            .b = 13,
            .c = 14,
            .d = 15,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(-1),
            .const_scaling = fr(0),
        },
    };

    auto constraint_system = build_acir_format(poseidon_constraint, big_quad_constraint);

    // BigQuad gate 0: a=2, b=3, c=4, d=5 => intermediate = 2*3 + 2 + 3 + 4 + 5*0 = 15
    // BigQuad gate 1: a=1, b=2, c=3, d=? => 1*2 + 1 + 2 + 3 - d + 15 = 0 => d = 23
    WitnessVector witness = poseidon_witness;
    witness.insert(witness.end(), { fr(2), fr(3), fr(4), fr(5), fr(1), fr(2), fr(3), fr(23) });

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Use program.constraints (mutated by create_circuit) for BIG_QUAD
    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}

/**
 * @brief Test Poseidon2 mixed with both QUAD and BIG_QUAD constraints
 * @details Verifies analyzer handles all three constraint types together.
 *          Note: BIG_QUAD requires using program.constraints (mutated by create_circuit).
 */
TEST_F(BoomerangPoseidon2ConstraintsTests, Poseidon2MixedWithQuadAndBigQuad)
{
    auto [poseidon_constraint, poseidon_witness] = make_poseidon2_test_context({ fr(1), fr(2), fr(3), fr(4) });

    // Simple QUAD: a*b + a + b + c - d = 0
    QuadConstraint quad_constraint{
        .a = 8,
        .b = 9,
        .c = 10,
        .d = 11,
        .mul_scaling = fr(1),
        .a_scaling = fr(1),
        .b_scaling = fr(1),
        .c_scaling = fr(1),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    // BigQuadConstraint with 2 gates
    BigQuadConstraint big_quad_constraint = {
        QuadConstraint{
            .a = 12,
            .b = 13,
            .c = 14,
            .d = 15,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(0),
            .const_scaling = fr(0),
        },
        QuadConstraint{
            .a = 16,
            .b = 17,
            .c = 18,
            .d = 19,
            .mul_scaling = fr(1),
            .a_scaling = fr(1),
            .b_scaling = fr(1),
            .c_scaling = fr(1),
            .d_scaling = fr(-1),
            .const_scaling = fr(0),
        },
    };

    auto constraint_system = build_acir_format(poseidon_constraint, quad_constraint, big_quad_constraint);

    // Poseidon: 0-7 (via poseidon_witness)
    // QUAD (8-11): a=2, b=3, c=4, d = 2*3 + 2 + 3 + 4 = 15
    // BigQuad gate 0 (12-15): a=2, b=3, c=4, d=5 => intermediate = 15
    // BigQuad gate 1 (16-19): a=1, b=2, c=3, d = 2 + 1 + 2 + 3 + 15 = 23
    WitnessVector witness = poseidon_witness;
    witness.insert(witness.end(),
                   { fr(2), fr(3), fr(4), fr(15), fr(2), fr(3), fr(4), fr(5), fr(1), fr(2), fr(3), fr(23) });

    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Use program.constraints (mutated by create_circuit) for BIG_QUAD
    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
}
