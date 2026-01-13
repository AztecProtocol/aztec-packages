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

class BoomerangBigQuadConstraintsTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

// =====================================================================================
// Helpers
// =====================================================================================

/**
 * @brief Convert fr value to byte vector for Acir::Expression fields
 */
static std::vector<uint8_t> fr_to_bytes(const fr& value)
{
    return value.to_buffer();
}

/**
 * @brief Build BigQuadConstraint from Acir::Expression via the ACIR splitting pipeline
 * @details Calls assert_zero_to_quad_constraints which invokes split_into_mul_quad_gates
 *          to split the expression into a chain of width-4 gates.
 * @return BigQuadConstraint (empty if expression fits in a single gate)
 */
static BigQuadConstraint expression_to_big_quad(const Acir::Expression& expr)
{
    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    AcirFormat dummy;
    assert_zero_to_quad_constraints(assert_zero, dummy, 0);
    if (!dummy.big_quad_constraints.empty()) {
        return dummy.big_quad_constraints[0];
    }
    return BigQuadConstraint{};
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

// =====================================================================================
// Full serialization audit pipeline test
// Acir::Expression -> Acir::Circuit -> serialize -> deserialize -> AcirFormat
// =====================================================================================

/**
 * @brief Test the complete bytes->AcirFormat->circuit audit pipeline
 * @details Constructs Acir::Expression with 5 distinct witnesses, serializes through the
 *          full ACIR program serialization path, then verifies the deserialized constraint
 *          system and circuit.
 *
 *          Expression: w0 * w1 + w2 + w3 + w4 - 9 = 0
 *          Witnesses: w0=2, w1=3, w2=1, w3=1, w4=1 -> 6 + 1 + 1 + 1 - 9 = 0
 */
TEST_F(BoomerangBigQuadConstraintsTests, FullSerializationPipeline_1Mul3Linear)
{
    // Step 1: Build Acir::Expression
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-9)),
    };

    // Step 2: Build Acir::Circuit and convert through circuit_serde_to_acir_format
    Acir::Opcode::AssertZero assert_zero{ .value = expr };
    Acir::Circuit circuit{
        .function_name = "test_circuit",
        .current_witness_index = 4,
        .opcodes = { Acir::Opcode{ .value = assert_zero } },
        .private_parameters = {},
        .public_parameters = Acir::PublicInputs{ .value = {} },
        .return_values = Acir::PublicInputs{ .value = {} },
        .assert_messages = {},
    };

    // Step 3: Convert Acir::Circuit to AcirFormat (full serde pipeline)
    AcirFormat constraint_system = circuit_serde_to_acir_format(circuit);

    // Step 4: Verify constraint routing
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);
    EXPECT_EQ(constraint_system.quad_constraints.size(), 0u);

    // Step 5: Create circuit with valid witnesses
    WitnessVector witness = { fr(2), fr(3), fr(1), fr(1), fr(1) };
    AcirProgram acir_prog{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(acir_prog);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Step 6: Verify opcode map registration
    auto analyzer = StaticAnalyzerAcir(std::move(acir_prog.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    auto it = opcode_map.find(0);
    ASSERT_NE(it, opcode_map.end());
    EXPECT_EQ(it->second.type, AcirConstraintType::BIG_QUAD);

    // Step 7: Analyzer validates BIG_QUAD correctly
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

// =====================================================================================
// Audit pipeline tests using constraint_to_acir_format round-trip
// BigQuadConstraint -> Acir::Opcode -> serialize -> deserialize -> AcirFormat -> circuit
// =====================================================================================

/**
 * @brief Test with 2 multiplication terms requiring multiple gates
 * @details Expression: w0 * w1 + w2 * w3 + w4 - 33 = 0
 *          Witnesses: w0=2, w1=3, w2=4, w3=5, w4=7 -> 6 + 20 + 7 - 33 = 0
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_2MulTerms)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-33)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty()) << "Expression should produce BigQuadConstraint";
    ASSERT_GT(big_quad.size(), 1u) << "Expression should produce multiple gates";

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(3), fr(4), fr(5), fr(7) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with pure linear terms (no multiplication), 5 distinct witnesses
 * @details Expression: w0 + w1 + w2 + w3 + w4 - 15 = 0
 *          Witnesses: w0=1, w1=2, w2=3, w3=4, w4=5 -> 15 - 15 = 0
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_0Mul5Linear)
{
    Acir::Expression expr{
        .mul_terms = {},
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 1 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-15)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty()) << "Expression should produce BigQuadConstraint";

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(1), fr(2), fr(3), fr(4), fr(5) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with overlapping witnesses between mul and linear terms
 * @details Expression: 2*(w0 * w1) + 3*w0 + w2 + w3 + w4 - 32 = 0
 *          w0 appears in both mul_term (as lhs) and in linear_combinations
 *          Witnesses: w0=2, w1=3, w2=1, w3=5, w4=8 -> 12 + 6 + 1 + 5 + 8 - 32 = 0
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_OverlappingMulAndLinear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-32)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(3), fr(1), fr(5), fr(8) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with 3 mul terms + 3 linear terms (larger expression requiring 3+ gates)
 * @details Expression: w0*w1 + w2*w3 + w4*w5 + w6 + w7 + w8 - 88 = 0
 *          Witnesses: w0=2, w1=3, w2=4, w3=5, w4=1, w5=2, w6=10, w7=20, w8=30
 *          Result: 6 + 20 + 2 + 10 + 20 + 30 = 88
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_3Mul3Linear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 5 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 6 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 7 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 8 }) },
        .q_c = fr_to_bytes(fr(-88)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());
    EXPECT_GE(big_quad.size(), 3u) << "3 mul terms should produce at least 3 gates";

    auto constraint_system = build_acir_format(8, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(3), fr(4), fr(5), fr(1), fr(2), fr(10), fr(20), fr(30) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

// =====================================================================================
// Mixed constraint tests: BIG_QUAD + other constraint types
// =====================================================================================

/**
 * @brief Test BIG_QUAD combined with RANGE constraints
 * @details Verifies that mixed constraint systems correctly register all types.
 *   Opcode 0: BIG_QUAD  w0*w1 + w2 + w3 + w4 - 9 = 0
 *   Opcode 1: RANGE 8-bit on w2
 *   Opcode 2: RANGE 8-bit on w3
 */
TEST_F(BoomerangBigQuadConstraintsTests, MixedBigQuadWithRange)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-9)),
    };
    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    RangeConstraint range_2{ .witness = 2, .num_bits = 8 };
    RangeConstraint range_3{ .witness = 3, .num_bits = 8 };
    auto constraint_system = build_acir_format(4, big_quad, range_2, range_3);

    WitnessVector witness = { fr(2), fr(3), fr(1), fr(1), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 3u);

    size_t big_quad_count = 0, range_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::BIG_QUAD)
            big_quad_count++;
        else if (info.type == AcirConstraintType::RANGE)
            range_count++;
    }
    EXPECT_EQ(big_quad_count, 1u);
    EXPECT_EQ(range_count, 2u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0) << "RANGE opcode 1 should pass";
    EXPECT_TRUE(incorrect_opcodes.count(2) == 0) << "RANGE opcode 2 should pass";
}

