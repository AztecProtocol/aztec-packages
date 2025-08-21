#include <cstdint>
#include <unordered_map>

#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/logic/logic.hpp"
#include "term.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_randomness();
}

using namespace bb;
using Builder = UltraCircuitBuilder;
using witness_ct = stdlib::witness_t<Builder>;

using namespace smt_terms;

TEST(BVTerm, addition)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a + b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x + y;

    z == c;
    x == a;
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), yvals);
}

TEST(BVTerm, subtraction)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a - b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x - y;

    z == c;
    x == a;
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), yvals);
}

TEST(BVTerm, xor)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a ^ b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x ^ y;

    z == c;
    x == a;
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), yvals);
}

TEST(BVTerm, rotr)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = (a >> 10) | (a << 22);

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.rotr(10);

    y == b;
    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[x], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(a), xvals);
}

TEST(BVTerm, rotl)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = (a << 10) | (a >> 22);

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.rotl(10);

    y == b;
    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[x], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(a), xvals);
}

// non bijective operators
TEST(BVTerm, mul)
{
    Builder builder;
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a * b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x * y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(c), xvals);
}

TEST(BVTerm, and)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a & b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x & y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(c), xvals);
}

TEST(BVTerm, or)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a | b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x | y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(c), xvals);
}

TEST(BVTerm, div)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = engine.get_random_uint32();
    uint32_t c = a / b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x / y;

    x == a;
    y == b;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(c), xvals);
}

TEST(BVTerm, shr)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = a >> 5;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x >> 5;

    x == a;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), xvals);
}

TEST(BVTerm, shl)
{
    uint32_t a = engine.get_random_uint32();
    uint32_t b = a << 5;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x << 5;

    x == a;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), xvals);
}

TEST(BVTerm, truncate)
{
    uint32_t a = engine.get_random_uint32();
    unsigned int mask = (1 << 10) - 1;
    uint32_t b = a & mask;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.truncate(9);

    x == a;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), xvals);
}

TEST(BVTerm, extract_bit)
{
    uint32_t a = engine.get_random_uint32();
    unsigned int mask = (1 << 10);
    uint32_t b = a & mask;
    b >>= 10;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.extract_bit(10);

    x == a;

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(bb::fr(b), xvals);
}