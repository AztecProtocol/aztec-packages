#pragma once
#include "barretenberg/smt_verification/relations/relation_operation_recorder.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <memory>
#include <string>
#include <tuple>
#include <unordered_map>
#include <vector>

namespace smt_translator_relations {

/**
 * @brief Records the operations performed by the translator decomposition relation
 * This captures the computation graph without needing a solver
 * @return Shared pointer to the operation trace
 */
smt_relation_recorder::OperationTrace record_translator_decomposition_relation();

/**
 * @brief Records the operations performed by the translator opcode constraint relation
 * @return Shared pointer to the operation trace
 */
smt_relation_recorder::OperationTrace record_translator_opcode_constraint_relation();
smt_relation_recorder::OperationTrace record_translator_accumulator_transfer_relation();
smt_relation_recorder::OperationTrace record_translator_non_native_field_relation();

/**
 * @brief Records the operations performed by the translator accumulator transfer relation
 */
smt_relation_recorder::OperationTrace record_translator_accumulator_transfer_relation();

/**
 * @brief Replay a recorded translator decomposition relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas
 * @param out_vars Output vector for the variables created
 * @param out_names Output vector for the variable names
 */
void replay_translator_decomposition_relation(const smt_relation_recorder::OperationTrace& trace,
                                              smt_solver::Solver* solver,
                                              const std::string& prefix,
                                              bool use_ffi,
                                              std::vector<smt_terms::STerm>& out_formulas,
                                              std::vector<smt_terms::STerm>& out_vars,
                                              std::vector<std::string>& out_names);

void replay_translator_decomposition_relation_with_results(const smt_relation_recorder::OperationTrace& trace,
                                                           const std::unordered_map<size_t, smt_terms::STerm>& results,
                                                           const std::string& prefix,
                                                           std::vector<smt_terms::STerm>& out_formulas,
                                                           std::vector<smt_terms::STerm>& out_vars,
                                                           std::vector<std::string>& out_names);

/**
 * @brief Replay a recorded translator opcode constraint relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param out_formulas Output vector for the relation formulas
 * @param out_vars Output vector for the variables created
 * @param out_names Output vector for the variable names
 */
void replay_translator_opcode_constraint_relation(const smt_relation_recorder::OperationTrace& trace,
                                                  smt_solver::Solver* solver,
                                                  const std::string& prefix,
                                                  std::vector<smt_terms::STerm>& out_formulas,
                                                  std::vector<smt_terms::STerm>& out_vars,
                                                  std::vector<std::string>& out_names);

void replay_translator_accumulator_transfer_relation(const smt_relation_recorder::OperationTrace& trace,
                                                     smt_solver::Solver* solver,
                                                     const std::string& prefix,
                                                     bool use_ffi,
                                                     std::vector<smt_terms::STerm>& out_formulas,
                                                     std::vector<smt_terms::STerm>& out_vars,
                                                     std::vector<std::string>& out_names);

void replay_translator_non_native_field_relation(const smt_relation_recorder::OperationTrace& trace,
                                                 smt_solver::Solver* solver,
                                                 const std::string& prefix,
                                                 bool use_ffi,
                                                 std::vector<smt_terms::STerm>& out_formulas,
                                                 std::vector<smt_terms::STerm>& out_vars,
                                                 std::vector<std::string>& out_names);

/**
 * @brief High-level API: Record and immediately replay translator decomposition relation
 * This is a convenience function that combines recording and replaying
 */
void instantiate_translator_decomposition_relation_recorded(smt_solver::Solver* solver,
                                                            const std::string& prefix,
                                                            bool use_ffi,
                                                            std::vector<smt_terms::STerm>& out_formulas,
                                                            std::vector<smt_terms::STerm>& out_vars,
                                                            std::vector<std::string>& out_names);

/**
 * @brief High-level API: Record and immediately replay translator opcode constraint relation
 */
void instantiate_translator_opcode_constraint_relation_recorded(smt_solver::Solver* solver,
                                                                const std::string& prefix,
                                                                std::vector<smt_terms::STerm>& out_formulas,
                                                                std::vector<smt_terms::STerm>& out_vars,
                                                                std::vector<std::string>& out_names);

} // namespace smt_translator_relations
