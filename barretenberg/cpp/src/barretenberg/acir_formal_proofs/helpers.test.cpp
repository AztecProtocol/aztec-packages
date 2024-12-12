#include "helpers.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

using namespace smt_terms;

TEST(helpers, shl)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config, 16, 32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = shl(x, y, &s);
    x == 5;
    y == 1;
    // z should be z == 10;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    // z == 1010 in binary
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000001010");
}

TEST(helpers, shr)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config, 16, 32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = shr(x, y, &s);
    x == 5;
    y == 1;
    // z should be z == 2;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    // z == 10 in binary
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000000010");
}

TEST(helpers, buggy_shr)
{
    // using smt solver i found that 1879048194 >> 16 == 0
    // its strange...
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config, 16, 32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = shr(x, y, &s);
    x == 1879048194;
    y == 16;
    // z should be z == 28672;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    // z == 28672 in binary
    EXPECT_TRUE(vals["z"] == "00000000000000000111000000000000");
}

TEST(helpers, pow2)
{
    // using smt solver i found that 1879048194 >> 16 == 0
    // its strange...
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config, 16, 32);

    STerm x = BVVar("x", &s);
    STerm z = pow2_8(x, &s);
    x == 11;
    // z should be z == 2048;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("z = ", vals["z"]);
    // z == 2048 in binary
    EXPECT_TRUE(vals["z"] == "00000000000000000000100000000000");
}