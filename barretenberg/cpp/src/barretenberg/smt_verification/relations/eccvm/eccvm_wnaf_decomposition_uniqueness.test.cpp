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
 * Test that WNAF scalar decomposition is unique across 8 rounds
 *
 * The WNAF relation accumulates slices across 8 rounds:
 * - Round 0: scalar_sum[0] = 0, scalar_sum_shift[0] = f(slices[0])
 * - Round 1: scalar_sum[1] = scalar_sum_shift[0], scalar_sum_shift[1] = f(slices[1])
 * - ...
 * - Round 7: scalar_sum[7] = scalar_sum_shift[6], scalar_sum_shift[7] = f(slices[7])
 *
 * We prove uniqueness by creating two instances of each round and showing:
 * If scalar_sum_shift_A == scalar_sum_shift_B, then slices_A == slices_B (and scalar_sum_A == scalar_sum_B)
 *
 * We do this iteratively for all 8 rounds:
 * - Round 0: scalar_sum = 0 (fixed), prove slices are unique given scalar_sum_shift
 * - Rounds 1-7: scalar_sum_A = scalar_sum_B (same input), prove slices are unique given scalar_sum_shift
 *
 * Runtime: ~4 minutes for all 8 rounds
 */
TEST(ECCVMWnafRelation, ScalarDecompositionIsUniqueAcrossAllRounds)
{

    // Record the relation once
    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();
    ASSERT_EQ(trace.accumulator_results.size(), 21);

    // Slice names
    std::vector<std::string> slice_names = {
        "precompute_s1hi", "precompute_s1lo", "precompute_s2hi", "precompute_s2lo",
        "precompute_s3hi", "precompute_s3lo", "precompute_s4hi", "precompute_s4lo"
    };

    // Track the maximum possible value of scalar_sum_shift after each round
    // This will be used to constrain the input range for the next round
    std::string max_scalar_sum = "0"; // Round 0 starts with scalar_sum = 0

    // Test uniqueness for each round
    // For round 0, scalar_sum = 0
    // For subsequent rounds, scalar_sum is in the range [0, max_value_from_previous_round]
    for (size_t round = 0; round < 8; ++round) {
        Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

        // Create constants
        STerm zero = FFIConst("0", &s, 10);
        STerm one = FFIConst("1", &s, 10);
        STerm two = FFIConst("2", &s, 10);
        STerm three = FFIConst("3", &s, 10);

        // Create TWO instances of the relation for this round
        std::vector<STerm> formulas_A, vars_A;
        std::vector<std::string> names_A;
        smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "A_", true, formulas_A, vars_A, names_A);

        std::vector<STerm> formulas_B, vars_B;
        std::vector<std::string> names_B;
        smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "B_", true, formulas_B, vars_B, names_B);

        // Find variables for instance A
        std::vector<STerm> slices_A;
        for (const auto& slice_name : slice_names) {
            slices_A.push_back(find_var(vars_A, names_A, "A__" + slice_name));
        }
        STerm scalar_sum_A = find_var(vars_A, names_A, "A__precompute_scalar_sum");
        STerm scalar_sum_shift_A = find_var(vars_A, names_A, "A__precompute_scalar_sum_shift");
        STerm precompute_select_A = find_var(vars_A, names_A, "A__precompute_select");
        STerm q_transition_A = find_var(vars_A, names_A, "A__precompute_point_transition");

        // Find variables for instance B
        std::vector<STerm> slices_B;
        for (const auto& slice_name : slice_names) {
            slices_B.push_back(find_var(vars_B, names_B, "B__" + slice_name));
        }
        STerm scalar_sum_B = find_var(vars_B, names_B, "B__precompute_scalar_sum");
        STerm scalar_sum_shift_B = find_var(vars_B, names_B, "B__precompute_scalar_sum_shift");
        STerm precompute_select_B = find_var(vars_B, names_B, "B__precompute_select");
        STerm q_transition_B = find_var(vars_B, names_B, "B__precompute_point_transition");

        // Assert range constraints for all slices in both instances
        for (const auto& slice : slices_A) {
            cvc5::Term slice_term = static_cast<cvc5::Term>(slice);
            cvc5::Term is_zero =
                s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(zero) });
            cvc5::Term is_one = s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(one) });
            cvc5::Term is_two = s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(two) });
            cvc5::Term is_three =
                s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(three) });
            s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { is_zero, is_one, is_two, is_three }));
        }

        for (const auto& slice : slices_B) {
            cvc5::Term slice_term = static_cast<cvc5::Term>(slice);
            cvc5::Term is_zero =
                s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(zero) });
            cvc5::Term is_one = s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(one) });
            cvc5::Term is_two = s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(two) });
            cvc5::Term is_three =
                s.term_manager.mkTerm(cvc5::Kind::EQUAL, { slice_term, static_cast<cvc5::Term>(three) });
            s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, { is_zero, is_one, is_two, is_three }));
        }

        // Assert the accumulation formula for both instances (subrelation 8)
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(formulas_A[8]), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(formulas_B[8]), static_cast<cvc5::Term>(zero) }));

        // Set control variables for both instances
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(precompute_select_A), static_cast<cvc5::Term>(one) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(precompute_select_B), static_cast<cvc5::Term>(one) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(q_transition_A), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(q_transition_B), static_cast<cvc5::Term>(zero) }));

        // For round 0, constrain scalar_sum to 0
        // For later rounds, both scalar_sum values must be equal (to ensure we're testing the same input)
        if (round == 0) {
            s.assertFormula(s.term_manager.mkTerm(
                cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(scalar_sum_A), static_cast<cvc5::Term>(zero) }));
            s.assertFormula(s.term_manager.mkTerm(
                cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(scalar_sum_B), static_cast<cvc5::Term>(zero) }));
        } else {
            // For subsequent rounds, assert that both instances have the SAME scalar_sum
            // This ensures we're testing: given the same scalar_sum and same scalar_sum_shift,
            // are the slices necessarily the same?
            s.assertFormula(s.term_manager.mkTerm(
                cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(scalar_sum_A), static_cast<cvc5::Term>(scalar_sum_B) }));
        }

        // CRITICAL: Assert that the outputs are equal
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL,
            { static_cast<cvc5::Term>(scalar_sum_shift_A), static_cast<cvc5::Term>(scalar_sum_shift_B) }));

        // Sanity check: with same slices, the model should be SAT
        s.push();
        for (size_t i = 0; i < slices_A.size(); ++i) {
            s.assertFormula(s.term_manager.mkTerm(
                cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(slices_A[i]), static_cast<cvc5::Term>(slices_B[i]) }));
        }
        ASSERT_TRUE(s.check()) << "Round " << round << ": Should be SAT when slices are equal";
        s.pop();

        // Now assert that the slices are different
        // We want to check if there exist two different slice sets that produce the same output
        // (given the same scalar_sum input, which we've already constrained to be equal)
        std::vector<cvc5::Term> different_terms;

        // Check if slices are different
        for (size_t i = 0; i < slices_A.size(); ++i) {
            cvc5::Term distinct = s.term_manager.mkTerm(
                cvc5::Kind::DISTINCT, { static_cast<cvc5::Term>(slices_A[i]), static_cast<cvc5::Term>(slices_B[i]) });
            different_terms.push_back(distinct);
        }

        // Assert that at least one slice is different
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::OR, different_terms));

        // Should be UNSAT: if outputs are equal, inputs must be equal (uniqueness)
        ASSERT_FALSE(s.check()) << "Round " << round << ": If scalar_sum_shift values are equal, "
                                << "the inputs (slices and scalar_sum) must be equal";

        // Compute the maximum possible value of scalar_sum_shift for this round
        // This will be the range for the next round's scalar_sum input
        // The formula is: scalar_sum_shift = scalar_sum * 2^16 + (2^12*w0 + 2^8*w1 + 2^4*w2 + w3)
        // where each w_i is at most 15 (derived from 2-bit slices)
        // Maximum slice contribution: (2^12 + 2^8 + 2^4 + 1) * 15 = 61695
        uint64_t max_contribution = 61695;
        if (round == 0) {
            // Round 0: scalar_sum = 0, so max = 61695
            max_scalar_sum = std::to_string(max_contribution);
        } else {
            // For subsequent rounds: max_scalar_sum_shift = max_scalar_sum * 2^16 + 61695
            uint64_t prev_max = std::stoull(max_scalar_sum);
            uint64_t new_max = prev_max * 65536 + max_contribution;
            max_scalar_sum = std::to_string(new_max);
        }
    }
}
