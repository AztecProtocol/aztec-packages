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
 * @brief Left shift operation with 8-bit truncation
 * @param v0 Value to shift
 * @param v1 Number of bits to shift (8-bit value)
 * @param solver SMT solver instance
 * @return Result of (v0 << v1) truncated to 8 bits
 */
smt_circuit::STerm shl8(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

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
 * @brief Signed division in noir-style
 * @param v0 Numerator
 * @param v1 Denominator
 * @param bit_size bit sizes of numerator and denominator
 * @param solver SMT solver instance
 * @return Result of (v0 / v1)
 */
smt_circuit::STerm idiv(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size, smt_solver::Solver* solver);

/**
 * @brief
 * @param v0 Augend
 * @param v1 Addend
 * @param bit_size Bit size to truncate to
 * @return Result of truncate(a + b, bit_size - 1)
 */
smt_circuit::STerm add_signed(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size);
/**
 * @brief Signed subtraction operation: c = a - b + truncate to `bit_size` bits
 *
 * @param v0 Minuend
 * @param v1 Subtrahend
 * @param bit_size Bit size to truncate to
 * @return Result of (a - b + truncate(bit_size))
 */
smt_circuit::STerm sub_signed(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size);

/**
 * @brief Signed multiplication operation: c = a * b + truncate to `bit_size` bits
 *
 * @param v0 Multiplicand
 * @param v1 Multiplier
 * @param bit_size Bit size to truncate to
 * @return Result of (a * b + truncate(bit_size))
 */
smt_circuit::STerm mul_signed(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size);