/**
 * @brief Test BIG_QUAD combined with a single QUAD constraint
 * @details Verifies that BigQuadConstraint and QuadConstraint coexist correctly.
 *   Opcode 0: BIG_QUAD  w0*w1 + w2 + w3 + w4 - 9 = 0  (5 distinct witnesses -> >1 gate)
 *   Opcode 1: QUAD      w5 * w6 - w7 = 0                (single gate)
 */
TEST_F(BoomerangBigQuadConstraintsTests, MixedBigQuadWithQuad)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-9)),
    };
    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    QuadConstraint quad{
        .a = 5,
        .b = 6,
        .c = 7,
        .d = bb::stdlib::IS_CONSTANT,
        .mul_scaling = fr(1),
        .a_scaling = fr(0),
        .b_scaling = fr(0),
        .c_scaling = fr(-1),
        .d_scaling = fr(0),
        .const_scaling = fr(0),
    };

    auto constraint_system = build_acir_format(7, big_quad, quad);

    // big_quad: 2*3 + 1 + 1 + 1 = 9, quad: 4*5 = 20
    WitnessVector witness = { fr(2), fr(3), fr(1), fr(1), fr(1), fr(4), fr(5), fr(20) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    size_t big_quad_count = 0, quad_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::BIG_QUAD)
            big_quad_count++;
        else if (info.type == AcirConstraintType::QUAD)
            quad_count++;
    }
    EXPECT_EQ(big_quad_count, 1u);
    EXPECT_EQ(quad_count, 1u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0) << "QUAD should pass";
}

