#include "helpers.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace bb;

using namespace smt_terms;

/**
 * @brief Test left shift operation
 * Tests that 5 << 1 = 10 using SMT solver
 */
TEST(helpers, shl)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

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

/**
 * @brief Test right shift operation
 * Tests that 5 >> 1 = 2 using SMT solver
 */
TEST(helpers, shr)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

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

/**
 * @brief Test edge case for right shift operation
 * Tests that 1879048194 >> 16 = 28672 using SMT solver
 */
TEST(helpers, buggy_shr)
{
    // using smt solver i found that 1879048194 >> 16 == 0
    // its strange...
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

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

/**
 * @brief Test power of 2 calculation
 * Tests that 2^11 = 2048 using SMT solver
 */
TEST(helpers, pow2)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

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

/**
 * @brief Test signed division with zero dividend
 * Tests that 0 / -1 = 0 using SMT solver
 */
TEST(helpers, signed_div)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = idiv(x, y, 2, &s);
    // 00 == 0
    x == 0;
    // 11 == -1
    y == 3;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000000000");
}

/**
 * @brief Test signed division with positive dividend and negative divisor
 * Tests that 1 / -1 = -1 using SMT solver
 */
TEST(helpers, signed_div_1)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = idiv(x, y, 2, &s);
    // 01 == 1
    x == 1;
    // 11 == -1
    y == 3;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000000011");
}

/**
 * @brief Test signed division with positive numbers
 * Tests that 7 / 2 = 3 using SMT solver
 */
TEST(helpers, signed_div_2)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = idiv(x, y, 4, &s);
    // 0111 == 7
    x == 7;
    // 0010 == 2
    y == 2;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000000011");
}

/**
 * @brief Test left shift overflow behavior
 * Tests that 1 << 50 = 0 (due to overflow) using SMT solver
 */
TEST(helpers, shl_overflow)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             /*base=*/16,
             /*bvsize=*/32);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = shl32(x, y, &s);
    x == 1;
    y == 50;
    s.check();
    std::unordered_map<std::string, cvc5::Term> terms({ { "x", x }, { "y", y }, { "z", z } });
    std::unordered_map<std::string, std::string> vals = s.model(terms);
    info("x = ", vals["x"]);
    info("y = ", vals["y"]);
    info("z = ", vals["z"]);
    // z == 1010 in binary
    EXPECT_TRUE(vals["z"] == "00000000000000000000000000000000");
}
