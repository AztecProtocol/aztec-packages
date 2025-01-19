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

smt_circuit::STerm truncate(smt_circuit::STerm v0, uint32_t bit_size, smt_solver::Solver* solver)
{
    smt_circuit::STerm power = smt_terms::BVConst(std::to_string(bit_size), solver, 10);
    auto mask = pow2_8(power, solver);
    return v0 & (mask - 1);
}

smt_circuit::STerm shl64(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto shifted = shl(v0, v1, solver);
    // 2^64 - 1
    /*auto mask = smt_terms::BVConst("18446744073709551615", solver, 10);
    auto res = shifted & mask;*/
    auto res = truncate(shifted, 64, solver);
    return res;
}

smt_circuit::STerm shl32(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver)
{
    auto shifted = shl(v0, v1, solver);
    auto res = truncate(shifted, 32, solver);
    return res;
}

smt_circuit::STerm idiv(smt_circuit::STerm v0, smt_circuit::STerm v1, uint32_t bit_size, smt_solver::Solver* solver)
{
    // highest bit of v0 and v1 is sign bit
    smt_circuit::STerm exponent = smt_terms::BVConst(std::to_string(bit_size), solver, 10);
    // because pow(2, 0) == 1
    auto mask_abs_value = pow2_8(exponent - 1, solver);
    auto sign_bit_v0 = v0 & mask_abs_value;
    auto sign_bit_v1 = v1 & mask_abs_value;
    auto res_sign_bit = sign_bit_v0 ^ sign_bit_v1;
    auto abs_value_v0 = truncate(v0, bit_size - 1, solver);
    auto abs_value_v1 = truncate(v1, bit_size - 1, solver);
    auto abs_res = abs_value_v0 / abs_value_v1;

    // if abs_value_v0 == 0 then res = 0
    auto res = smt_terms::BVVar("res_haboba", solver);
    auto condition = smt_terms::Bool(abs_value_v0, solver) == smt_terms::Bool(smt_terms::BVConst("0", solver, 10));
    auto eq1 = condition & (smt_terms::Bool(res, solver) == smt_terms::Bool(smt_terms::BVConst("0", solver, 10)));
    auto eq2 = !condition & (smt_terms::Bool(res, solver) == smt_terms::Bool(res_sign_bit | abs_res, solver));

    (eq1 | eq2).assert_term();

    return res;
}