/**
 * @brief Test the full serialization pipeline with BIG_QUAD + QUAD in the same circuit
 * @details Both opcodes are serialized as Acir::Opcode::AssertZero, with the routing
 *          to quad_constraints vs big_quad_constraints determined by gate count.
 *
 *   Opcode 0: w0*w1 + w2 + w3 + w4 - 9 = 0           (-> big_quad: 5 distinct witnesses)
 *   Opcode 1: w5 * w6 - w7 = 0                         (-> quad: fits in single gate)
 */
TEST_F(BoomerangBigQuadConstraintsTests, FullSerializationPipeline_BigQuadAndQuad)
{
    // Big expression (5 distinct witnesses -> BigQuadConstraint)
    Acir::Expression big_expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-9)),
    };

    // Small expression (fits in 1 gate -> QuadConstraint)
    Acir::Expression small_expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 5 }, Acir::Witness{ .value = 6 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(-1)), Acir::Witness{ .value = 7 }) },
        .q_c = fr_to_bytes(fr(0)),
    };

    Acir::Circuit circuit{
        .function_name = "test_circuit",
        .current_witness_index = 7,
        .opcodes = { Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = big_expr } },
                     Acir::Opcode{ .value = Acir::Opcode::AssertZero{ .value = small_expr } } },
        .private_parameters = {},
        .public_parameters = Acir::PublicInputs{ .value = {} },
        .return_values = Acir::PublicInputs{ .value = {} },
        .assert_messages = {},
    };

    AcirFormat constraint_system = circuit_serde_to_acir_format(circuit);

    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);
    EXPECT_EQ(constraint_system.quad_constraints.size(), 1u);

    // big_quad: 2*3 + 1 + 1 + 1 = 9, quad: 4*5 = 20
    WitnessVector witness = { fr(2), fr(3), fr(1), fr(1), fr(1), fr(4), fr(5), fr(20) };
    AcirProgram acir_prog{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(acir_prog);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(acir_prog.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 2u);

    size_t big_quad_count = 0, quad_count = 0;
    for (const auto& [idx, info] : opcode_map) {
        if (info.type == AcirConstraintType::BIG_QUAD)
            big_quad_count++;
        else if (info.type == AcirConstraintType::QUAD)
            quad_count++;
    }
    EXPECT_EQ(big_quad_count, 1u);
    EXPECT_EQ(quad_count, 1u);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0) << "QUAD should pass";
}

// =====================================================================================
// Corruption detection tests - verify process_big_quad_constraints rejects tampered circuits
// =====================================================================================

/**
 * @brief Helper: build a valid 2-gate BIG_QUAD circuit
 * @details Expression: w0*w1 + w2*w3 + w4 - 33 = 0
 *          Witnesses: w0=2, w1=3, w2=4, w3=5, w4=7 -> 6 + 20 + 7 - 33 = 0
 *          Returns the MUTATED constraint_system (via program.constraints) so the
 *          analyzer sees post-create_big_quad_constraint values.
 */
static std::pair<AcirFormat, UltraCircuitBuilder> build_simple_big_quad_circuit()
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-33)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    auto constraint_system = build_acir_format(4, big_quad);

    WitnessVector witness = { fr(2), fr(3), fr(4), fr(5), fr(7) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    return { std::move(program.constraints), std::move(builder) };
}

/**
 * @brief Helper: find the first BIG_QUAD gate (q_arith==2) in the arithmetic block
 * @details The next gate at index+1 is the second (last) gate of the 2-gate chain.
 */
static std::optional<size_t> find_big_quad_first_gate(UltraCircuitBuilder& builder)
{
    auto& arith_block = builder.blocks.arithmetic;
    for (size_t i = 0; i < arith_block.size(); i++) {
        if (arith_block.q_arith()[i] == fr(2)) {
            return i;
        }
    }
    return std::nullopt;
}

