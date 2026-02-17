#pragma once

#include "barretenberg/relations/ecc_vm/ecc_bools_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_relation.hpp"
#include "barretenberg/smt_verification/relations/relation_operation_recorder.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"
#include <vector>

namespace smt_eccvm_relations {

/**
 * @brief Record the ECCVM bools relation operations
 */
smt_relation_recorder::OperationTrace record_eccvm_bools_relation();

/**
 * @brief Replay a recorded ECCVM bools relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (19 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_bools_relation(const smt_relation_recorder::OperationTrace& trace,
                                 smt_solver::Solver* solver,
                                 const std::string& prefix,
                                 bool use_ffi,
                                 std::vector<smt_terms::STerm>& out_formulas,
                                 std::vector<smt_terms::STerm>& out_vars,
                                 std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM WNAF relation operations
 */
smt_relation_recorder::OperationTrace record_eccvm_wnaf_relation();

/**
 * @brief Replay a recorded ECCVM WNAF relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (21 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_wnaf_relation(const smt_relation_recorder::OperationTrace& trace,
                                smt_solver::Solver* solver,
                                const std::string& prefix,
                                bool use_ffi,
                                std::vector<smt_terms::STerm>& out_formulas,
                                std::vector<smt_terms::STerm>& out_vars,
                                std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM MSM relation operations
 */
smt_relation_recorder::OperationTrace record_eccvm_msm_relation();

/**
 * @brief Replay a recorded ECCVM MSM relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_msm_relation(const smt_relation_recorder::OperationTrace& trace,
                               smt_solver::Solver* solver,
                               const std::string& prefix,
                               bool use_ffi,
                               std::vector<smt_terms::STerm>& out_formulas,
                               std::vector<smt_terms::STerm>& out_vars,
                               std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM Point Table relation operations
 */
smt_relation_recorder::OperationTrace record_eccvm_point_table_relation();

/**
 * @brief Replay a recorded ECCVM Point Table relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (6 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_point_table_relation(const smt_relation_recorder::OperationTrace& trace,
                                       smt_solver::Solver* solver,
                                       const std::string& prefix,
                                       bool use_ffi,
                                       std::vector<smt_terms::STerm>& out_formulas,
                                       std::vector<smt_terms::STerm>& out_vars,
                                       std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM Transcript relation operations
 */
smt_relation_recorder::OperationTrace record_eccvm_transcript_relation();

/**
 * @brief Replay a recorded ECCVM Transcript relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (25 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_transcript_relation(const smt_relation_recorder::OperationTrace& trace,
                                      smt_solver::Solver* solver,
                                      const std::string& prefix,
                                      bool use_ffi,
                                      std::vector<smt_terms::STerm>& out_formulas,
                                      std::vector<smt_terms::STerm>& out_vars,
                                      std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM Set relation operations
 * @note The Set relation uses RelationParameters (gamma, beta, etc.)
 *       which are recorded as symbolic variables for SMT verification.
 */
smt_relation_recorder::OperationTrace record_eccvm_set_relation();

/**
 * @brief Replay a recorded ECCVM Set relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (2 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_set_relation(const smt_relation_recorder::OperationTrace& trace,
                               smt_solver::Solver* solver,
                               const std::string& prefix,
                               bool use_ffi,
                               std::vector<smt_terms::STerm>& out_formulas,
                               std::vector<smt_terms::STerm>& out_vars,
                               std::vector<std::string>& out_names);

/**
 * @brief Record the ECCVM Lookup relation operations
 * @note The Lookup relation uses log-derivative lookups for point table reads/writes.
 */
smt_relation_recorder::OperationTrace record_eccvm_lookup_relation();

/**
 * @brief Replay a recorded ECCVM Lookup relation on a specific solver
 * @param trace The recorded operation trace
 * @param solver The SMT solver to use
 * @param prefix Optional prefix for variable names
 * @param use_ffi Whether to use FFI terms (true) or FF terms (false)
 * @param out_formulas Output vector for the relation formulas (2 subrelations)
 * @param out_vars Output vector for all variables created
 * @param out_names Output vector for the variable names
 */
void replay_eccvm_lookup_relation(const smt_relation_recorder::OperationTrace& trace,
                                  smt_solver::Solver* solver,
                                  const std::string& prefix,
                                  bool use_ffi,
                                  std::vector<smt_terms::STerm>& out_formulas,
                                  std::vector<smt_terms::STerm>& out_vars,
                                  std::vector<std::string>& out_names);

} // namespace smt_eccvm_relations
