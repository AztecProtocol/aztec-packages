#include <cstdint>
#include <unordered_map>

#include "barretenberg/smt_verification/util/smt_util.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "term.hpp"

#include <gtest/gtest.h>

namespace {
auto& engine = bb::numeric::get_randomness();
}

using namespace bb;
using witness_ct = stdlib::witness_t<StandardCircuitBuilder>;
using uint_ct = stdlib::uint32<StandardCircuitBuilder>;

using namespace smt_terms;

TEST(BVTerm, addition)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a + b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x + y;

    z == c.get_value();
    x == a.get_value();
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), yvals);
}

TEST(BVTerm, subtraction)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a - b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x - y;

    z == c.get_value();
    x == a.get_value();
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), yvals);
}

TEST(BVTerm, xor)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a ^ b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x ^ y;

    z == c.get_value();
    x == a.get_value();
    ASSERT_TRUE(s.check());

    bb::fr yvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), yvals);
}

TEST(BVTerm, rotr)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = a.ror(10);

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.rotr(10);

    y == b.get_value();
    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[x], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(a.get_value(), xvals);
}

TEST(BVTerm, rotl)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = a.rol(10);

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.rotl(10);

    y == b.get_value();
    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[x], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(a.get_value(), xvals);
}

// non bijective operators
TEST(BVTerm, mul)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a * b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x * y;

    x == a.get_value();
    y == b.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(c.get_value(), xvals);
}

TEST(BVTerm, and)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a & b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x & y;

    x == a.get_value();
    y == b.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(c.get_value(), xvals);
}

TEST(BVTerm, or)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a | b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x | y;

    x == a.get_value();
    y == b.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(c.get_value(), xvals);
}

TEST(BVTerm, div)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = witness_ct(&builder, engine.get_random_uint32());
    uint_ct c = a / b;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = BVVar("y", &s);
    STerm z = x / y;

    x == a.get_value();
    y == b.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[z], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(c.get_value(), xvals);
}

TEST(BVTerm, shr)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = a >> 5;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x >> 5;

    x == a.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), xvals);
}

TEST(BVTerm, shl)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    uint_ct b = a << 5;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x << 5;

    x == a.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), xvals);
}

TEST(BVTerm, truncate)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    unsigned int mask = (1 << 10) - 1;
    uint_ct b = a & mask;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.truncate(9);

    x == a.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), xvals);
}

TEST(BVTerm, extract_bit)
{
    StandardCircuitBuilder builder;
    uint_ct a = witness_ct(&builder, engine.get_random_uint32());
    unsigned int mask = (1 << 10);
    uint_ct b = a & mask;
    b >>= 10;

    uint32_t modulus_base = 16;
    uint32_t bitvector_size = 32;
    Solver s("30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001",
             default_solver_config,
             modulus_base,
             bitvector_size);

    STerm x = BVVar("x", &s);
    STerm y = x.extract_bit(10);

    x == a.get_value();

    ASSERT_TRUE(s.check());

    bb::fr xvals = string_to_fr(s[y], /*base=*/2, /*is_signed=*/false);
    ASSERT_EQ(b.get_value(), xvals);
}