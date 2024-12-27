#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"

// used for base = 2; exp <= 8 so its okay
uint32_t pow_num(uint32_t base, uint32_t exp)
{
    uint32_t res = 1;
    for (uint32_t i = 0; i < exp; i++) {
        res *= base;
    }
    return res;
}

// returns 2^v0
smt_circuit::STerm pow2_8(smt_circuit::STerm v0, smt_solver::Solver* solver)
{
    uint32_t BIT_SIZE = 8;
    auto one = smt_terms::BVConst("1", solver, 10);
    auto two = smt_terms::BVConst("2", solver, 10);
    smt_circuit::STerm res = smt_circuit::BVVar("res", solver);
    res = one;
    auto exp = v0;
    for (uint32_t i = 1; i < BIT_SIZE + 1; i++) {
        auto r2 = res * res;
        auto mask = pow_num(2, BIT_SIZE - i);
        // same thing as taking ith bit in little endian
        auto b = (v0 & mask) >> (BIT_SIZE - i);
        res = (r2 * two * b) + (1 - b) * r2;
    }
    return res;
}

smt_circuit::STerm shl(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto pow2_v1 = pow2_8(v1, solver);
    return v0 * pow2_v1;
}

smt_circuit::STerm shr(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto pow2_v1 = pow2_8(v1, solver);
    auto res = v0 / pow2_v1;
    return res;
}

smt_circuit::STerm shl64(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto shifted = shl(v0, v1, solver);
    // 2^64 - 1
    auto mask = smt_terms::BVConst("18446744073709551615", solver, 10);
    auto res = shifted & mask;
    return res;
}

smt_circuit::STerm shl32(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto shifted = shl(v0, v1, solver);
    // 2^32 - 1
    auto mask = smt_terms::BVConst("4294967295", solver, 10);
    auto res = shifted & mask;
    return res;
}
