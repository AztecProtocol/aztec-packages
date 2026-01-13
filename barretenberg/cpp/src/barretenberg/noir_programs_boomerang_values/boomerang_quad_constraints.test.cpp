#include "barretenberg/boomerang_value_detection/graph_description_acir.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/test_class.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>
#include <vector>

using namespace bb;
using namespace acir_format;
using namespace cdg;

class BoomerangQuadConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// Helper to create WitnessOrConstant from witness index
static WitnessOrConstant<fr> witness_from_index(uint32_t idx)
{
    return WitnessOrConstant<fr>::from_index(idx);
}

// Helper to build AcirFormat from individual constraints through the full ACIR serde flow
template <typename... Constraints>
static AcirFormat build_acir_format(uint32_t max_witness_index, const Constraints&... constraints)
{
    std::vector<Acir::Opcode> opcodes;
    auto collect = [&opcodes](const auto& constraint) {
        auto ops = constraint_to_acir_opcode(constraint);
        opcodes.insert(opcodes.end(), ops.begin(), ops.end());
    };
    (collect(constraints), ...);
    (void)max_witness_index; // No longer needed by build_acir_circuit
    return circuit_serde_to_acir_format(build_acir_circuit(opcodes));
}

/**
 * @brief Helper: find the quad gate index in the arithmetic block
 * @details Searches for a gate with q_arith==1 and q_m==mul_scaling to locate the quad gate
 */
static std::optional<size_t> find_quad_gate(UltraCircuitBuilder& builder, fr expected_q_m)
{
    auto& arith_block = builder.blocks.arithmetic;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_arith()[i] == fr::one() && arith_block.q_m()[i] == expected_q_m) {
            return i;
        }
    }
    return std::nullopt;
}

// =====================================================================================
// Valid circuit tests - verify process_quad_constraints accepts correct circuits
// =====================================================================================

/**
 * @brief Test a simple multiplication gate: a * b - c = 0
 * @details Single quad constraint with mul_scaling=1, c_scaling=-1, d unused (IS_CONSTANT)
 */
