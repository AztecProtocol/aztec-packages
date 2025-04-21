#pragma once
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "cvc5/cvc5.h"
#include <string>
#include <unordered_map>

/**
 * @brief Debug helper to print solver assertions and model values
 * @param solver SMT solver instance
 * @param terms Map of term names to CVC5 terms to evaluate
 */
void debug_solution(smt_solver::Solver* solver, std::unordered_map<std::string, cvc5::Term> terms);

/**
 * @brief Verify addition operation: c = a + b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_add(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify subtraction operation: c = a - b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_sub(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify multiplication operation: c = a * b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_mul(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify integer division operation: c = a / b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_div(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify field division operation: c = a / b (in field)
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_div_field(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify modulo operation: c = a mod b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_mod(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify bitwise OR operation: c = a | b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_or(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify bitwise AND operation: c = a & b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_and(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify bitwise XOR operation: c = a ^ b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_xor(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify NOT operation on 127 bits: b = ~a
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b
 * @return true if a counterexample is found (verification fails)
 */
bool verify_not_127(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify 32-bit left shift operation: c = a << b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_shl32(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify 64-bit left shift operation: c = a << b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_shl64(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify right shift operation: c = a >> b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_shr(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify equality comparison when values are equal
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_eq_on_equlaity(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify equality comparison when values are not equal
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_eq_on_inequlaity(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify less than comparison: a < b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_lt(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);

/**
 * @brief Verify greater than comparison: a > b
 * @param solver SMT solver instance
 * @param circuit Circuit containing variables a, b, c
 * @return true if a counterexample is found (verification fails)
 */
bool verify_gt(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit);
