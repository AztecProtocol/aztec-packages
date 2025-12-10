/**
 * @file eccvm_point_table_relation.test.cpp
 * @brief SMT-based formal verification of ECCVM Point Table relation
 *
 * The Point Table relation constrains the precomputation of point multiples
 * used in the Straus MSM algorithm:
 * - Point doubling: (Dx, Dy) = 2*(Tx, Ty) at transitions
 * - Point addition: (Tx, Ty) = (Tx_shift, Ty_shift) + (Dx, Dy) between transitions
 * - D persistence: (Dx, Dy) stays constant between transitions
 *
 * NOTE: Edge cases (Ty=0 for doubling, x1=x2 for addition) are impossible by construction.
 * The point table only computes {P, 2P, 3P, ..., 15P} for non-infinity base points P.
 * Since the curve has prime order r, all these multiples are distinct non-infinity points
 * with distinct x-coordinates. See eccvm/README.md for details.
 *
 * Key properties verified:
 * 1. Doubling produces unique outputs
 * 2. Addition produces unique outputs
 * 3. Constraints are properly gated by lagrange_first and point_transition
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
 * @brief Verify point doubling produces unique outputs
 *
 * Structure:
 * 1. Set up two instances with equal inputs, assert outputs are different
 * 2. WITHOUT transition: Should be SAT (doubling not enforced)
 * 3. WITH transition = 1: Should be UNSAT (outputs uniquely determined)
 *
 * Runtime: ~15ms total
 */
TEST(ECCVMPointTableRelation, DoublingOutputIsUnique)
{
    auto trace = smt_eccvm_relations::record_eccvm_point_table_relation();
    ASSERT_EQ(trace.accumulator_results.size(), 6);

    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Create TWO instances
    std::vector<STerm> formulas_A, vars_A;
    std::vector<std::string> names_A;
    smt_eccvm_relations::replay_eccvm_point_table_relation(trace, &s, "A", false, formulas_A, vars_A, names_A);

    std::vector<STerm> formulas_B, vars_B;
    std::vector<std::string> names_B;
    smt_eccvm_relations::replay_eccvm_point_table_relation(trace, &s, "B", false, formulas_B, vars_B, names_B);

    // Get doubling variables
    STerm Tx_A = find_var(vars_A, names_A, "A_precompute_tx");
    STerm Ty_A = find_var(vars_A, names_A, "A_precompute_ty");
    STerm Dx_A = find_var(vars_A, names_A, "A_precompute_dx");
    STerm Dy_A = find_var(vars_A, names_A, "A_precompute_dy");
    STerm transition_A = find_var(vars_A, names_A, "A_precompute_point_transition");

    STerm Tx_B = find_var(vars_B, names_B, "B_precompute_tx");
    STerm Ty_B = find_var(vars_B, names_B, "B_precompute_ty");
    STerm Dx_B = find_var(vars_B, names_B, "B_precompute_dx");
    STerm Dy_B = find_var(vars_B, names_B, "B_precompute_dy");
    STerm transition_B = find_var(vars_B, names_B, "B_precompute_point_transition");

    // Assert doubling constraints (subrelations 0-1) for both instances
    formulas_A[0] == zero;
    formulas_A[1] == zero;
    formulas_B[0] == zero;
    formulas_B[1] == zero;

    // Same input point
    Tx_A == Tx_B;
    Ty_A == Ty_B;

    // Exclude Ty = 0 edge case for the SMT solver.
    // Note: This case is impossible in ECCVM by construction - all points are non-infinity
    // multiples of P on a prime-order curve. See eccvm/README.md for details.
    Ty_A != zero;

    // Assert outputs are different
    cvc5::Term dx_diff =
        s.term_manager.mkTerm(cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(Dx_A), static_cast<cvc5::Term>(Dx_B) });
    cvc5::Term dy_diff =
        s.term_manager.mkTerm(cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(Dy_A), static_cast<cvc5::Term>(Dy_B) });
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { dx_diff, dy_diff }));

    // SANITY CHECK: Without transition, doubling is NOT enforced
    s.push();
    transition_A == zero;
    transition_B == zero;
    ASSERT_TRUE(s.check()) << "Sanity: When transition = 0, doubling should not be enforced";
    s.pop();

    // UNIQUENESS: With transition = 1, doubling produces unique outputs
    transition_A == one;
    transition_B == one;
    ASSERT_FALSE(s.check()) << "Point doubling should produce unique outputs for the same input";
}

/**
 * @brief Verify point addition produces unique outputs
 *
 * Structure:
 * 1. Set up two instances with equal inputs, assert outputs are different
 * 2. WITHOUT conditions: Should be SAT (addition not enforced at transition)
 * 3. WITH transition = 0 and lagrange_first = 0: Should be UNSAT (outputs uniquely determined)
 *
 * Runtime: ~15ms total
 */