/**
 * @brief Test that corrupting q_m on the first (non-last) gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qm_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_1 (a_scaling) on the first gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_q1_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.q_1().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_c (const_scaling) on the first gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qc_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.q_c().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_arith from 2 to 1 on the first (non-last) gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qArith_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.q_arith().set(*gate_idx, fr(1));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_l (wire a) on the first gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_wl_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.w_l()[*gate_idx] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_m on the last gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qm_LastGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    size_t last_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.q_m().set(last_gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_arith from 1 to 2 on the last gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qArith_LastGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    size_t last_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.q_arith().set(last_gate_idx, fr(2));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting the intermediate w_4 wire linking gates is detected
 * @details The w_4 at gate_idx+1 carries the accumulated value from the first gate.
 *          Corrupting it breaks the chain linking the two gates.
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_w4_IntermediateWire)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    // Corrupt the intermediate wire at gate+1 (the w_4 that links first gate to second)
    size_t next_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.w_4()[next_gate_idx] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that disabling q_arith (setting to 0) on the first gate is detected
 * @details q_arith=0 effectively disables the arithmetic constraint on that gate
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qArithDisabled_FirstGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    builder.blocks.arithmetic.q_arith().set(*gate_idx, fr(0)); // disable the gate
    // Note: CircuitChecker may still pass because disabling q_arith makes the gate trivially satisfied

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_1 (a_scaling) on the last gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_q1_LastGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    size_t last_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.q_1().set(last_gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_c (const_scaling) on the last gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qc_LastGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    size_t last_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.q_c().set(last_gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting w_l (wire a) on the last gate is detected
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_wl_LastGate)
{
    auto [constraint_system, builder] = build_simple_big_quad_circuit();

    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";

    size_t last_gate_idx = *gate_idx + 1;
    builder.blocks.arithmetic.w_l()[last_gate_idx] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting BIG_QUAD in a mixed BIG_QUAD+RANGE system only flags the BIG_QUAD opcode
 * @details Verifies corruption isolation: corrupting the BIG_QUAD gate should not flag RANGE opcodes
 */
