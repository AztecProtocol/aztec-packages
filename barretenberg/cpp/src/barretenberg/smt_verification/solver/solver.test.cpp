#include "solver.hpp"
#include "barretenberg/smt_verification/terms/ffterm.hpp"
#include "barretenberg/smt_verification/terms/ffiterm.hpp"

#include <gtest/gtest.h>

using namespace smt_terms;

// basic operations with Solver class
TEST(solver, solver_use_case)
{
    SolverConfiguration config = {true, 0};
    Solver s("11", config, 10);
    FFTerm x = FFTerm::Var("x", &s);
    FFTerm y = FFTerm::Var("y", &s);

    FFTerm z = x * y + x * x;
    z == bb::fr(15);
    x != y;
    x != bb::fr(0);
    y != bb::fr(0);

    bool res = s.check();
    ASSERT_TRUE(res);

    std::unordered_map<std::string, cvc5::Term> vars = { { "x", x }, { "y", y } };
    std::unordered_map<std::string, std::string> mvars = s.model(vars);

    std::vector<cvc5::Term> terms = {x, y};
    std::unordered_map<std::string, std::string> mvars1 = s.model(terms);
    ASSERT_EQ(mvars["x"], mvars1["x"]);
    ASSERT_EQ(mvars["y"], mvars1["y"]);
}