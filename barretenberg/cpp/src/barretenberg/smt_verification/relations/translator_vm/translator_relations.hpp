#pragma once

#include "barretenberg/smt_verification/terms/term.hpp"

namespace smt_translator_relations {

// Convenience function to create range constraint formulas: 0 <= var < upper_bound
// Returns a vector of constraint terms that can be asserted to the solver
std::vector<smt_terms::STerm> create_range_constraint_formulas(smt_terms::Solver* solver,
                                                               const std::vector<smt_terms::STerm>& vars,
                                                               const std::vector<std::string>& var_names,
                                                               const std::string& name_pattern,
                                                               uint64_t upper_bound);

// Helper to assert a vector of formula terms to the solver (formula == 0)
void assert_formulas_zero(smt_terms::Solver* solver, const std::vector<smt_terms::STerm>& formulas);

} // namespace smt_translator_relations
