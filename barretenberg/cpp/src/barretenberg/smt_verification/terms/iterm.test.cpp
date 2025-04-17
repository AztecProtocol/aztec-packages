#include <unordered_map>

#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "term.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_randomness();
}

using namespace bb;
using namespace smt_terms;

TEST(ITerm, addition)
{
    uint64_t a = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t b = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t c = a + b;

    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config);

    STerm x = IVar("x", &s);
    STerm y = IVar("y", &s);
    STerm z = x + y;

    z == c;
    x == a;
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/10);
    ASSERT_EQ(bb::fr(b), yvals);
}

TEST(ITerm, subtraction)
{
    uint64_t c = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t b = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t a = c + b;

    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config);

    STerm x = IVar("x", &s);
    STerm y = IVar("y", &s);
    STerm z = x - y;

    x == a;
    z == c;
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/10);
    ASSERT_EQ(bb::fr(b), yvals);
}

TEST(ITerm, multiplication)
{
    uint64_t a = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t b = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t c = a * b;

    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config);

    STerm x = IVar("x", &s);
    STerm y = IVar("y", &s);
    STerm z = x * y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[z], /*base=*/10);
    ASSERT_EQ(bb::fr(c), yvals);
}

TEST(ITerm, div)
{
    uint64_t a = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31);
    uint64_t b = engine.get_random_uint32() % (static_cast<uint32_t>(1) << 31) + 1;
    uint64_t c = a / b;

    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001", default_solver_config);

    STerm x = IVar("x", &s);
    STerm y = IVar("y", &s);
    STerm z = x / y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[z], /*base=*/10);
    ASSERT_EQ(bb::fr(c), yvals);
}

// This test aims to check for the absence of unintended
// behavior. If an unsupported operator is called, an info message appears in stderr
// and the value is supposed to remain unchanged.
TEST(ITerm, unsupported_operations)
{
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001");

    STerm x = IVar("x", &s);
    STerm y = IVar("y", &s);

    STerm z = x ^ y;
    ASSERT_EQ(z.term, x.term);
    z = x & y;
    ASSERT_EQ(z.term, x.term);
    z = x | y;
    ASSERT_EQ(z.term, x.term);
    z = x >> 10;
    ASSERT_EQ(z.term, x.term);
    z = x << 10;
    ASSERT_EQ(z.term, x.term);
    z = x.rotr(10);
    ASSERT_EQ(z.term, x.term);
    z = x.rotl(10);
    ASSERT_EQ(z.term, x.term);

    cvc5::Term before_term = x.term;
    x ^= y;
    ASSERT_EQ(x.term, before_term);
    x &= y;
    ASSERT_EQ(x.term, before_term);
    x |= y;
    ASSERT_EQ(x.term, before_term);
    x >>= 10;
    ASSERT_EQ(x.term, before_term);
    x <<= 10;
    ASSERT_EQ(x.term, before_term);
}