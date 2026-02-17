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
 * Test that the ECCVM bools relation correctly enforces boolean constraints on all 19 boolean polynomials
 *
 * Runtime: ~65ms
 */
TEST(ECCVMBoolsRelation, EnforcesBooleanConstraintsOnAllPolynomials)
{
    Solver s(GRUMPKIN_FQ_MODULUS, default_solver_config);

    // Record the relation once
    auto trace = smt_eccvm_relations::record_eccvm_bools_relation();

    // Verify we have 19 subrelations (one for each boolean polynomial)
    ASSERT_EQ(trace.accumulator_results.size(), 19);

    // Replay the relation on the solver using standard FF (not FFI)
    std::vector<STerm> formulas, vars;
    std::vector<std::string> names;
    smt_eccvm_relations::replay_eccvm_bools_relation(trace, &s, "", false, formulas, vars, names);

    // Should have 19 formulas (one per boolean constraint)
    ASSERT_EQ(formulas.size(), 19);

    STerm zero = FFConst("0", &s, 10);
    STerm one = FFConst("1", &s, 10);

    // Assert all relation formulas equal zero (relation must hold)
    for (const auto& formula : formulas) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formula), static_cast<cvc5::Term>(zero) }));
    }

    // List of all 19 boolean polynomial names from the relation implementation (lines 35-53)
    std::vector<std::string> boolean_poly_names = {
        "transcript_eq",                           // std::get<0>
        "transcript_add",                          // std::get<1>
        "transcript_mul",                          // std::get<2>
        "transcript_reset_accumulator",            // std::get<3>
        "transcript_msm_transition",               // std::get<4>
        "transcript_accumulator_not_empty",        // std::get<5>
        "transcript_z1zero",                       // std::get<6>
        "transcript_z2zero",                       // std::get<7>
        "transcript_add_x_equal",                  // std::get<8>
        "transcript_add_y_equal",                  // std::get<9>
        "transcript_base_infinity",                // std::get<10>
        "transcript_msm_infinity",                 // std::get<11>
        "transcript_msm_count_zero_at_transition", // std::get<12>
        "msm_transition",                          // std::get<13>
        "precompute_point_transition",             // std::get<14>
        "msm_add",                                 // std::get<15>
        "msm_double",                              // std::get<16>
        "msm_skew",                                // std::get<17>
        "precompute_select"                        // std::get<18>
    };

    // SANITY CHECK: The relation should be satisfiable (there exist valid boolean assignments)
    s.push();
    ASSERT_TRUE(s.check()) << "Sanity: The boolean relation should be satisfiable";
    s.pop();

    // ENFORCEMENT: For each boolean polynomial, verify it must be 0 or 1
    for (const auto& poly_name : boolean_poly_names) {
        // Find the variable for this polynomial
        STerm poly_var;
        bool found = false;
        for (size_t i = 0; i < names.size(); ++i) {
            if (names[i] == poly_name) {
                poly_var = vars[i];
                found = true;
                break;
            }
        }

        ASSERT_TRUE(found) << "Could not find polynomial variable: " << poly_name;

        // Test that the polynomial must be 0 or 1 by asserting it's NOT equal to both 0 and 1
        // If this is satisfiable, then the polynomial can take a value other than 0 or 1
        s.push();
        poly_var != zero; // Assert poly_var != 0
        poly_var != one;  // Assert poly_var != 1
        EXPECT_FALSE(s.check()) << "Polynomial " << poly_name << " should only be able to equal 0 or 1";
        s.pop();
    }
}
