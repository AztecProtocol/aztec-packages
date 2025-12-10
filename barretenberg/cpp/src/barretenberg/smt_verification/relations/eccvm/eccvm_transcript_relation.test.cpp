/**
 * @file eccvm_transcript_relation.test.cpp
 * @brief SMT-based tests for the ECCVM Transcript relation.
 *
 * The Transcript relation handles the main VM operations (add, mul, eq, reset)
 * and has 27 subrelations covering:
 * - z1_zero/z2_zero validation
 * - opcode encoding (op = q_reset + 2*q_eq + 4*q_mul + 8*q_add)
 * - point counter (pc) updates
 * - msm_transition and msm_count logic
 * - eq opcode validation
 * - boundary conditions
 * - on-curve validation
 * - group operation lambda calculations
 * - accumulator updates
 */

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "eccvm_relation_test_helpers.hpp"
#include "eccvm_relations.hpp"
#include <gtest/gtest.h>
#include <sstream>

using namespace smt_solver;
using namespace smt_terms;
using namespace smt_eccvm_relations;
using namespace eccvm_relation_test_helpers;

using eccvm_relation_test_helpers::find_var;

// Solver configuration for transcript tests
static SolverConfiguration transcript_solver_config = { .produce_models = true,
                                                        .timeout = 30000,
                                                        .debug = false,
                                                        .ff_elim_disjunctive_bit = true,
                                                        .ff_solver = "gb",
                                                        .lookup_enabled = false };

/**
 * @brief Test that z1_zero correctly enforces z1 = 0
 *
 * Subrelation 0: z1 * z1_zero = 0
 * If z1_zero = 1, then z1 must be 0
 *
 * Runtime: <10ms
 */
TEST(ECCVMTranscriptRelation, Z1ZeroEnforcesZ1IsZero)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    ASSERT_EQ(trace.accumulator_results.size(), 27) << "Transcript relation should have 27 subrelations";

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm z1 = find_var(vars, names, "transcript_z1");
    STerm z1_zero = find_var(vars, names, "transcript_z1zero");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 0 holds
    formulas[0] == zero;

    // Set z1_zero = 1
    z1_zero == one;

    // Sanity check: with z1 = 0, the model should be SAT
    s.push();
    z1 == zero;
    ASSERT_TRUE(s.check()) << "The relation should be satisfiable when z1_zero = 1 and z1 = 0";
    s.pop();

    // Try to set z1 != 0
    z1 != zero;

    // Should be UNSAT: if z1_zero = 1, z1 must be 0
    ASSERT_FALSE(s.check()) << "If z1_zero = 1, z1 must be constrained to 0";
}

/**
 * @brief Test that z2_zero correctly enforces z2 = 0
 *
 * Subrelation 1: z2 * z2_zero = 0
 *
 * Runtime: <5ms
 */
TEST(ECCVMTranscriptRelation, Z2ZeroEnforcesZ2IsZero)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm z2 = find_var(vars, names, "transcript_z2");
    STerm z2_zero = find_var(vars, names, "transcript_z2zero");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 1 holds
    formulas[1] == zero;

    // Set z2_zero = 1
    z2_zero == one;

    // Sanity check: with z2 = 0, the model should be SAT
    s.push();
    z2 == zero;
    ASSERT_TRUE(s.check()) << "The relation should be satisfiable when z2_zero = 1 and z2 = 0";
    s.pop();

    // Try to set z2 != 0
    z2 != zero;

    // Should be UNSAT
    ASSERT_FALSE(s.check()) << "If z2_zero = 1, z2 must be constrained to 0";
}

/**
 * @brief Test that the opcode encoding is correct
 *
 * Subrelation 2: op = q_reset_accumulator + 2*q_eq + 4*q_mul + 8*q_add
 *
 * Runtime: ~11ms
 */
