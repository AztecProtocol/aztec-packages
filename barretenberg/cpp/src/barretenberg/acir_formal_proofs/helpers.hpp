#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"

/**
 * @brief Left shift operation with 64-bit truncation
 * @param v0 Value to shift
 * @param v1 Number of bits to shift (8-bit value)
 * @param solver SMT solver instance
 * @return Result of (v0 << v1) truncated to 64 bits
 */
smt_circuit::STerm shl64(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

/**
 * @brief Left shift operation with 32-bit truncation
 * @param v0 Value to shift
 * @param v1 Number of bits to shift (8-bit value)
 * @param solver SMT solver instance
 * @return Result of (v0 << v1) truncated to 32 bits
 */
smt_circuit::STerm shl32(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

/**
 * @brief Calculates power of 2
 * @param v0 Exponent (8-bit value)
 * @param solver SMT solver instance
 * @return 2^v0
 */
smt_circuit::STerm pow2_8(smt_circuit::STerm v0, smt_solver::Solver* solver);

/**
 * @brief Right shift operation
 * @param v0 Value to shift
 * @param v1 Number of bits to shift (8-bit value)
 * @param solver SMT solver instance
 * @return Result of (v0 >> v1)
 */
smt_circuit::STerm shr(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

/**
 * @brief Left shift operation without truncation
 * @param v0 Value to shift
 * @param v1 Number of bits to shift (8-bit value)
 * @param solver SMT solver instance
 * @return Result of (v0 << v1) without truncation
 */
smt_circuit::STerm shl(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

/**
 * @brief Truncates value to specified bit size
 * @param v0 Value to truncate
 * @param bit_size Number of bits to truncate to
 * @param solver SMT solver instance
 * @return Value truncated to bit_size bits
 */
smt_circuit::STerm truncate(smt_circuit::STerm v0, uint32_t bit_size, smt_solver::Solver* solver);

/**
 * @brief Integer division operation
 * @param v0 Value to divide
 * @param v1 Value to divide by
 * @param bit_size Number of bits to truncate to
 * @param solver SMT solver instance
 * @return Result of (v0 / v1) truncated to bit_size bits
 */
smt_circuit::STerm idiv(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size, smt_solver::Solver* solver);
