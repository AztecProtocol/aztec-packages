/**
 * @file eccvm_wnaf_initialization.test.cpp
 * @brief SMT-based verification of WNAF initialization constraints
 *
 * This file tests whether the WNAF relation properly constrains initialization
 * at the start of the trace (row 0 -> row 1 transition).
 *
 * KEY INSIGHT:
 * At row 0: lagrange_first = 1, precompute_select = 0
 * The relation uses `precompute_select * scaled_transition + scaled_lagrange_first`
 * as a selector for subrelations 10 and 11, which constrains:
 * - round_shift = 0
 * - scalar_sum_shift = 0
 *
 * So even though precompute_select = 0 at row 0, the lagrange_first = 1 activates
 * these constraints, ensuring proper initialization.
 */

#include <gtest/gtest.h>

#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "eccvm_relation_test_helpers.hpp"
#include "eccvm_relations.hpp"

using namespace bb;
using namespace smt_solver;
using namespace smt_terms;
using namespace eccvm_relation_test_helpers;

using eccvm_relation_test_helpers::find_var;

/**
 * @brief Test that scalar_sum_shift is constrained at row 0 via lagrange_first
 *
 * At row 0: lagrange_first = 1, precompute_select = 0
 * Subrelation 11 uses selector: precompute_select * scaled_transition + scaled_lagrange_first
 * When lagrange_first = 1, this selector is active and forces scalar_sum_shift = 0.
 *
 * Expected: UNSAT (scalar_sum_shift must be 0)
 *
 * Runtime: ~15ms
 */
TEST(ECCVMWnafInitialization, ScalarSumShiftConstrainedAtRowZero)
{

    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", true, formulas, vars, names);

    STerm zero = FFIConst("0", &s, 10);
    STerm one = FFIConst("1", &s, 10);

    STerm precompute_select = find_var(vars, names, "precompute_select");
    STerm lagrange_first = find_var(vars, names, "lagrange_first");
    STerm scalar_sum_shift = find_var(vars, names, "precompute_scalar_sum_shift");

    // Assert all relation formulas are satisfied
    for (size_t i = 0; i < formulas.size(); ++i) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formulas[i]), static_cast<cvc5::Term>(zero) }));
    }

    // Row 0 conditions: lagrange_first = 1, precompute_select = 0
    lagrange_first == one;
    precompute_select == zero;

    // Sanity check: scalar_sum_shift = 0 should be SAT
    s.push();
    scalar_sum_shift == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when scalar_sum_shift = 0";
    s.pop();

    // Try to set scalar_sum_shift to non-zero
    scalar_sum_shift != zero;

    // Should be UNSAT: lagrange_first activates subrelation 11 which forces scalar_sum_shift = 0
    ASSERT_FALSE(s.check()) << "scalar_sum_shift must be 0 at row 0 (via lagrange_first in subrelation 11)";
}

/**
 * @brief Test the transition from row 0 (inactive) to row 1 (first active)
 *
 * This simulates the exact scenario at trace start:
 * - Row 0: lagrange_first = 1, precompute_select = 0 (inactive)
 * - Row 1 (shift values): precompute_select_shift = 1, round_shift = 0
 *
 * We verify that scalar_sum_shift (which becomes scalar_sum at row 1) must be 0.
 *
 * Runtime: ~15ms
 */
TEST(ECCVMWnafInitialization, FirstActiveRowScalarSumMustBeZero)
{

    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", true, formulas, vars, names);

    STerm zero = FFIConst("0", &s, 10);
    STerm one = FFIConst("1", &s, 10);

    STerm lagrange_first = find_var(vars, names, "lagrange_first");
    STerm precompute_select = find_var(vars, names, "precompute_select");
    STerm precompute_select_shift = find_var(vars, names, "precompute_select_shift");
    STerm scalar_sum_shift = find_var(vars, names, "precompute_scalar_sum_shift");
    STerm round_shift = find_var(vars, names, "precompute_round_shift");

    // Assert all relation formulas
    for (size_t i = 0; i < formulas.size(); ++i) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formulas[i]), static_cast<cvc5::Term>(zero) }));
    }

    // Row 0 conditions
    lagrange_first == one;
    precompute_select == zero;

    // Row 1 (shift) is the first active row
    precompute_select_shift == one;
    round_shift == zero;

    // Sanity check: scalar_sum_shift = 0 should be SAT
    s.push();
    scalar_sum_shift == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when scalar_sum_shift = 0";
    s.pop();

    // Try to have non-zero scalar_sum_shift
    scalar_sum_shift != zero;

    // Should be UNSAT: lagrange_first via subrelation 11 forces scalar_sum_shift = 0
    ASSERT_FALSE(s.check()) << "At row 0->1 transition, scalar_sum_shift must be 0 (via lagrange_first)";
}

/**
 * @brief Verify that zeroing constraints (14-19) cover specific variables but not scalar_sum
 *
 * Documents that when precompute_select = 0:
 * - w0, w1, w2, w3 are constrained to 0 (via subrelations 14-17)
 * - round is constrained to 0 (via subrelation 18)
 * - pc is constrained to 0 (via subrelation 19)
 * - scalar_sum is NOT constrained by zeroing constraints (but IS by lagrange_first via subrelation 11)
 *
 * This is NOT a vulnerability since scalar_sum_shift is constrained by subrelation 11 at row 0.
 *
 * Runtime: ~10ms
 */