TEST(ECCVMPointTableRelation, AdditionOutputIsUnique)
{
    auto trace = smt_eccvm_relations::record_eccvm_point_table_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    std::vector<STerm> formulas_A, vars_A;
    std::vector<std::string> names_A;
    smt_eccvm_relations::replay_eccvm_point_table_relation(trace, &s, "A", false, formulas_A, vars_A, names_A);

    std::vector<STerm> formulas_B, vars_B;
    std::vector<std::string> names_B;
    smt_eccvm_relations::replay_eccvm_point_table_relation(trace, &s, "B", false, formulas_B, vars_B, names_B);

    // Get addition variables
    STerm Tx_A = find_var(vars_A, names_A, "A_precompute_tx");
    STerm Ty_A = find_var(vars_A, names_A, "A_precompute_ty");
    STerm Tx_shift_A = find_var(vars_A, names_A, "A_precompute_tx_shift");
    STerm Ty_shift_A = find_var(vars_A, names_A, "A_precompute_ty_shift");
    STerm Dx_A = find_var(vars_A, names_A, "A_precompute_dx");
    STerm Dy_A = find_var(vars_A, names_A, "A_precompute_dy");
    STerm transition_A = find_var(vars_A, names_A, "A_precompute_point_transition");
    STerm lagrange_first_A = find_var(vars_A, names_A, "A_lagrange_first");

    STerm Tx_B = find_var(vars_B, names_B, "B_precompute_tx");
    STerm Ty_B = find_var(vars_B, names_B, "B_precompute_ty");
    STerm Tx_shift_B = find_var(vars_B, names_B, "B_precompute_tx_shift");
    STerm Ty_shift_B = find_var(vars_B, names_B, "B_precompute_ty_shift");
    STerm Dx_B = find_var(vars_B, names_B, "B_precompute_dx");
    STerm Dy_B = find_var(vars_B, names_B, "B_precompute_dy");
    STerm transition_B = find_var(vars_B, names_B, "B_precompute_point_transition");
    STerm lagrange_first_B = find_var(vars_B, names_B, "B_lagrange_first");

    // Assert addition constraints (subrelations 4-5) for both instances
    formulas_A[4] == zero;
    formulas_A[5] == zero;
    formulas_B[4] == zero;
    formulas_B[5] == zero;

    // Same inputs
    Tx_shift_A == Tx_shift_B;
    Ty_shift_A == Ty_shift_B;
    Dx_A == Dx_B;
    Dy_A == Dy_B;

    // Exclude x1 = x2 edge case for the SMT solver.
    // Note: This case is impossible in ECCVM by construction - the point table computes
    // T = T + D where T cycles through odd multiples {P, 3P, 5P, ...} and D = 2P.
    // These are all distinct points with distinct x-coordinates on a prime-order curve.
    Tx_shift_A != Dx_A;

    // Assert outputs (Tx, Ty) are different
    cvc5::Term tx_diff =
        s.term_manager.mkTerm(cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(Tx_A), static_cast<cvc5::Term>(Tx_B) });
    cvc5::Term ty_diff =
        s.term_manager.mkTerm(cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(Ty_A), static_cast<cvc5::Term>(Ty_B) });
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { tx_diff, ty_diff }));

    // SANITY CHECK: At transition, addition is NOT enforced
    s.push();
    transition_A == one;
    transition_B == one;
    lagrange_first_A == zero;
    lagrange_first_B == zero;
    ASSERT_TRUE(s.check()) << "Sanity: When transition = 1, addition should not be enforced";
    s.pop();

    // UNIQUENESS: With transition = 0 and not first row, addition produces unique outputs
    transition_A == zero;
    transition_B == zero;
    lagrange_first_A == zero;
    lagrange_first_B == zero;
    ASSERT_FALSE(s.check()) << "Point addition should produce unique outputs for the same inputs";
}

/**
 * @brief Verify D persistence constraint
 *
 * Structure:
 * 1. Set up constraint D != D_shift
 * 2. WITHOUT conditions: Should be SAT (persistence not enforced on first row)
 * 3. WITH transition = 0 and lagrange_first = 0: Should be UNSAT (D must persist)
 *
 * Runtime: ~5ms total
 */
TEST(ECCVMPointTableRelation, DPersistenceIsEnforced)
{
    auto trace = smt_eccvm_relations::record_eccvm_point_table_relation();

    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_point_table_relation(trace, &s, "", false, formulas, vars, names);

    STerm Dx = find_var(vars, names, "precompute_dx");
    STerm Dy = find_var(vars, names, "precompute_dy");
    STerm Dx_shift = find_var(vars, names, "precompute_dx_shift");
    STerm Dy_shift = find_var(vars, names, "precompute_dy_shift");
    STerm transition = find_var(vars, names, "precompute_point_transition");
    STerm lagrange_first = find_var(vars, names, "lagrange_first");

    // Assert persistence constraints (subrelations 2-3)
    formulas[2] == zero;
    formulas[3] == zero;

    // Try to violate: Dx != Dx_shift
    Dx != Dx_shift;

    // SANITY CHECK: On first row, persistence is NOT enforced
    s.push();
    lagrange_first == one;
    transition == zero;
    ASSERT_TRUE(s.check()) << "Sanity: On first row, persistence should not be enforced";
    s.pop();

    // ENFORCEMENT: With transition = 0 and not first row, D must persist
    transition == zero;
    lagrange_first == zero;
    ASSERT_FALSE(s.check()) << "D should persist when not at transition and not first row";
}
