#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "term.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_randomness();
}

using namespace bb;
using namespace smt_terms;

TEST(SymbolicBool, and)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    bool a = static_cast<bool>(engine.get_random_uint8() & 1);
    bool b = static_cast<bool>(engine.get_random_uint8() & 1);
    bool c = a && b;

    Bool x = Bool(std::string("x"), &slv);
    Bool y = Bool(std::string("y"), &slv);
    Bool z = x & y;

    (x == Bool(a, &slv)).assert_term();
    (y == Bool(b, &slv)).assert_term();
    ASSERT_TRUE(slv.check());

    bb::fr zvals = string_to_fr(slv[z], /*base=*/10);
    ASSERT_EQ(bb::fr(c), zvals);
}

TEST(SymbolicBool, or)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    bool a = static_cast<bool>(engine.get_random_uint8() & 1);
    bool b = static_cast<bool>(engine.get_random_uint8() & 1);
    bool c = a || b;

    Bool x = Bool(std::string("x"), &slv);
    Bool y = Bool(std::string("y"), &slv);
    Bool z = x | y;

    (x == Bool(a, &slv)).assert_term();
    (y == Bool(b, &slv)).assert_term();
    ASSERT_TRUE(slv.check());

    bb::fr zvals = string_to_fr(slv[z], /*base=*/10);
    ASSERT_EQ(bb::fr(c), zvals);
}

TEST(SymbolicBool, not )
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");
    bool a = static_cast<bool>(engine.get_random_uint8() & 1);
    bool b = !a;

    Bool x = Bool(std::string("x"), &slv);
    Bool y = !x;

    (y == Bool(b, &slv)).assert_term();
    ASSERT_TRUE(slv.check());

    bb::fr xvals = string_to_fr(slv[x], /*base=*/10);
    ASSERT_EQ(bb::fr(a), xvals);
}

TEST(SymbolicBool, IfElse)
{
    Solver slv("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    STerm x = FFVar("x", &slv);
    STerm y = FFVar("y", &slv);

    Bool if_ = Bool(x) == Bool(FFConst(1, &slv));
    if_ &= Bool(y) == Bool(FFConst(7, &slv));

    Bool else_ = Bool(x) != Bool(FFConst(1, &slv));
    else_ &= Bool(y) == Bool(FFConst(8, &slv));

    (if_ | else_).assert_term();

    ASSERT_TRUE(slv.check());

    bb::fr xval = string_to_fr(slv[x], /*base=*/10);
    bb::fr yval = string_to_fr(slv[y], /*base=*/10);

    ASSERT_TRUE((xval == 1 && yval == 7) || (xval != 1 && yval == 8));
}