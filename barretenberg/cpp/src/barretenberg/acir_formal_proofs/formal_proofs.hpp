#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "helpers.hpp"

void debug_solution(smt_solver::Solver* solver, std::unordered_map<std::string, cvc5::Term> terms)
{
    solver->print_assertions();
    std::unordered_map<std::string, std::string> vals = solver->model(terms);
    for (auto const& i : vals) {
        info(i.first, " = ", i.second);
    }
}

bool verify_add(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a + b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_sub(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a - b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_mul(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a * b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_div(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a / b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_mod(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    // c = a mod b
    // k * b + c = a
    // k = (a - c) / b
    // (a - c) * b + c * b == a * b
    smt_circuit::STerm c1 = (a - c) * b + c * b;
    smt_circuit::STerm c2 = a * b;
    c1 != c2;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms(
            { { "a", a }, { "b", b }, { "c", c }, { "c1", c1 }, { "c2", c2 } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_or(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a | b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_and(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a & b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_xor(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = a ^ b;
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_not_64(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    // 2**64 - 1
    auto mask = smt_terms::BVConst("18446744073709551615", solver, 10);
    auto br = a ^ mask;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "br", br } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_shl32(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = shl32(a, b, solver);
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_shr(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    auto cr = shr(a, b, solver);
    c != cr;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c }, { "cr", cr } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_eq_on_equlaity(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    a == b;
    c != 1;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c } });
        debug_solution(solver, terms);
    }
    return res;
}

bool verify_eq_on_inequlaity(smt_solver::Solver* solver, smt_circuit::UltraCircuit circuit)
{
    auto a = circuit["a"];
    auto b = circuit["b"];
    auto c = circuit["c"];
    a != b;
    c != 0;
    bool res = solver->check();
    if (res) {
        std::unordered_map<std::string, cvc5::Term> terms({ { "a", a }, { "b", b }, { "c", c } });
        debug_solution(solver, terms);
    }
    return res;
}