TEST_F(BoomerangBigQuadConstraintsTests, MixedBigQuadWithRange_CorruptBigQuadOnly)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-9)),
    };
    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    RangeConstraint range_2{ .witness = 2, .num_bits = 8 };
    RangeConstraint range_3{ .witness = 3, .num_bits = 8 };
    auto constraint_system = build_acir_format(4, big_quad, range_2, range_3);

    WitnessVector witness = { fr(2), fr(3), fr(1), fr(1), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Corrupt the first BIG_QUAD gate's q_m
    auto gate_idx = find_big_quad_first_gate(builder);
    ASSERT_TRUE(gate_idx.has_value()) << "Could not find first BIG_QUAD gate";
    builder.blocks.arithmetic.q_m().set(*gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_TRUE(incorrect_opcodes.count(0) > 0) << "BIG_QUAD opcode 0 should be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(1) == 0) << "RANGE opcode 1 should NOT be flagged";
    EXPECT_TRUE(incorrect_opcodes.count(2) == 0) << "RANGE opcode 2 should NOT be flagged";
}

// =====================================================================================
// Additional complex BigQuadConstraint tests
// Covers configurations from arithmetic_constraints.test.cpp not yet tested:
//   (2, 0, false, false) - pure multiplication
//   (3, 3, true, false)  - mul/linear witness overlap
//   (1, 4, false, true)  - linear witness overlap
//   (0, 6, false, true)  - many linear terms with overlap
//   (5, 5, true, true)   - large chain with both overlaps
// Also adds non-trivial scalings and corruption tests on 3+ gate chains.
// =====================================================================================

/**
 * @brief Helper: build a 3+ gate BIG_QUAD circuit for corruption testing
 * @details Expression: w0*w1 + w2*w3 + w4*w5 + w6 + w7 + w8 - 88 = 0
 *          Produces at least 3 gates due to 3 multiplication terms.
 */
static std::pair<AcirFormat, UltraCircuitBuilder> build_3gate_big_quad_circuit()
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 5 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 6 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 7 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 8 }) },
        .q_c = fr_to_bytes(fr(-88)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    auto constraint_system = build_acir_format(8, big_quad);

    WitnessVector witness = { fr(2), fr(3), fr(4), fr(5), fr(1), fr(2), fr(10), fr(20), fr(30) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    return { std::move(program.constraints), std::move(builder) };
}

/**
 * @brief Helper: find the full chain of gates in a BigQuadConstraint
 * @details Walks from the first q_arith=2 gate through consecutive q_arith=2 gates,
 *          then includes the final q_arith=1 gate.
 * @return Vector of gate indices forming the chain
 */
static std::vector<size_t> find_big_quad_gate_chain(UltraCircuitBuilder& builder)
{
    std::vector<size_t> chain;
    auto first = find_big_quad_first_gate(builder);
    if (!first.has_value())
        return chain;

    auto& arith_block = builder.blocks.arithmetic;
    size_t i = *first;
    while (i < arith_block.size() && arith_block.q_arith()[i] == fr(2)) {
        chain.push_back(i);
        i++;
    }
    // Add the last gate (q_arith = 1)
    if (i < arith_block.size()) {
        chain.push_back(i);
    }
    return chain;
}

// =====================================================================================
// Valid circuit tests - complex configurations
// =====================================================================================

/**
 * @brief Test with 2 mul terms and 0 linear terms (pure multiplication)
 * @details Expression: 3*(w0*w1) + 2*(w2*w3) - 54 = 0
 *          w0=2, w1=5, w2=3, w3=4 -> 3*10 + 2*12 = 54
 *          Matches arithmetic_constraints config (2, 0, false, false)
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_2Mul0Linear_PureMultiplication)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }) },
        .linear_combinations = {},
        .q_c = fr_to_bytes(fr(-54)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty()) << "2 mul terms should produce BigQuadConstraint";
    EXPECT_EQ(big_quad.size(), 2u) << "2 mul terms should produce exactly 2 gates";

    auto constraint_system = build_acir_format(3, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(5), fr(3), fr(4) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with non-trivial scaling factors
 * @details Expression: 7*(w0*w1) + 5*w2 + (-3)*w3 + 11*w4 - 52 = 0
 *          w0=3, w1=2, w2=4, w3=7, w4=1 -> 42 + 20 - 21 + 11 = 52
 *          Validates the analyzer handles arbitrary field element scalings correctly
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_NonTrivialScalings)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(7)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(5)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(-3)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(11)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-52)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(3), fr(2), fr(4), fr(7), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with 3 mul + 3 linear terms and mul/linear witness overlap
 * @details Expression: w0*w1 + w2*w3 + w4*w4 + 2*w0 + 3*w3 + w4 - 56 = 0
 *          Overlaps: w0 in mul[0].lhs + linear[0], w3 in mul[1].rhs + linear[1],
 *                    w4 in mul[2].lhs, mul[2].rhs (self-mul), and linear[2]
 *          w0=2, w1=3, w2=1, w3=4, w4=5
 *          -> 6 + 4 + 25 + 4 + 12 + 5 = 56
 *          Matches arithmetic_constraints config (3, 3, true, false)
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_MulLinearOverlap_3Mul3Linear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 4 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-56)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());
    EXPECT_GE(big_quad.size(), 3u) << "3 mul terms should produce at least 3 gates";

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(3), fr(1), fr(4), fr(5) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with 1 mul + 4 linear terms and linear witness overlap
 * @details Expression: w0*w1 + w2 + w2 + w3 + w4 - 24 = 0
 *          w2 appears in two distinct linear terms (linear overlap)
 *          w0=2, w1=3, w2=5, w3=7, w4=1
 *          -> 6 + 5 + 5 + 7 + 1 = 24
 *          Matches arithmetic_constraints config (1, 4, false, true)
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_1Mul4Linear_LinearOverlap)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-24)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(2), fr(3), fr(5), fr(7), fr(1) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with 0 mul + 6 linear terms and linear witness overlap
 * @details Expression: w0 + w0 + w1 + w2 + w3 + w4 - 18 = 0
 *          w0 appears in two distinct linear terms (linear overlap)
 *          w0=3, w1=1, w2=2, w3=4, w4=5
 *          -> 3 + 3 + 1 + 2 + 4 + 5 = 18
 *          Matches arithmetic_constraints config (0, 6, false, true)
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_LinearOverlap_0Mul6Linear)
{
    Acir::Expression expr{
        .mul_terms = {},
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 1 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }) },
        .q_c = fr_to_bytes(fr(-18)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty()) << "6 linear terms should produce BigQuadConstraint";

    auto constraint_system = build_acir_format(4, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(3), fr(1), fr(2), fr(4), fr(5) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

/**
 * @brief Test with 5 mul + 5 linear terms with both mul/linear and linear overlaps (large chain)
 * @details Expression: w0*w1 + w2*w3 + w4*w4 + w5*w6 + w7*w8 + 2*w0 + 3*w3 + w4 + w9 + w9 - 37 = 0
 *          Overlaps: w0 in mul+linear, w3 in mul+linear, w4 self-mul+linear, w9 double-linear
 *          w0=1, w1=2, w2=1, w3=3, w4=2, w5=1, w6=4, w7=1, w8=5, w9=3
 *          Mul: 2 + 3 + 4 + 4 + 5 = 18
 *          Lin: 2 + 9 + 2 + 3 + 3 = 19
 *          Total: 37
 *          Matches arithmetic_constraints config (5, 5, true, true)
 */
TEST_F(BoomerangBigQuadConstraintsTests, AuditPipeline_LargeChain_5Mul5Linear)
{
    Acir::Expression expr{
        .mul_terms = { std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 0 }, Acir::Witness{ .value = 1 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 2 }, Acir::Witness{ .value = 3 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }, Acir::Witness{ .value = 4 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 5 }, Acir::Witness{ .value = 6 }),
                       std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 7 }, Acir::Witness{ .value = 8 }) },
        .linear_combinations = { std::make_tuple(fr_to_bytes(fr(2)), Acir::Witness{ .value = 0 }),
                                 std::make_tuple(fr_to_bytes(fr(3)), Acir::Witness{ .value = 3 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 4 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 9 }),
                                 std::make_tuple(fr_to_bytes(fr(1)), Acir::Witness{ .value = 9 }) },
        .q_c = fr_to_bytes(fr(-37)),
    };

    BigQuadConstraint big_quad = expression_to_big_quad(expr);
    ASSERT_FALSE(big_quad.empty());
    EXPECT_GE(big_quad.size(), 5u) << "5 mul terms should produce at least 5 gates";

    auto constraint_system = build_acir_format(9, big_quad);
    EXPECT_EQ(constraint_system.big_quad_constraints.size(), 1u);

    WitnessVector witness = { fr(1), fr(2), fr(1), fr(3), fr(2), fr(1), fr(4), fr(1), fr(5), fr(3) };
    AcirProgram program{ constraint_system, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program);
    EXPECT_TRUE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(program.constraints), std::move(builder));
    const auto& opcode_map = analyzer.build_opcode_type_map();

    EXPECT_EQ(opcode_map.size(), 1u);
    EXPECT_EQ(opcode_map.begin()->second.type, AcirConstraintType::BIG_QUAD);

    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();
    EXPECT_TRUE(incorrect_opcodes.count(0) == 0) << "BIG_QUAD should pass validation";
}

