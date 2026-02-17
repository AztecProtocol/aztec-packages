#include <gtest/gtest.h>

#include "translator_relation_test_helpers.hpp"
#include "translator_relations.hpp"
#include "translator_relations_recorder.hpp"
#include <array>

using namespace bb;
using namespace translator_relation_test_helpers;

/**
 * Verify that accumulator limbs transfer correctly between rows based on selector values
 *
 * Runtime: ~330ms
 */
TEST(TranslatorAccumulatorTransferRelation, AccumulatorTransferLogicIsEnforced)
{
    smt_solver::Solver s(BN254_MODULUS, smt_solver::default_solver_config);

    auto transfer_trace = smt_translator_relations::record_translator_accumulator_transfer_relation();

    std::vector<smt_terms::STerm> transfer_formulas, transfer_vars;
    std::vector<std::string> transfer_names;

    smt_translator_relations::replay_translator_accumulator_transfer_relation(
        transfer_trace, &s, "acc", true, transfer_formulas, transfer_vars, transfer_names);

    smt_translator_relations::create_range_constraint_formulas(&s, transfer_vars, transfer_names, "acc", 16384);
    smt_translator_relations::assert_formulas_zero(&s, transfer_formulas);

    auto get_var = [&](const std::string& name) -> smt_terms::STerm {
        for (size_t i = 0; i < transfer_names.size(); ++i) {
            if (transfer_names[i] == name) {
                return transfer_vars[i];
            }
        }
        ADD_FAILURE() << "Variable not found: " << name;
        return transfer_vars.front();
    };

    smt_terms::STerm lagrange_last = get_var("acc_lagrange_last_in_minicircuit");
    smt_terms::STerm lagrange_odd = get_var("acc_lagrange_odd_in_minicircuit");
    smt_terms::STerm lagrange_result_row = get_var("acc_lagrange_result_row");
    smt_terms::STerm lagrange_mini_masking = get_var("acc_lagrange_mini_masking");

    std::array<smt_terms::STerm, 4> acc = { get_var("acc_accumulators_binary_limbs_0"),
                                            get_var("acc_accumulators_binary_limbs_1"),
                                            get_var("acc_accumulators_binary_limbs_2"),
                                            get_var("acc_accumulators_binary_limbs_3") };

    std::array<smt_terms::STerm, 4> acc_shift = { get_var("acc_accumulators_binary_limbs_0_shift"),
                                                  get_var("acc_accumulators_binary_limbs_1_shift"),
                                                  get_var("acc_accumulators_binary_limbs_2_shift"),
                                                  get_var("acc_accumulators_binary_limbs_3_shift") };

    std::array<smt_terms::STerm, 4> result_params = { get_var("acc_accumulated_result_param_0"),
                                                      get_var("acc_accumulated_result_param_1"),
                                                      get_var("acc_accumulated_result_param_2"),
                                                      get_var("acc_accumulated_result_param_3") };

    smt_terms::STerm zero = smt_terms::FFIConst("0", &s, 10);
    smt_terms::STerm one = smt_terms::FFIConst("1", &s, 10);

    // Sanity check: the relation should be satisfiable
    s.push();
    ASSERT_TRUE(s.check()) << "Accumulator transfer relation should be satisfiable";
    s.pop();

    // Test 1: When lagrange_odd=1 and lagrange_last=0, accumulator limbs must equal their shifted counterparts
    for (size_t i = 0; i < 4; ++i) {
        s.push();
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagrange_last), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                              { static_cast<cvc5::Term>(lagrange_odd), static_cast<cvc5::Term>(one) }));
        smt_terms::STerm diff = acc[i] - acc_shift[i];
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::NOT,
            { s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                    { static_cast<cvc5::Term>(diff), static_cast<cvc5::Term>(zero) }) }));
        ASSERT_FALSE(s.check()) << "When lagrange_odd=1 and lagrange_last=0, acc[" << i << "] must equal acc_shift["
                                << i << "]";
        s.pop();
    }

    // Test 2: When lagrange_last=1 (and not masked), accumulator limbs must be 0
    for (size_t i = 0; i < 4; ++i) {
        s.push();
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagrange_last), static_cast<cvc5::Term>(one) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagrange_mini_masking), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::NOT,
            { s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                    { static_cast<cvc5::Term>(acc[i]), static_cast<cvc5::Term>(zero) }) }));
        ASSERT_FALSE(s.check()) << "When lagrange_last=1 (unmasked), acc[" << i << "] must be 0";
        s.pop();
    }

    // Test 3: When lagrange_result_row=1 (and not masked), limbs must match result parameters
    for (size_t i = 0; i < 4; ++i) {
        s.push();
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagrange_result_row), static_cast<cvc5::Term>(one) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::EQUAL, { static_cast<cvc5::Term>(lagrange_mini_masking), static_cast<cvc5::Term>(zero) }));
        s.assertFormula(s.term_manager.mkTerm(
            cvc5::Kind::NOT,
            { s.term_manager.mkTerm(cvc5::Kind::EQUAL,
                                    { static_cast<cvc5::Term>(acc[i]), static_cast<cvc5::Term>(result_params[i]) }) }));
        ASSERT_FALSE(s.check()) << "When lagrange_result_row=1 (unmasked), acc[" << i << "] must equal result_params["
                                << i << "]";
        s.pop();
    }
}