TEST(ECCVMTranscriptRelation, OpcodeEncodingIsCorrect)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm op = find_var(vars, names, "transcript_op");
    STerm q_reset = find_var(vars, names, "transcript_reset_accumulator");
    STerm q_eq = find_var(vars, names, "transcript_eq");
    STerm q_mul = find_var(vars, names, "transcript_mul");
    STerm q_add = find_var(vars, names, "transcript_add");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);
    STerm two = FFConst("2", &s, 10);
    STerm four = FFConst("4", &s, 10);
    STerm eight = FFConst("8", &s, 10);

    // Assert subrelation 2 holds
    formulas[2] == zero;

    // Test q_reset = 1 -> op = 1
    s.push();
    q_reset == one;
    q_eq == zero;
    q_mul == zero;
    q_add == zero;
    op == one;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_reset=1 and op=1";
    s.pop();

    s.push();
    q_reset == one;
    q_eq == zero;
    q_mul == zero;
    q_add == zero;
    op != one;
    ASSERT_FALSE(s.check()) << "op should equal 1 when only q_reset = 1";
    s.pop();

    // Test q_eq = 1 -> op = 2
    s.push();
    q_reset == zero;
    q_eq == one;
    q_mul == zero;
    q_add == zero;
    op == two;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_eq=1 and op=2";
    s.pop();

    s.push();
    q_reset == zero;
    q_eq == one;
    q_mul == zero;
    q_add == zero;
    op != two;
    ASSERT_FALSE(s.check()) << "op should equal 2 when only q_eq = 1";
    s.pop();

    // Test q_mul = 1 -> op = 4
    s.push();
    q_reset == zero;
    q_eq == zero;
    q_mul == one;
    q_add == zero;
    op == four;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_mul=1 and op=4";
    s.pop();

    s.push();
    q_reset == zero;
    q_eq == zero;
    q_mul == one;
    q_add == zero;
    op != four;
    ASSERT_FALSE(s.check()) << "op should equal 4 when only q_mul = 1";
    s.pop();

    // Test q_add = 1 -> op = 8
    s.push();
    q_reset == zero;
    q_eq == zero;
    q_mul == zero;
    q_add == one;
    op == eight;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_add=1 and op=8";
    s.pop();

    s.push();
    q_reset == zero;
    q_eq == zero;
    q_mul == zero;
    q_add == one;
    op != eight;
    ASSERT_FALSE(s.check()) << "op should equal 8 when only q_add = 1";
    s.pop();
}

/**
 * @brief Test that opcodes are mutually exclusive
 *
 * Subrelation 8: q_mul * (q_add + q_eq + q_reset) + q_add * (q_mul + q_eq + q_reset) = 0
 * This prevents q_mul or q_add from being active alongside any other opcode.
 *
 * Runtime: ~10ms
 */
TEST(ECCVMTranscriptRelation, OpcodesAreMutuallyExclusive)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm q_mul = find_var(vars, names, "transcript_mul");
    STerm q_add = find_var(vars, names, "transcript_add");
    STerm q_eq = find_var(vars, names, "transcript_eq");
    STerm q_reset = find_var(vars, names, "transcript_reset_accumulator");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 8 (opcode exclusion) holds
    formulas[8] == zero;

    // Sanity check: q_mul = 1 alone should be SAT
    s.push();
    q_mul == one;
    q_add == zero;
    q_eq == zero;
    q_reset == zero;
    ASSERT_TRUE(s.check()) << "q_mul = 1 alone should be SAT";
    s.pop();

    // Test: q_mul = 1, q_add = 1 -> UNSAT
    s.push();
    q_mul == one;
    q_add == one;
    q_eq == zero;
    q_reset == zero;
    ASSERT_FALSE(s.check()) << "q_mul and q_add cannot both be 1";
    s.pop();

    // Test: q_mul = 1, q_eq = 1 -> UNSAT
    s.push();
    q_mul == one;
    q_add == zero;
    q_eq == one;
    q_reset == zero;
    ASSERT_FALSE(s.check()) << "q_mul and q_eq cannot both be 1";
    s.pop();

    // Test: q_mul = 1, q_reset = 1 -> UNSAT
    s.push();
    q_mul == one;
    q_add == zero;
    q_eq == zero;
    q_reset == one;
    ASSERT_FALSE(s.check()) << "q_mul and q_reset cannot both be 1";
    s.pop();

    // Sanity check: q_add = 1 alone should be SAT
    s.push();
    q_mul == zero;
    q_add == one;
    q_eq == zero;
    q_reset == zero;
    ASSERT_TRUE(s.check()) << "q_add = 1 alone should be SAT";
    s.pop();

    // Test: q_add = 1, q_eq = 1 -> UNSAT
    s.push();
    q_mul == zero;
    q_add == one;
    q_eq == one;
    q_reset == zero;
    ASSERT_FALSE(s.check()) << "q_add and q_eq cannot both be 1";
    s.pop();

    // Test: q_add = 1, q_reset = 1 -> UNSAT
    s.push();
    q_mul == zero;
    q_add == one;
    q_eq == zero;
    q_reset == one;
    ASSERT_FALSE(s.check()) << "q_add and q_reset cannot both be 1";
    s.pop();
}

