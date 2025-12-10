#include <gtest/gtest.h>

#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "eccvm_relation_test_helpers.hpp"
#include "eccvm_relations.hpp"

using namespace bb;
using namespace smt_solver;
using namespace smt_terms;
using namespace eccvm_relation_test_helpers;

/**
 * Test that the ECC MSM relation ADD operation has unique outputs when msm_add = 1
 *
 * Structure:
 * 1. Set up two instances with equal inputs, assert outputs are different
 * 2. WITHOUT selector constraint: Should be SAT (outputs not constrained)
 * 3. WITH msm_add = 1: Should be UNSAT (outputs uniquely determined)
 *
 * Runtime: ~5s total
 */
TEST(ECCVMMSMRelation, AdditionOutputsAreUnique)
{
    auto trace = smt_eccvm_relations::record_eccvm_msm_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    // Create TWO instances of the relation
    std::vector<STerm> formulas_A, vars_A, formulas_B, vars_B;
    std::vector<std::string> names_A, names_B;
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "A", false, formulas_A, vars_A, names_A);
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "B", false, formulas_B, vars_B, names_B);

    // Find output variables
    STerm acc_x_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_x_shift");
    STerm acc_y_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_y_shift");
    STerm acc_x_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_x_shift");
    STerm acc_y_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_y_shift");

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert all relation formulas hold
    for (const auto& formula : formulas_A) {
        formula == zero;
    }
    for (const auto& formula : formulas_B) {
        formula == zero;
    }

    // Assert all INPUT variables are equal (non-shift variables)
    for (size_t i = 0; i < names_A.size(); ++i) {
        std::string base_name = names_A[i].substr(2);
        if (base_name.find("_shift") == std::string::npos) {
            vars_A[i] == vars_B[i];
        }
    }

    // Assert outputs are different
    cvc5::Term x_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_x_shift_A), static_cast<cvc5::Term>(acc_x_shift_B) });
    cvc5::Term y_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_y_shift_A), static_cast<cvc5::Term>(acc_y_shift_B) });
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { x_different, y_different }));

    // SANITY CHECK: Without selector constraint, outputs are NOT uniquely determined
    s.push();
    STerm msm_add_A = find_var(vars_A, names_A, "A_msm_add");
    msm_add_A == zero; // Selector OFF
    ASSERT_TRUE(s.check()) << "Sanity: When msm_add = 0, outputs should not be uniquely determined";
    s.pop();

    // UNIQUENESS: With msm_add = 1, outputs ARE uniquely determined
    msm_add_A == one;
    ASSERT_FALSE(s.check()) << "If all inputs are equal and msm_add = 1, outputs must be equal";
}

/**
 * Test that the ECC MSM relation DOUBLE operation has unique outputs when msm_double = 1
 *
 * Structure:
 * 1. Set up two instances with equal inputs, assert outputs are different
 * 2. WITHOUT selector constraint: Should be SAT (outputs not constrained)
 * 3. WITH msm_double = 1: Should be UNSAT (outputs uniquely determined)
 *
 * Runtime: ~4s total
 */
TEST(ECCVMMSMRelation, DoubleOutputsAreUnique)
{
    auto trace = smt_eccvm_relations::record_eccvm_msm_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas_A, vars_A, formulas_B, vars_B;
    std::vector<std::string> names_A, names_B;
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "A", false, formulas_A, vars_A, names_A);
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "B", false, formulas_B, vars_B, names_B);

    STerm acc_x_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_x_shift");
    STerm acc_y_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_y_shift");
    STerm acc_x_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_x_shift");
    STerm acc_y_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_y_shift");

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    for (const auto& formula : formulas_A) {
        formula == zero;
    }
    for (const auto& formula : formulas_B) {
        formula == zero;
    }

    for (size_t i = 0; i < names_A.size(); ++i) {
        std::string base_name = names_A[i].substr(2);
        if (base_name.find("_shift") == std::string::npos) {
            vars_A[i] == vars_B[i];
        }
    }

    cvc5::Term x_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_x_shift_A), static_cast<cvc5::Term>(acc_x_shift_B) });
    cvc5::Term y_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_y_shift_A), static_cast<cvc5::Term>(acc_y_shift_B) });
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { x_different, y_different }));

    // SANITY CHECK: Without selector constraint, outputs are NOT uniquely determined
    s.push();
    STerm msm_double_A = find_var(vars_A, names_A, "A_msm_double");
    msm_double_A == zero;
    ASSERT_TRUE(s.check()) << "Sanity: When msm_double = 0, outputs should not be uniquely determined";
    s.pop();

    // UNIQUENESS: With msm_double = 1, outputs ARE uniquely determined
    msm_double_A == one;
    ASSERT_FALSE(s.check()) << "If all inputs are equal and msm_double = 1, outputs must be equal";
}

/**
 * Test that the ECC MSM relation SKEW operation has unique outputs when msm_skew = 1
 *
 * Structure:
 * 1. Set up two instances with equal inputs, assert outputs are different
 * 2. WITHOUT selector constraint: Should be SAT (outputs not constrained)
 * 3. WITH msm_skew = 1: Should be UNSAT (outputs uniquely determined)
 *
 * Runtime: ~4.5s total
 */
TEST(ECCVMMSMRelation, SkewOutputsAreUnique)
{
    auto trace = smt_eccvm_relations::record_eccvm_msm_relation();
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    std::vector<STerm> formulas_A, vars_A, formulas_B, vars_B;
    std::vector<std::string> names_A, names_B;
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "A", false, formulas_A, vars_A, names_A);
    smt_eccvm_relations::replay_eccvm_msm_relation(trace, &s, "B", false, formulas_B, vars_B, names_B);

    STerm acc_x_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_x_shift");
    STerm acc_y_shift_A = find_var(vars_A, names_A, "A_msm_accumulator_y_shift");
    STerm acc_x_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_x_shift");
    STerm acc_y_shift_B = find_var(vars_B, names_B, "B_msm_accumulator_y_shift");

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    for (const auto& formula : formulas_A) {
        formula == zero;
    }
    for (const auto& formula : formulas_B) {
        formula == zero;
    }

    for (size_t i = 0; i < names_A.size(); ++i) {
        std::string base_name = names_A[i].substr(2);
        if (base_name.find("_shift") == std::string::npos) {
            vars_A[i] == vars_B[i];
        }
    }

    cvc5::Term x_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_x_shift_A), static_cast<cvc5::Term>(acc_x_shift_B) });
    cvc5::Term y_different = s.term_manager.mkTerm(
        cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(acc_y_shift_A), static_cast<cvc5::Term>(acc_y_shift_B) });
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { x_different, y_different }));

    // SANITY CHECK: Without selector constraint, outputs are NOT uniquely determined
    s.push();
    STerm msm_skew_A = find_var(vars_A, names_A, "A_msm_skew");
    msm_skew_A == zero;
    ASSERT_TRUE(s.check()) << "Sanity: When msm_skew = 0, outputs should not be uniquely determined";
    s.pop();

    // UNIQUENESS: With msm_skew = 1, outputs ARE uniquely determined
    msm_skew_A == one;
    ASSERT_FALSE(s.check()) << "If all inputs are equal and msm_skew = 1, outputs must be equal";
}
