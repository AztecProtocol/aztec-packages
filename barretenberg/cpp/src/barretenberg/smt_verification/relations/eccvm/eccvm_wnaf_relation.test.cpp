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
 * Test that the ECCVM WNAF relation correctly enforces 2-bit constraints on all 8 slice polynomials
 *
 * Runtime: ~150ms
 */
TEST(ECCVMWnafRelation, EnforcesTwoBitConstraintsOnAllSlices)
{

    // Record the relation once
    auto trace = smt_eccvm_relations::record_eccvm_wnaf_relation();

    // Verify we have 21 subrelations (8 for 2-bit slice constraints + 13 others)
    ASSERT_EQ(trace.accumulator_results.size(), 21);

    // The 8 slices are: precompute_s1hi, precompute_s1lo, precompute_s2hi, precompute_s2lo,
    //                   precompute_s3hi, precompute_s3lo, precompute_s4hi, precompute_s4lo
    // The first 8 subrelations (indices 0-7) correspond to the 2-bit range constraints on these slices
    std::vector<std::string> slice_names = {
        "precompute_s1hi", // subrelation 0
        "precompute_s1lo", // subrelation 1
        "precompute_s2hi", // subrelation 2
        "precompute_s2lo", // subrelation 3
        "precompute_s3hi", // subrelation 4
        "precompute_s3lo", // subrelation 5
        "precompute_s4hi", // subrelation 6
        "precompute_s4lo"  // subrelation 7
    };

    // Test each slice individually to keep solver time reasonable
    for (size_t slice_idx = 0; slice_idx < slice_names.size(); ++slice_idx) {
        Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

        // Replay the relation
        std::vector<STerm> formulas;
        std::vector<STerm> vars;
        std::vector<std::string> names;
        smt_eccvm_relations::replay_eccvm_wnaf_relation(trace, &s, "", false, formulas, vars, names);

        ASSERT_EQ(formulas.size(), 21);

        STerm zero = FFConst("0", &s, 10);
        STerm one = FFConst("1", &s, 10);
        STerm two = FFConst("2", &s, 10);
        STerm three = FFConst("3", &s, 10);

        // Assert only the specific slice constraint formula for this slice (formula at index slice_idx)
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(formulas[slice_idx]), static_cast<cvc5::Term>(zero) }));

        // Test 1: With just this slice constraint, the relation should be satisfiable
        ASSERT_TRUE(s.check()) << "Slice constraint " << slice_idx << " should be satisfiable";

        // Test 2: Find the slice variable and verify it must be in {0, 1, 2, 3}
        STerm slice_var;
        bool found = false;
        for (size_t i = 0; i < names.size(); ++i) {
            if (names[i] == slice_names[slice_idx]) {
                slice_var = vars[i];
                found = true;
                break;
            }
        }

        ASSERT_TRUE(found) << "Could not find slice variable: " << slice_names[slice_idx];

        // Test that the slice must be in {0, 1, 2, 3} by asserting it's NOT equal to 0, 1, 2, AND 3
        // If this is satisfiable, then the slice can take a value outside {0, 1, 2, 3}
        s.push();
        slice_var != zero;
        slice_var != one;
        slice_var != two;
        slice_var != three;
        ASSERT_FALSE(s.check()) << "Slice " << slice_names[slice_idx] << " should only be able to equal 0, 1, 2, or 3";
        s.pop();
    }
}