TEST_F(BoomerangQuadConstraintsTests, SimpleMultiplicationGate)
{
    // Equation: 1*(a*b) + 0*a + 0*b + (-1)*c + 0*d + 0 = 0
    // => a * b = c
    // Witnesses: a=3, b=7, c=21
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(2, quad);

    WitnessVector witness = { fr(3), fr(7), fr(21) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test a pure linear combination: a + 2*b + 3*c + 4*d - 30 = 0
 * @details No multiplication term (mul_scaling=0), all four wires used
 */
TEST_F(BoomerangQuadConstraintsTests, LinearCombinationGate)
{
    // Equation: 0*(a*b) + 1*a + 2*b + 3*c + 4*d + (-30) = 0
    // Witnesses: a=1, b=2, c=3, d=4 => 1 + 4 + 9 + 16 = 30
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr(0),
        .a_scaling = fr(1),
        .b_scaling = fr(2),
        .c_scaling = fr(3),
        .d_scaling = fr(4),
        .const_scaling = fr(-30),
    };

    auto constraint_system = build_acir_format(3, quad);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test full equation with multiplication and linear terms on all wires
 * @details 2*(a*b) + 3*a + (-1)*b + c + (-2)*d + 5 = 0
 */
TEST_F(BoomerangQuadConstraintsTests, FullEquationAllWires)
{
    // Equation: 2*(a*b) + 3*a + (-1)*b + 1*c + (-2)*d + 5 = 0
    // a=2, b=3: 2*6 + 6 - 3 + c - 2d + 5 = 20 + c - 2d
    // c=2, d=11: 20 + 2 - 22 = 0
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr(2),
        .a_scaling = fr(3),
        .b_scaling = fr(-1),
        .c_scaling = fr(1),
        .d_scaling = fr(-2),
        .const_scaling = fr(5),
    };

    auto constraint_system = build_acir_format(3, quad);

    WitnessVector witness = { fr(2), fr(3), fr(2), fr(11) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test minimal constraint with only a_scaling and const: 2*a - 84 = 0
 * @details b, c, d are IS_CONSTANT with zero scaling.
 *          Uses a_scaling=2 to avoid matching the fixed_witness gate pattern
 *          (q_m=0, q_1=1, q_2=0, q_3=0, q_4=0) in the static analyzer.
 */
TEST_F(BoomerangQuadConstraintsTests, MinimalSingleWireConstraint)
{
    // Equation: 2*a - 84 = 0
    QuadConstraint quad{
        .a = 0,
        .b = bb::stdlib::IS_CONSTANT,
        .c = bb::stdlib::IS_CONSTANT,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(0),
        .a_scaling = fr(2),
        .b_scaling = fr(0),
        .c_scaling = fr(0),
        .d_scaling = fr(0),
        .const_scaling = fr(-84),
    };

    auto constraint_system = build_acir_format(0, quad);

    WitnessVector witness = { fr(42) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test multiple quad constraints in one constraint system
 * @details Two independent equations sharing no witnesses:
 *          Gate 0: a * b - c = 0  (witnesses 0,1,2)
 *          Gate 1: d + e - 10 = 0 (witnesses 3,4)
 */
TEST_F(BoomerangQuadConstraintsTests, MultipleQuadConstraints)
{
    // Gate 0: a * b = c
    QuadConstraint quad_0{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    // Gate 1: d + e - 10 = 0
    QuadConstraint quad_1{
        .a = 3,
        .b = bb::stdlib::IS_CONSTANT,
        .c = bb::stdlib::IS_CONSTANT,
        .d = 4,
        .mul_scaling = fr(0),
        .a_scaling = fr(1),
        .b_scaling = fr(0),
        .c_scaling = fr(0),
        .d_scaling = fr(1),
        .const_scaling = fr(-10),
    };

    auto constraint_system = build_acir_format(4, quad_0, quad_1);

    // a=4, b=5, c=20, d=3, e=7
    WitnessVector witness = { fr(4), fr(5), fr(20), fr(3), fr(7) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    size_t quad_count = 0;
    for (const auto& [opcode_idx, constraint_info] : opcode_map) {
        if (constraint_info.type == AcirConstraintType::QUAD) {
            quad_count++;
        }
    }
    EXPECT_EQ(quad_count, 2u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test quad constraint mixed with range constraints
 * @details Combines arithmetic gate with range constraints on some witnesses
 */
TEST_F(BoomerangQuadConstraintsTests, QuadWithRangeConstraints)
{
    // Equation: a * b - c = 0
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    RangeConstraint range_a{ .witness = 0, .num_bits = 8 };
    RangeConstraint range_b{ .witness = 1, .num_bits = 8 };

    auto constraint_system = build_acir_format(2, quad, range_a, range_b);

    // a=10, b=20, c=200 (both a,b fit in 8 bits)
    WitnessVector witness = { fr(10), fr(20), fr(200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3u);

    size_t quad_count = 0;
    size_t range_count = 0;
    for (const auto& [opcode_idx, constraint_info] : opcode_map) {
        if (constraint_info.type == AcirConstraintType::QUAD) {
            quad_count++;
        } else if (constraint_info.type == AcirConstraintType::RANGE) {
            range_count++;
        }
    }
    EXPECT_EQ(quad_count, 1u);
    EXPECT_EQ(range_count, 2u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test quad constraint where witnesses are reused across a and b wires
 * @details Equation: a^2 - c = 0 (a appears in both a and b positions)
 */
TEST_F(BoomerangQuadConstraintsTests, SharedWitnessSquaring)
{
    // Equation: 1*(a*a) + 0*a + 0*a + (-1)*c + 0*d + 0 = 0
    // => a^2 = c
    // Same witness index for a and b
    QuadConstraint quad{
        .a = 0,
        .b = 0,
        .c = 1,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(1, quad);

    // a=7, c=49
    WitnessVector witness = { fr(7), fr(49) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat constraint_system_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

// =====================================================================================
// Mixed constraint tests - QUAD + LOGIC + RANGE in the same constraint system
// =====================================================================================

/**
 * @brief Helper: build a mixed constraint system with QUAD + 32-bit XOR + RANGE constraints
 * @details Layout:
 *   Opcode 0: QUAD  a(0) * b(1) - c(2) = 0     (witnesses 0=3, 1=7, 2=21)
 *   Opcode 1: LOGIC 32-bit XOR(3, 4) → 5        (witnesses 3=100, 4=200, 5=172)
 *   Opcode 2: RANGE 32-bit on witness 3
 *   Opcode 3: RANGE 32-bit on witness 4
 */
static std::pair<AcirFormat, UltraCircuitBuilder> build_mixed_quad_logic_range_circuit()
{
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    LogicConstraint xor_constraint{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    RangeConstraint range_3{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 32 };

    auto constraint_system = build_acir_format(5, quad, xor_constraint, range_3, range_4);

    WitnessVector witness = { fr(3), fr(7), fr(21), fr(100), fr(200), fr(100 ^ 200) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    return { constraint_system, std::move(builder) };
}

/**
 * @brief Test mixed QUAD + LOGIC + RANGE constraints all validate correctly
 * @details Verifies the analyzer handles heterogeneous constraint systems without
 *          cross-type interference (no false positives between constraint types)
 */
TEST_F(BoomerangQuadConstraintsTests, MixedQuadLogicRange_AllValid)
{
    auto [constraint_system, builder] = build_mixed_quad_logic_range_circuit();
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 4u);

    size_t quad_count = 0, logic_count = 0, range_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::QUAD)
            quad_count++;
        else if (info.type == AcirConstraintType::LOGIC)
            logic_count++;
        else if (info.type == AcirConstraintType::RANGE)
            range_count++;
    }
    EXPECT_EQ(quad_count, 1u);
    EXPECT_EQ(logic_count, 1u);
    EXPECT_EQ(range_count, 2u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test that corrupting only the QUAD constraint flags only QUAD's opcode
 * @details Corrupt q_m in the quad gate; LOGIC and RANGE should remain valid
 */
TEST_F(BoomerangQuadConstraintsTests, MixedQuadLogicRange_CorruptQuadOnly)
{
    auto [constraint_system, builder] = build_mixed_quad_logic_range_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";
    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.count(0) > 0) << "QUAD opcode 0 should be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0) << "LOGIC opcode 1 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(2) == 0) << "RANGE opcode 2 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(3) == 0) << "RANGE opcode 3 should NOT be flagged";
}

/**
 * @brief Test that corrupting only the LOGIC constraint flags only LOGIC's opcode
 * @details Disable q_lookup on first lookup gate; QUAD and RANGE should remain valid
 */
TEST_F(BoomerangQuadConstraintsTests, MixedQuadLogicRange_CorruptLogicOnly)
{
    auto [constraint_system, builder] = build_mixed_quad_logic_range_circuit();

    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";
    // Note: CircuitChecker still passes because disabling q_lookup makes the lookup trivially satisfied

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "QUAD opcode 0 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(1) > 0) << "LOGIC opcode 1 should be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(2) == 0) << "RANGE opcode 2 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(3) == 0) << "RANGE opcode 3 should NOT be flagged";
}

/**
 * @brief Test that corrupting both QUAD and LOGIC flags both opcodes independently
 * @details Verifies the analyzer correctly isolates corruption to individual opcodes
 */
TEST_F(BoomerangQuadConstraintsTests, MixedQuadLogicRange_CorruptBoth)
{
    auto [constraint_system, builder] = build_mixed_quad_logic_range_circuit();

    // Corrupt QUAD gate
    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";
    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(99));

    // Corrupt LOGIC lookup gate
    auto& lookup_block = builder.blocks.lookup;
    bool found_gate = false;
    for (size_t i = 0; i < lookup_block.size(); i++) {
        if (lookup_block.q_lookup()[i] == fr::one()) {
            lookup_block.q_lookup().set(i, fr::zero());
            found_gate = true;
            break;
        }
    }
    ASSERT_TRUE(found_gate) << "Could not find lookup gate to corrupt";
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.count(0) > 0) << "QUAD opcode 0 should be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(1) > 0) << "LOGIC opcode 1 should be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(2) == 0) << "RANGE opcode 2 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(3) == 0) << "RANGE opcode 3 should NOT be flagged";
}

/**
 * @brief Test mixed constraints where witnesses are shared across constraint types
 * @details Constructs a chain: XOR(0, 1) → result(2), then QUAD: result(2) * d(3) - e(4) = 0
 *          This tests that shared witnesses between LOGIC output and QUAD input don't
 *          confuse the analyzer.
 *   Opcode 0: LOGIC 32-bit XOR(0, 1) → 2
 *   Opcode 1: QUAD  c(2) * d(3) - e(4) = 0
 *   Opcode 2: RANGE 32-bit on witness 0
 *   Opcode 3: RANGE 32-bit on witness 1
 */
TEST_F(BoomerangQuadConstraintsTests, MixedConstraints_SharedWitnesses)
{
    LogicConstraint xor_constraint{
        .a = witness_from_index(0),
        .b = witness_from_index(1),
        .result = 2,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    // QUAD uses the XOR result (witness 2) as its first operand
    // Equation: result * d - e = 0
    uint32_t xor_result_val = 100 ^ 200; // = 172
    QuadConstraint quad{
        .a = 2, // XOR result witness
        .b = 3,
        .c = 4,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    RangeConstraint range_0{ .witness = 0, .num_bits = 32 };
    RangeConstraint range_1{ .witness = 1, .num_bits = 32 };

    auto constraint_system = build_acir_format(4, xor_constraint, quad, range_0, range_1);

    // witness 0=100, 1=200, 2=100^200=172, 3=5, 4=172*5=860
    WitnessVector witness = { fr(100), fr(200), fr(xor_result_val), fr(5), fr(xor_result_val * 5) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 4u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test mixed QUAD + 8-bit AND + small range constraints
 * @details Uses different bit widths and logic types from the 32-bit XOR tests above.
 *          Also includes a 1-bit range constraint (boolean) to mix range sizes.
 *   Opcode 0: QUAD  2*a + 3*b - c = 0  (witnesses 0,1,2)
 *   Opcode 1: LOGIC 8-bit AND(3, 4) → 5
 *   Opcode 2: RANGE 8-bit on witness 3
 *   Opcode 3: RANGE 8-bit on witness 4
 *   Opcode 4: RANGE 1-bit on witness 6 (boolean)
 */
TEST_F(BoomerangQuadConstraintsTests, MixedConstraints_DifferentBitWidths)
{
    // QUAD: 2*a + 3*b - c = 0
    // a=10, b=20: 2*10 + 3*20 = 80 → c=80
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(0),
        .a_scaling = fr(2),
        .b_scaling = fr(3),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    LogicConstraint and_constraint{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 8,
        .is_xor_gate = 0,
    };

    RangeConstraint range_3{ .witness = 3, .num_bits = 8 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 8 };
    RangeConstraint range_bool{ .witness = 6, .num_bits = 1 };

    auto constraint_system = build_acir_format(6, quad, and_constraint, range_3, range_4, range_bool);

    // a=10, b=20, c=80, d=0xAB=171, e=0xCD=205, f=171&205=137, g=1 (boolean)
    WitnessVector witness = { fr(10), fr(20), fr(80), fr(171), fr(205), fr(171 & 205), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 5u);

    size_t quad_count = 0, logic_count = 0, range_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::QUAD)
            quad_count++;
        else if (info.type == AcirConstraintType::LOGIC)
            logic_count++;
        else if (info.type == AcirConstraintType::RANGE)
            range_count++;
    }
    EXPECT_EQ(quad_count, 1u);
    EXPECT_EQ(logic_count, 1u);
    EXPECT_EQ(range_count, 3u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test multiple QUADs mixed with LOGIC and RANGE
 * @details Tests that multiple quad constraints don't interfere with each other
 *          or with logic/range constraints when all are present.
 *   Opcode 0: QUAD  a * b - c = 0        (witnesses 0,1,2)
 *   Opcode 1: QUAD  2*d + 3*e - f = 0    (witnesses 6,7,8)
 *   Opcode 2: LOGIC 32-bit XOR(3, 4) → 5
 *   Opcode 3: RANGE 32-bit on witness 3
 *   Opcode 4: RANGE 32-bit on witness 4
 */
TEST_F(BoomerangQuadConstraintsTests, MixedMultipleQuadsWithLogicAndRange)
{
    QuadConstraint quad_0{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    QuadConstraint quad_1{
        .a = 6,
        .b = 7,
        .c = bb::stdlib::IS_CONSTANT,
        .d = 8,
        .mul_scaling = fr(0),
        .a_scaling = fr(2),
        .b_scaling = fr(3),
        .c_scaling = fr(0),
        .d_scaling = fr(-1),
        .const_scaling = fr(0),
    };

    LogicConstraint xor_constraint{
        .a = witness_from_index(3),
        .b = witness_from_index(4),
        .result = 5,
        .num_bits = 32,
        .is_xor_gate = 1,
    };

    RangeConstraint range_3{ .witness = 3, .num_bits = 32 };
    RangeConstraint range_4{ .witness = 4, .num_bits = 32 };

    auto constraint_system = build_acir_format(8, quad_0, quad_1, xor_constraint, range_3, range_4);

    // quad_0: 4*5=20, quad_1: 2*10+3*20=80, xor: 100^200=172
    WitnessVector witness = { fr(4), fr(5), fr(20), fr(100), fr(200), fr(100 ^ 200), fr(10), fr(20), fr(80) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 5u);

    size_t quad_count = 0, logic_count = 0, range_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::QUAD)
            quad_count++;
        else if (info.type == AcirConstraintType::LOGIC)
            logic_count++;
        else if (info.type == AcirConstraintType::RANGE)
            range_count++;
    }
    EXPECT_EQ(quad_count, 2u);
    EXPECT_EQ(logic_count, 1u);
    EXPECT_EQ(range_count, 2u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

// =====================================================================================
// Corruption detection tests - verify process_quad_constraints rejects tampered circuits
// =====================================================================================

/**
 * @brief Helper: build a valid quad constraint system with a * b - c = 0
 * @details Used by corruption tests to create a known-good starting point
 */
static std::pair<AcirFormat, UltraCircuitBuilder> build_simple_quad_circuit()
{
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(2, quad);

    WitnessVector witness = { fr(3), fr(7), fr(21) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    return { constraint_system, std::move(builder) };
}

/**
 * @brief Test that corrupting q_m (mul_scaling) selector is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_qm)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(2)); // corrupt mul_scaling from 1 to 2
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_1 (a_scaling) selector is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_q1)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_1().set(*gate_idx, fr(5)); // corrupt a_scaling from 0 to 5
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_3 (c_scaling) selector is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_q3)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_3().set(*gate_idx, fr(1)); // corrupt c_scaling from -1 to 1
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_c (const_scaling) selector is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_qc)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_c().set(*gate_idx, fr(99)); // corrupt const_scaling from 0 to 99
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_arith from 1 to 0 (disabling the gate) is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_qArithDisabled)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_arith().set(*gate_idx, fr(0)); // disable the arithmetic gate
    // Note: CircuitChecker still passes because disabling q_arith makes the gate trivially satisfied

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_arith from 1 to 2 (enabling w4_shift) is detected
 * @details q_arith=2 is for big_quad constraints, not single quad
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_qArithW4Shift)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_arith().set(*gate_idx, fr(2)); // change to w4_shift mode
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_l (wire a) is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_wl)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.w_l()[*gate_idx] = builder.zero_idx(); // corrupt wire a
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_o (wire c) is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_wo)
{
    auto [constraint_system, builder] = build_simple_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(1));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.w_o()[*gate_idx] = builder.zero_idx(); // corrupt wire c
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test corruption detection on a full-equation quad constraint
 * @details Uses 2*(a*b) + 3*a - b + c - 2*d + 5 = 0, corrupts q_4 (d_scaling)
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_FullEquation_q4)
{
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr(2),
        .a_scaling = fr(3),
        .b_scaling = fr(-1),
        .c_scaling = fr(1),
        .d_scaling = fr(-2),
        .const_scaling = fr(5),
    };

    auto constraint_system = build_acir_format(3, quad);

    WitnessVector witness = { fr(2), fr(3), fr(2), fr(11) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Find the gate by its unique q_m value (mul_scaling=2)
    auto gate_idx = find_quad_gate(builder, fr(2));
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_4().set(*gate_idx, fr(0)); // corrupt d_scaling from -2 to 0
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting one of two quad constraints only flags the corrupted one
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_OnlyCorruptedFlagged)
{
    // Gate 0: a * b - c = 0 (mul_scaling=1)
    QuadConstraint quad_0{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    // Gate 1: d + e - 10 = 0 (mul_scaling=0)
    QuadConstraint quad_1{
        .a = 3,
        .b = bb::stdlib::IS_CONSTANT,
        .c = bb::stdlib::IS_CONSTANT,
        .d = 4,
        .mul_scaling = fr(0),
        .a_scaling = fr(1),
        .b_scaling = fr(0),
        .c_scaling = fr(0),
        .d_scaling = fr(1),
        .const_scaling = fr(-10),
    };

    auto constraint_system = build_acir_format(4, quad_0, quad_1);

    WitnessVector witness = { fr(4), fr(5), fr(20), fr(3), fr(7) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);

    // Corrupt only the first gate's q_m
    auto gate_idx = find_quad_gate(builder, fr(1)); // finds quad_0 by mul_scaling=1
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first quad gate";
    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    // Only opcode 0 should be flagged, opcode 1 should pass
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0);
}

// =====================================================================================
// Acir::Expression pipeline tests - construct QuadConstraint via Acir::Expression
// Covers QuadConstraint configs from arithmetic_constraints.test.cpp
// =====================================================================================

/**
 * @brief Convert fr value to byte vector for Acir::Expression fields
 */
static std::vector<uint8_t> fr_to_bytes(const fr& value)
{
    return value.to_buffer();
}

/**
 * @brief Test 1 mul + 0 linear via Acir::Expression pipeline
 * @details Expression: 5*(w0*w1) - 30 = 0
 *          w0=2, w1=3 -> 5*6 = 30
 *          Matches arithmetic_constraints config (1, 0, false, false)
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_1Mul0Linear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(5)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = {},
        .q_c = fr_to_bytes(fr(-30)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u);
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(1, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 1 mul + 2 linear via Acir::Expression pipeline
 * @details Expression: 3*(w0*w1) + 7*w2 + (-2)*w3 - 32 = 0
 *          w0=2, w1=3, w2=1, w3=4 -> 18 + 7 - 8 - 17 = 0
 *          Wait: 18 + 7 - 8 = 17, q_c = -17
 *          Matches arithmetic_constraints config (1, 2, false, false)
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_1Mul2Linear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(7)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(-2)), Acir::Witness{ .value = 3 }) },
        .q_c = fr_to_bytes(fr(-17)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u);
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(3, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3), fr(1), fr(4) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 1 mul + 3 linear with linear overlap via Acir::Expression pipeline
 * @details Expression: w0*w1 + 2*w2 + w2 + w3 - 21 = 0
 *          w2 appears in two linear terms (linear overlap, merged to 3*w2)
 *          w0=2, w1=3, w2=3, w3=6 -> 6 + 9 + 6 = 21
 *          Matches arithmetic_constraints config (1, 3, false, true)
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_1Mul3Linear_LinearOverlap)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }) },
        .q_c = fr_to_bytes(fr(-21)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u) << "Linear overlap should merge to fit in one gate";
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(3, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3), fr(3), fr(6) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 1 mul + 4 linear with both mul/linear and linear overlap via Acir::Expression
 * @details Expression: w0*w1 + 3*w0 + 2*w2 + w2 + w3 - 22 = 0
 *          w0 shared between mul lhs and linear (mul/linear overlap)
 *          w2 appears in two linear terms (linear overlap, merged to 3*w2)
 *          w0=2, w1=3, w2=2, w3=4 -> 6 + 6 + 4 + 2 + 4 = 22
 *          Matches arithmetic_constraints config (1, 4, true, true)
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_1Mul4Linear_BothOverlaps)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }) },
        .q_c = fr_to_bytes(fr(-22)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u) << "Overlaps should merge to fit in one gate";
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(3, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3), fr(2), fr(4) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test 0 mul + 4 linear with linear overlap via Acir::Expression pipeline
 * @details Expression: w0 + w0 + w1 + w2 - 10 = 0
 *          w0 appears in two linear terms (merged to 2*w0)
 *          w0=2, w1=3, w2=3 -> 4 + 3 + 3 = 10
 *          Matches arithmetic_constraints config (0, 4, false, true)
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_0Mul4Linear_LinearOverlap)
{
    Acir::Expression expr{
        .mul_terms = {},
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 1 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }) },
        .q_c = fr_to_bytes(fr(-10)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u) << "Linear overlap should merge to fit in one gate";
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(2, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3), fr(3) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test self-multiplication (w0*w0) + linear terms via Acir::Expression pipeline
 * @details Expression: w0*w0 + 3*w1 - 13 = 0
 *          w0 appears as both lhs and rhs of multiplication (self-mul)
 *          w0=2, w1=3 -> 4 + 9 = 13
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_SelfMul_WithLinear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 0 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 1 }) },
        .q_c = fr_to_bytes(fr(-13)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u);
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(1, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(2), fr(3) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

/**
 * @brief Test non-trivial scalings with negative and large coefficients via pipeline
 * @details Expression: (-7)*(w0*w1) + 13*w2 + (-5)*w3 + 96 = 0
 *          w0=3, w1=4, w2=1, w3=5 -> -84 + 13 - 25 + 96 = 0
 */
TEST_F(BoomerangQuadConstraintsTests, AcirPipeline_NonTrivialScalings)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(-7)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(13)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(-5)), Acir::Witness{ .value = 3 }) },
        .q_c = fr_to_bytes(fr(96)),
    };

    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    ASSERT_EQ(dummy.quad_constraints.size(), 1u);
    ASSERT_TRUE(dummy.big_quad_constraints.empty());

    auto constraint_system = build_acir_format(3, dummy.quad_constraints[0]);
    WitnessVector witness = { fr(3), fr(4), fr(1), fr(5) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.empty());
}

// =====================================================================================
// Additional corruption tests for selectors and wires not covered above
// =====================================================================================

/**
 * @brief Helper: build a valid quad constraint with all 4 wires active
 * @details 2*(a*b) + 3*a + (-1)*b + c + (-2)*d + 5 = 0
 *          a=2, b=3, c=2, d=11
 */
static std::pair<AcirFormat, UltraCircuitBuilder> build_full_equation_quad_circuit()
{
    QuadConstraint quad{
        .a = 0,
        .b = 1,
        .c = 2,
        .d = 3,
        .mul_scaling = fr(2),
        .a_scaling = fr(3),
        .b_scaling = fr(-1),
        .c_scaling = fr(1),
        .d_scaling = fr(-2),
        .const_scaling = fr(5),
    };

    auto constraint_system = build_acir_format(3, quad);

    WitnessVector witness = { fr(2), fr(3), fr(2), fr(11) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    return { constraint_system, std::move(builder) };
}

/**
 * @brief Test that corrupting q_2 (b_scaling) selector is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_q2)
{
    auto [constraint_system, builder] = build_full_equation_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(2)); // mul_scaling=2
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.q_2().set(*gate_idx, fr(99)); // corrupt b_scaling from -1 to 99
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_r (wire b) is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_wr)
{
    auto [constraint_system, builder] = build_full_equation_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(2)); // mul_scaling=2
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.w_r()[*gate_idx] = builder.zero_idx(); // corrupt wire b
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_4 (wire d) is detected
 */
TEST_F(BoomerangQuadConstraintsTests, DetectCorruptedQuad_w4)
{
    auto [constraint_system, builder] = build_full_equation_quad_circuit();

    auto gate_idx = find_quad_gate(builder, fr(2)); // mul_scaling=2
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find quad gate";

    builder.blocks.arithmetic.w_4()[*gate_idx] = builder.zero_idx(); // corrupt wire d
    EXPECT_FALSE(CircuitChecker::check(builder));

    AcirFormat cs_copy = constraint_system;
    auto analyzer = StaticAnalyzerAcir(std::move(cs_copy), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}