TEST(ECCVMWnafInitialization, ZeroingConstraintsCoverage)
{

    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", true, formulas, vars, names);

    STerm zero = FFIConst("0", &s, 10);

    STerm precompute_select = find_var(vars, names, "precompute_select");
    STerm round = find_var(vars, names, "precompute_round");
    STerm pc = find_var(vars, names, "precompute_pc");
    STerm scalar_sum = find_var(vars, names, "precompute_scalar_sum");

    // Assert zeroing constraints (subrelations 14-19) only
    for (size_t i = 14; i <= 19; ++i) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formulas[i]), static_cast<cvc5::Term>(zero) }));
    }

    // Inactive row (not specifying lagrange_first - testing zeroing constraints in isolation)
    precompute_select == zero;

    // Sanity check: round = 0 should be SAT
    s.push();
    round == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when round = 0";
    s.pop();

    // Verify round is forced to 0 by zeroing constraints
    s.push();
    round != zero;
    ASSERT_FALSE(s.check()) << "When precompute_select = 0, round should be constrained to 0 by subrelation 18";
    s.pop();

    // Sanity check: pc = 0 should be SAT
    s.push();
    pc == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when pc = 0";
    s.pop();

    // Verify pc is forced to 0 by zeroing constraints
    s.push();
    pc != zero;
    ASSERT_FALSE(s.check()) << "When precompute_select = 0, pc should be constrained to 0 by subrelation 19";
    s.pop();

    // Verify scalar_sum is NOT constrained by zeroing constraints alone
    // (This is expected - scalar_sum is constrained by subrelation 11 via lagrange_first instead)
    s.push();
    scalar_sum != zero;
    ASSERT_TRUE(s.check()) << "scalar_sum should NOT be constrained by zeroing constraints 14-19 "
                           << "(it is constrained by subrelation 11 via lagrange_first)";
    s.pop();
}

/**
 * @brief Verify round_shift is also constrained at row 0 via lagrange_first
 *
 * Subrelation 10 uses the same selector as subrelation 11:
 * precompute_select * scaled_transition + scaled_lagrange_first
 *
 * When lagrange_first = 1, round_shift must be 0.
 *
 * Runtime: ~12ms
 */
TEST(ECCVMWnafInitialization, RoundShiftConstrainedAtRowZero)
{

    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", true, formulas, vars, names);

    STerm zero = FFIConst("0", &s, 10);
    STerm one = FFIConst("1", &s, 10);

    STerm lagrange_first = find_var(vars, names, "lagrange_first");
    STerm precompute_select = find_var(vars, names, "precompute_select");
    STerm round_shift = find_var(vars, names, "precompute_round_shift");

    // Assert all relation formulas
    for (size_t i = 0; i < formulas.size(); ++i) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formulas[i]), static_cast<cvc5::Term>(zero) }));
    }

    // Row 0 conditions
    lagrange_first == one;
    precompute_select == zero;

    // Sanity check: round_shift = 0 should be SAT
    s.push();
    round_shift == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when round_shift = 0";
    s.pop();

    // Try to violate: round_shift != 0
    round_shift != zero;

    // Should be UNSAT: lagrange_first activates subrelation 10 which forces round_shift = 0
    ASSERT_FALSE(s.check()) << "round_shift must be 0 at row 0 (via lagrange_first in subrelation 10)";
}

/**
 * @brief Verify initialization constraints don't apply when lagrange_first = 0
 *
 * When lagrange_first = 0 and precompute_select = 0 (inactive row not at start),
 * the initialization constraints from subrelations 10 and 11 should NOT be active.
 * Only the zeroing constraints (14-19) apply.
 *
 * Runtime: ~10ms
 */
TEST(ECCVMWnafInitialization, InitConstraintsInactiveAwayFromRowZero)
{

    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", true, formulas, vars, names);

    STerm zero = FFIConst("0", &s, 10);

    STerm lagrange_first = find_var(vars, names, "lagrange_first");
    STerm precompute_select = find_var(vars, names, "precompute_select");
    STerm q_transition = find_var(vars, names, "precompute_point_transition");
    STerm scalar_sum_shift = find_var(vars, names, "precompute_scalar_sum_shift");

    // Assert only subrelation 11 (scalar_sum_shift constraint)
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                          { static_cast<cvc5::Term>(formulas[11]), static_cast<cvc5::Term>(zero) }));

    // Away from row 0: lagrange_first = 0
    lagrange_first == zero;
    // Inactive row: precompute_select = 0
    precompute_select == zero;
    // Not at transition: q_transition = 0
    q_transition == zero;

    // Sanity check: scalar_sum_shift = 0 should be SAT
    s.push();
    scalar_sum_shift == zero;
    ASSERT_TRUE(s.check()) << "Should be SAT when scalar_sum_shift = 0";
    s.pop();

    // Try non-zero scalar_sum_shift
    scalar_sum_shift != zero;

    // Should be SAT: selector (precompute_select * transition + lagrange_first) is 0
    // so subrelation 11 doesn't constrain scalar_sum_shift
    ASSERT_TRUE(s.check()) << "Away from row 0, inactive rows should not constrain scalar_sum_shift via subrelation 11";
}
