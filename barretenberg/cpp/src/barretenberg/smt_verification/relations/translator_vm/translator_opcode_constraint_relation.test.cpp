#include <gtest/gtest.h>

#include "translator_relation_test_helpers.hpp"
#include "translator_relations.hpp"
#include "translator_relations_recorder.hpp"

using namespace bb;
using namespace translator_relation_test_helpers;

/**
 * Verify that the opcode constraint relation correctly enforces op in {0, 3, 4, 8}
 *
 * Runtime: ~12ms
 */
TEST(TranslatorOpcodeConstraintRelation, OpcodeMustBeInValidSet)
{
    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

    std::vector<smt_terms::STerm> formulas, vars;
    std::vector<std::string> names;

    auto recording_trace = smt_translator_relations::record_translator_opcode_constraint_relation();
    smt_translator_relations::replay_translator_opcode_constraint_relation(
        recording_trace, &s, "", formulas, vars, names);

    // Find selector and opcode variables
    smt_terms::STerm lagr_mini, op_var, lagr_even;
    bool found_op = false, found_lagr_mini = false, found_lagr_even = false;
    for (size_t i = 0; i < names.size(); ++i) {
        if (names[i] == "lagrange_mini_masking") {
            lagr_mini = vars[i];
            found_lagr_mini = true;
        }
        if (names[i] == "op") {
            op_var = vars[i];
            found_op = true;
        }
        if (names[i] == "lagrange_even_in_minicircuit") {
            lagr_even = vars[i];
            found_lagr_even = true;
        }
    }

    ASSERT_TRUE(found_op) << "Could not find 'op' in variable names";
    ASSERT_TRUE(found_lagr_mini) << "Could not find 'lagrange_mini_masking' in variable names";
    ASSERT_TRUE(found_lagr_even) << "Could not find 'lagrange_even_in_minicircuit' in variable names";

    smt_terms::STerm zero = smt_terms::FFConst("0", &s, 10);
    smt_terms::STerm one = smt_terms::FFConst("1", &s, 10);

    // Set lagrange_mini_masking = 0 (constraint is active)
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                          { static_cast<cvc5::Term>(lagr_mini), static_cast<cvc5::Term>(zero) }));
    // Set lagrange_even_in_minicircuit = 1 (we're at an even index in minicircuit)
    s.assertFormula(
        s.term_manager.mkTerm(cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagr_even), static_cast<cvc5::Term>(one) }));

    for (const auto& formula : formulas) {
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(formula), static_cast<cvc5::Term>(zero) }));
    }

    // Sanity check: the relation should be satisfiable with a valid opcode
    s.push();
    smt_terms::STerm valid_op = smt_terms::FFConst("3", &s, 10);
    s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                          { static_cast<cvc5::Term>(op_var), static_cast<cvc5::Term>(valid_op) }));
    ASSERT_TRUE(s.check()) << "Opcode constraint should be satisfiable with valid opcode (3)";
    s.pop();

    // Exclude all valid opcodes: op != 0 AND op != 3 AND op != 4 AND op != 8
    // If the constraint is enforced, this should be UNSAT
    for (const char* val_str : { "0", "3", "4", "8" }) {
        smt_terms::STerm val = smt_terms::FFConst(val_str, &s, 10);
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::NOT,
            { s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                    { static_cast<cvc5::Term>(op_var), static_cast<cvc5::Term>(val) }) }));
    }

    ASSERT_FALSE(s.check()) << "op must be constrained to {0, 3, 4, 8}";
}