/**
 * @brief Test that msm_count is zero when not in mul operation
 *
 * Subrelation 6: (1 - q_mul) * msm_count = 0
 *
 * Runtime: <5ms
 */
TEST(ECCVMTranscriptRelation, MsmCountZeroWhenNotMul)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm q_mul = find_var(vars, names, "transcript_mul");
    STerm msm_count = find_var(vars, names, "transcript_msm_count");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 6 holds
    formulas[6] == zero;

    // Set q_mul = 0 (not a mul operation)
    q_mul == zero;

    // Sanity check: with msm_count = 0, the model should be SAT
    s.push();
    msm_count == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_mul = 0 and msm_count = 0";
    s.pop();

    // Try to set msm_count != 0
    msm_count != zero;

    // Should be UNSAT: msm_count must be 0 when not in mul
    ASSERT_FALSE(s.check()) << "msm_count should be 0 when q_mul = 0";
}

/**
 * @brief Test eq opcode validates x-coordinates match
 *
 * Subrelation 9: q_eq * (eq_x_diff * both_not_infinity + infinity_exclusion_check) * is_not_hiding_row
 *
 * Note: is_not_hiding_row = (1 - lagrange_second), so we need lagrange_second = 0 for this to apply
 *
 * Runtime: ~9ms
 */
TEST(ECCVMTranscriptRelation, EqOpcodeValidatesXCoordinates)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm q_eq = find_var(vars, names, "transcript_eq");
    STerm Px = find_var(vars, names, "transcript_Px");
    STerm acc_x = find_var(vars, names, "transcript_accumulator_x");
    // transcript_base_infinity is the actual column name for Pinfinity
    STerm Pinfinity = find_var(vars, names, "transcript_base_infinity");
    STerm lagrange_second = find_var(vars, names, "lagrange_second");
    // transcript_accumulator_not_empty is the actual column name (is_acc_empty = 1 - not_empty)
    STerm acc_not_empty = find_var(vars, names, "transcript_accumulator_not_empty");
    // Need lagrange_second = 0 for is_not_hiding_row = 1
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 9 (eq x-diff) holds
    formulas[9] == zero;

    // Set up eq operation with non-infinity points, not on hiding row
    q_eq == one;
    Pinfinity == zero;
    acc_not_empty == one;    // not empty means is_acc_empty = 0
    lagrange_second == zero; // is_not_hiding_row = 1

    // Sanity check: with equal x-coordinates, the model should be SAT
    s.push();
    Px == acc_x;
    ASSERT_TRUE(s.check()) << "Should be SAT when x-coordinates match";
    s.pop();

    // Set different x-coordinates
    Px != acc_x;

    // Should be UNSAT: x-coordinates must match for eq
    ASSERT_FALSE(s.check()) << "eq opcode should require x-coordinates to match";
}

/**
 * @brief Test boundary condition: is_accumulator_empty = 1 at third row
 *
 * Subrelation 11: lagrange_third * (1 - is_accumulator_empty) = 0
 *
 * Runtime: ~10ms
 */
TEST(ECCVMTranscriptRelation, BoundaryConditionAccumulatorEmpty)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm lagrange_third = find_var(vars, names, "lagrange_third");
    // is_acc_empty = 1 - transcript_accumulator_not_empty
    STerm acc_not_empty = find_var(vars, names, "transcript_accumulator_not_empty");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 11 holds
    formulas[11] == zero;

    // At third row (lagrange_third = 1)
    lagrange_third == one;

    // Sanity check: with acc_not_empty = 0 (i.e., is_accumulator_empty = 1), the model should be SAT
    s.push();
    acc_not_empty == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when lagrange_third = 1 and acc_not_empty = 0";
    s.pop();

    // Try to set is_accumulator_empty = 0, which means acc_not_empty = 1
    acc_not_empty == one;

    // Should be UNSAT: at third row, accumulator must be empty (not_empty = 0)
    ASSERT_FALSE(s.check()) << "At third row, accumulator must be empty (not_empty = 0)";
}

/**
 * @brief Test on-curve validation for add/mul/eq operations
 *
 * Subrelation 13: (q_add + q_mul + q_eq) * (Py^2 - Px^3 - b) * (1 - Pinfinity) = 0
 *
 * Runtime: ~38ms
 */