// =====================================================================================
// Corruption detection tests on 3+ gate chains
// Tests that the analyzer detects corruption on middle gates, not just first/last
// =====================================================================================

/**
 * @brief Test that corrupting q_m on a middle gate of a 3+ gate chain is detected
 * @details Uses a 3-gate BIG_QUAD chain. Corrupts q_m on the middle gate (index 1 in chain).
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_qm_MiddleGate)
{
    auto [constraint_system, builder] = build_3gate_big_quad_circuit();

    auto chain = find_big_quad_gate_chain(builder);
    ASSERT_GE(chain.size(), 3u) << "Expected at least 3 gates in the chain";

    size_t middle_gate_idx = chain[1];
    builder.blocks.arithmetic.q_m().set(middle_gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting q_1 on a middle gate of a 3+ gate chain is detected
 * @details Uses a 3-gate BIG_QUAD chain. Corrupts q_1 (a_scaling) on the middle gate.
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_q1_MiddleGate)
{
    auto [constraint_system, builder] = build_3gate_big_quad_circuit();

    auto chain = find_big_quad_gate_chain(builder);
    ASSERT_GE(chain.size(), 3u) << "Expected at least 3 gates in the chain";

    size_t middle_gate_idx = chain[1];
    builder.blocks.arithmetic.q_1().set(middle_gate_idx, fr(99));
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}

/**
 * @brief Test that corrupting the w_4 intermediate wire on a middle gate is detected
 * @details Uses a 3-gate BIG_QUAD chain. The w_4 at the middle gate carries the accumulated
 *          value from the first gate and feeds into the last gate via w4_shift.
 *          Corrupting it breaks both the middle gate's own constraint and the chain link.
 */
TEST_F(BoomerangBigQuadConstraintsTests, DetectCorruptedBigQuad_w4_MiddleLink)
{
    auto [constraint_system, builder] = build_3gate_big_quad_circuit();

    auto chain = find_big_quad_gate_chain(builder);
    ASSERT_GE(chain.size(), 3u) << "Expected at least 3 gates in the chain";

    size_t middle_gate_idx = chain[1];
    builder.blocks.arithmetic.w_4()[middle_gate_idx] = builder.zero_idx();
    EXPECT_FALSE(CircuitChecker::check(builder));

    auto analyzer = StaticAnalyzerAcir(std::move(constraint_system), std::move(builder));
    std::unordered_set<size_t> incorrect_opcodes = analyzer.get_incorrect_opcodes();

    EXPECT_FALSE(incorrect_opcodes.empty());
    EXPECT_TRUE(incorrect_opcodes.count(0) > 0);
}