TEST(ECCVMTranscriptRelation, OnCurveValidationForOperations)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm q_add = find_var(vars, names, "transcript_add");
    STerm q_mul = find_var(vars, names, "transcript_mul");
    STerm q_eq = find_var(vars, names, "transcript_eq");
    STerm Px = find_var(vars, names, "transcript_Px");
    STerm Py = find_var(vars, names, "transcript_Py");
    STerm Pinfinity = find_var(vars, names, "transcript_base_infinity");
    STerm lagrange_second = find_var(vars, names, "lagrange_second");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert subrelation 13 (on-curve check) holds
    formulas[13] == zero;

    std::stringstream buf;
    buf << static_cast<bb::numeric::uint256_t>(bb::grumpkin::g1::curve_b);
    std::string curve_b_hex = buf.str();
    if (curve_b_hex.rfind("0x", 0) == 0) {
        curve_b_hex = curve_b_hex.substr(2);
    }
    STerm curve_b = FFConst(curve_b_hex, &s, 16);
    STerm on_curve = Py * Py - Px * Px * Px - curve_b;

    // Common setup: non-infinity point, not on hiding row
    Pinfinity == zero;
    lagrange_second == zero;

    // Test q_add = 1 enforces on-curve
    s.push();
    q_add == one;
    q_mul == zero;
    q_eq == zero;
    on_curve == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_add = 1 and point is on curve";
    s.pop();

    s.push();
    q_add == one;
    q_mul == zero;
    q_eq == zero;
    on_curve != zero;
    ASSERT_FALSE(s.check()) << "On-curve constraint must be enforced for q_add = 1";
    s.pop();

    // Test q_mul = 1 enforces on-curve
    s.push();
    q_add == zero;
    q_mul == one;
    q_eq == zero;
    on_curve == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_mul = 1 and point is on curve";
    s.pop();

    s.push();
    q_add == zero;
    q_mul == one;
    q_eq == zero;
    on_curve != zero;
    ASSERT_FALSE(s.check()) << "On-curve constraint must be enforced for q_mul = 1";
    s.pop();

    // Test q_eq = 1 enforces on-curve
    s.push();
    q_add == zero;
    q_mul == zero;
    q_eq == one;
    on_curve == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when q_eq = 1 and point is on curve";
    s.pop();

    s.push();
    q_add == zero;
    q_mul == zero;
    q_eq == one;
    on_curve != zero;
    ASSERT_FALSE(s.check()) << "On-curve constraint must be enforced for q_eq = 1";
    s.pop();
}

/**
 * @brief Test that pc decrements correctly for mul operations
 *
 * Subrelation 3: is_not_first_row * (pc - pc_shift - q_mul * num_muls) = 0
 *
 * We verify the constraint is enforced by showing that an incorrect pc decrement is UNSAT.
 *
 * Runtime: ~6ms
 */
TEST(ECCVMTranscriptRelation, PcDecrementIsEnforcedForMul)
{
    auto trace = smt_eccvm_relations::record_eccvm_transcript_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, transcript_solver_config);
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_transcript_relation(trace, &s, "", false, formulas, vars, names);

    STerm lagrange_first = find_var(vars, names, "lagrange_first");
    STerm q_mul = find_var(vars, names, "transcript_mul");
    STerm pc = find_var(vars, names, "transcript_pc");
    STerm pc_shift = find_var(vars, names, "transcript_pc_shift");
    STerm z1_zero = find_var(vars, names, "transcript_z1zero");
    STerm z2_zero = find_var(vars, names, "transcript_z2zero");
    STerm Pinfinity = find_var(vars, names, "transcript_base_infinity");
    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    STerm two = FFConst("2", &s, 10);

    // Assert subrelation 3 holds
    formulas[3] == zero;

    // Not at first row
    lagrange_first == zero;

    // Performing a mul operation with both scalars non-zero
    q_mul == one;
    z1_zero == zero;
    z2_zero == zero;
    Pinfinity == zero;

    // Sanity check: when pc_shift = pc - 2, should be SAT
    s.push();
    pc_shift == pc - two;
    ASSERT_TRUE(s.check()) << "Should be SAT when pc_shift = pc - 2";
    s.pop();

    // Try to violate: pc_shift != pc - 2
    pc_shift != pc - two;

    // Should be UNSAT: the constraint enforces pc_shift = pc - 2 when both scalars non-zero
    ASSERT_FALSE(s.check()) << "pc must decrement by 2 when both z1 and z2 are non-zero";
}
