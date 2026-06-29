#include "barretenberg/ecc/fields/vector_field.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>
#include <type_traits>

namespace {

using bb::fr;
using Vec = bb::VectorField<bb::Bn254FrParams>;

// Build an array of 5 random field elements for a test case.
std::array<fr, 5> random_five()
{
    std::array<fr, 5> out;
    for (size_t i = 0; i < 5; ++i) {
        out[i] = fr::random_element();
    }
    return out;
}

// Compare two 5-element field arrays modulo p (ignoring non-canonical limb
// representations). Uses fr::operator== which does reduce_once internally.
bool field_array_eq(const std::array<fr, 5>& a, const std::array<fr, 5>& b)
{
    for (size_t i = 0; i < 5; ++i) {
        if (a[i] != b[i]) {
            return false;
        }
    }
    return true;
}

TEST(VectorFieldTest, RoundtripConstructionPreservesValues)
{
    auto input = random_five();
    Vec v(input);
    auto out = v.to_array();
    EXPECT_TRUE(field_array_eq(input, out));
}

TEST(VectorFieldTest, AdditionMatchesScalarFieldAdd)
{
    for (int trial = 0; trial < 32; ++trial) {
        auto a = random_five();
        auto b = random_five();
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[i] + b[i];
        }
        Vec va(a), vb(b);
        auto got = (va + vb).to_array();
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, SubtractionMatchesScalarFieldSub)
{
    for (int trial = 0; trial < 32; ++trial) {
        auto a = random_five();
        auto b = random_five();
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[i] - b[i];
        }
        Vec va(a), vb(b);
        auto got = (va - vb).to_array();
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, MultiplicationMatchesScalarFieldMul)
{
    // 150 random trials — matches the correctness-harness requirement for the
    // q1s1 kernel. See https://gist.github.com/AztecBot/b8e2e1d5c85d54e10fb34b48461361e0
    for (int trial = 0; trial < 150; ++trial) {
        auto a = random_five();
        auto b = random_five();
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[i] * b[i];
        }
        Vec va(a), vb(b);
        auto got = (va * vb).to_array();
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, EqualityDetectsMatchesAndMismatches)
{
    auto a = random_five();
    Vec va(a);

    // Same values — all 5 bits set.
    Vec vb(a);
    EXPECT_EQ(va.eq(vb), 0b11111u);

    // Flip lane 0: bit 0 clears.
    auto a2 = a;
    a2[0] = a2[0] + fr(1);
    Vec vc(a2);
    EXPECT_EQ(va.eq(vc), 0b11110u);

    // Flip lane 3: bit 3 clears.
    auto a3 = a;
    a3[3] = a3[3] + fr(1);
    Vec vd(a3);
    EXPECT_EQ(va.eq(vd), 0b10111u);
}

TEST(VectorFieldTest, EqualityAcceptsAliasedCoarseRepresentations)
{
    // a and a+p are the same element mod p. VectorField's coarse-form eq
    // (d==0 ∨ d==p) must recognise both as equal.
    auto a = random_five();
    std::array<fr, 5> a_plus_p;
    constexpr fr p_as_field{ bb::Bn254FrParams::modulus_0,
                             bb::Bn254FrParams::modulus_1,
                             bb::Bn254FrParams::modulus_2,
                             bb::Bn254FrParams::modulus_3 };
    for (size_t i = 0; i < 5; ++i) {
        // We only have the low-level add that goes through the coarse-form
        // path; using it here exercises the round-trip.
        a_plus_p[i] = a[i] + p_as_field;
    }

    Vec va(a);
    Vec vb(a_plus_p);
    EXPECT_EQ(va.eq(vb), 0b11111u);
}

TEST(VectorFieldTest, IsZeroDetectsZeroAndP)
{
    std::array<fr, 5> vals;
    vals[0] = fr::zero();
    vals[1] = fr::one();
    vals[2] = fr::zero();
    vals[3] = fr::random_element() + fr(1); // non-zero (almost certainly)
    vals[4] = fr::zero();

    Vec v(vals);
    uint32_t iz = v.is_zero();
    // Lanes 0, 2, 4 should be zero; lanes 1, 3 non-zero.
    EXPECT_EQ(iz & 1u, 1u);
    EXPECT_EQ(iz & 2u, 0u);
    EXPECT_EQ(iz & 4u, 4u);
    EXPECT_EQ(iz & 8u, 0u);
    EXPECT_EQ(iz & 16u, 16u);
}

TEST(VectorFieldTest, IsZeroAcceptsAliasedZero)
{
    // field p ≡ 0 mod p: should also be reported as zero.
    constexpr fr p_as_field{ bb::Bn254FrParams::modulus_0,
                             bb::Bn254FrParams::modulus_1,
                             bb::Bn254FrParams::modulus_2,
                             bb::Bn254FrParams::modulus_3 };
    std::array<fr, 5> vals{ fr::zero(), p_as_field, fr::zero(), p_as_field, fr::one() };
    Vec v(vals);
    uint32_t iz = v.is_zero();
    EXPECT_EQ(iz, 0b01111u);
}

TEST(VectorFieldTest, AddAssociativity)
{
    auto a = random_five();
    auto b = random_five();
    auto c = random_five();
    Vec va(a), vb(b), vc(c);

    auto ab_c = ((va + vb) + vc).to_array();
    auto a_bc = (va + (vb + vc)).to_array();
    EXPECT_TRUE(field_array_eq(ab_c, a_bc));
}

TEST(VectorFieldTest, SubToZeroIsZero)
{
    auto a = random_five();
    Vec va(a);
    auto diff = (va - va).to_array();
    for (const auto& d : diff) {
        EXPECT_TRUE(d.is_zero());
    }
}

TEST(VectorFieldTest, MulByOneIsIdentity)
{
    auto a = random_five();
    std::array<fr, 5> ones{ fr::one(), fr::one(), fr::one(), fr::one(), fr::one() };
    Vec va(a), v1(ones);
    auto got = (va * v1).to_array();
    EXPECT_TRUE(field_array_eq(a, got));
}

TEST(VectorFieldTest, DistributivityMulOverAdd)
{
    auto a = random_five();
    auto b = random_five();
    auto c = random_five();
    Vec va(a), vb(b), vc(c);

    auto lhs = (va * (vb + vc)).to_array(); // a * (b + c)
    auto rhs_l = (va * vb).to_array();      // a * b
    auto rhs_r = (va * vc).to_array();      // a * c
    Vec vrl(rhs_l), vrr(rhs_r);
    auto rhs = (vrl + vrr).to_array(); // a*b + a*c

    EXPECT_TRUE(field_array_eq(lhs, rhs));
}

TEST(VectorFieldTest, MultiplicationCommutative)
{
    for (int trial = 0; trial < 32; ++trial) {
        auto a = random_five();
        auto b = random_five();
        Vec va(a), vb(b);
        auto ab = (va * vb).to_array();
        auto ba = (vb * va).to_array();
        EXPECT_TRUE(field_array_eq(ab, ba)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, MultiplicationAssociative)
{
    // (a * b) * c == a * (b * c). Guards against carry-chain asymmetry: the
    // q1s1 kernel's left-vs-right operand paths cross the reduction at
    // different points, so any reduction-induced skew would surface here.
    for (int trial = 0; trial < 32; ++trial) {
        auto a = random_five();
        auto b = random_five();
        auto c = random_five();
        Vec va(a), vb(b), vc(c);

        Vec ab_vec(std::array<fr, 5>{ (va * vb).to_array() });
        auto lhs = (ab_vec * vc).to_array();

        Vec bc_vec(std::array<fr, 5>{ (vb * vc).to_array() });
        auto rhs = (va * bc_vec).to_array();

        EXPECT_TRUE(field_array_eq(lhs, rhs)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, SquaringMatchesScalarMul)
{
    // v * v parity. Exercises the kernel's same-operand path, which is the
    // primary use in batch_affine_double / batch_normalize's lambda^2 and
    // (3x)*acc steps. Distinct from operand-shuffled mul tests because both
    // inputs share the same SoA buffer.
    for (int trial = 0; trial < 64; ++trial) {
        auto a = random_five();
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[i] * a[i];
        }
        Vec va(a);
        auto got = (va * va).to_array();
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, MultiplicationEdgeValues)
{
    // Multiplications by 0, 1, p-1, and small constants. random_element()
    // almost never hits these boundary lanes, so the bulk parity test does
    // not cover them.
    const fr zero = fr::zero();
    const fr one = fr::one();
    const fr neg_one = -fr::one();
    const fr two(2);
    const fr small(7);

    auto rnd = random_five();
    std::array<fr, 5> mixed = { zero, one, neg_one, two, small };
    Vec vr(rnd), vm(mixed);

    std::array<fr, 5> expected;
    for (size_t i = 0; i < 5; ++i) {
        expected[i] = rnd[i] * mixed[i];
    }
    auto got = (vr * vm).to_array();
    EXPECT_TRUE(field_array_eq(expected, got));

    // Zero-vector multiplied by anything is zero.
    Vec vz(std::array<fr, 5>{ zero, zero, zero, zero, zero });
    auto zr = (vz * vr).to_array();
    for (const auto& x : zr) {
        EXPECT_TRUE(x.is_zero());
    }

    // (p-1) * (p-1) == 1 — exercises near-modulus reduction in every lane.
    Vec vn(std::array<fr, 5>{ neg_one, neg_one, neg_one, neg_one, neg_one });
    auto nn = (vn * vn).to_array();
    for (const auto& x : nn) {
        EXPECT_EQ(x, one);
    }
}

TEST(VectorFieldTest, GatherScatterRoundTrip)
{
    std::array<fr, 16> src;
    for (size_t i = 0; i < 16; ++i) {
        src[i] = fr::random_element();
    }
    std::array<size_t, 5> idx{ 3, 0, 7, 15, 9 };

    Vec v = Vec::gather(src.data(), idx);

    std::array<fr, 16> dst;
    for (size_t i = 0; i < 16; ++i) {
        dst[i] = fr::zero();
    }
    v.scatter(dst.data(), idx);

    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(dst[idx[L]], src[idx[L]]) << "lane " << L;
    }
}

TEST(VectorFieldTest, LinearMemoryCtorAndStoreToRoundTrip)
{
    // VectorField(const Field*) + store_to over 5 contiguous Fr should be
    // the identity: it's the AoS↔interleaved transpose, applied both ways.
    // The SIMD-fast pack uses different shuffles than the scalar pack used
    // by gather/scatter, so this test catches any bit-level errors in the
    // shuffle-based path.
    std::array<fr, 5> src;
    for (size_t i = 0; i < 5; ++i) {
        src[i] = fr::random_element();
    }
    Vec v(src.data());
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(v.get(L), src[L]) << "lane " << L;
    }
    std::array<fr, 5> dst;
    for (size_t i = 0; i < 5; ++i) {
        dst[i] = fr::zero();
    }
    v.store_to(dst.data());
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(dst[L], src[L]) << "lane " << L;
    }
}

TEST(VectorFieldTest, LinearMemoryCtorMatchesGatherForLinearIndices)
{
    // For consecutive indices, the linear-memory ctor and gather should
    // produce bit-identical VectorFields. (gather goes through
    // store_from_array's scalar pack; the linear-memory ctor goes through
    // the SIMD-shuffle pack.)
    std::array<fr, 5> src;
    for (size_t i = 0; i < 5; ++i) {
        src[i] = fr::random_element();
    }
    Vec a = Vec::gather(src.data(), std::array<size_t, 5>{ 0, 1, 2, 3, 4 });
    Vec b(src.data());
    auto aa = a.to_array();
    auto bb = b.to_array();
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(aa[L], bb[L]) << "lane " << L;
    }
}

TEST(VectorFieldTest, GatherLanesMatchArray)
{
    std::array<fr, 16> src;
    for (size_t i = 0; i < 16; ++i) {
        src[i] = fr::random_element();
    }
    std::array<size_t, 5> idx{ 2, 5, 1, 8, 0 };

    Vec v = Vec::gather(src.data(), idx);
    for (size_t L = 0; L < 5; ++L) {
        EXPECT_EQ(v.get(L), src[idx[L]]) << "lane " << L;
    }
}

TEST(VectorFieldTest, MixedAddBroadcast)
{
    auto a = random_five();
    fr s = fr::random_element();
    Vec va(a);
    Vec bcast(std::array<fr, 5>{ s, s, s, s, s });

    {
        auto lhs = (va + s).to_array();
        auto rhs = (va + bcast).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
    {
        auto lhs = (s + va).to_array();
        auto rhs = (bcast + va).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
    {
        auto lhs = (va - s).to_array();
        auto rhs = (va - bcast).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
    {
        auto lhs = (s - va).to_array();
        auto rhs = (bcast - va).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
    {
        auto lhs = (va * s).to_array();
        auto rhs = (va * bcast).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
    {
        auto lhs = (s * va).to_array();
        auto rhs = (bcast * va).to_array();
        EXPECT_TRUE(field_array_eq(lhs, rhs));
    }
}

TEST(VectorFieldTest, ScalarTypeAlias)
{
    static_assert(std::is_same_v<typename Vec::scalar_type, bb::fr>);
    SUCCEED();
}

TEST(VectorFieldTest, CoarseInputArithmeticMatchesScalar)
{
    // +/-/* must accept operands already in the lazy-reduced "coarse" form -- a
    // value in [0, 2p), not yet conditionally reduced to [0, p) -- which a prior
    // `+` leaves behind between polynomial passes. The other arithmetic tests
    // feed only canonical [0, p) inputs from random_element(), so the
    // lazy-reduction branches for coarse operands go unexercised. Here we build
    // coarse operands (a + b lands in [0, 2p)) and feed them back into +/-/*,
    // checking the result mod p against scalar fr arithmetic.
    for (int trial = 0; trial < 150; ++trial) {
        auto a = random_five();
        auto b = random_five();
        auto c = random_five();
        auto d = random_five();

        Vec coarse_l = Vec(a) + Vec(b); // lanes in [0, 2p)
        Vec coarse_r = Vec(c) + Vec(d);

        std::array<fr, 5> add_exp;
        std::array<fr, 5> sub_exp;
        std::array<fr, 5> mul_exp;
        for (size_t i = 0; i < 5; ++i) {
            fr l = a[i] + b[i];
            fr r = c[i] + d[i];
            add_exp[i] = l + r;
            sub_exp[i] = l - r;
            mul_exp[i] = l * r;
        }

        EXPECT_TRUE(field_array_eq(add_exp, (coarse_l + coarse_r).to_array())) << "add trial " << trial;
        EXPECT_TRUE(field_array_eq(sub_exp, (coarse_l - coarse_r).to_array())) << "sub trial " << trial;
        EXPECT_TRUE(field_array_eq(mul_exp, (coarse_l * coarse_r).to_array())) << "mul trial " << trial;
    }

    // Deterministic maximally-coarse operands: (p-1) + (p-1) = 2p-2, the largest
    // value the coarse form holds, in every lane.
    const fr neg_one = -fr::one();
    std::array<fr, 5> maxes{ neg_one, neg_one, neg_one, neg_one, neg_one };
    Vec max_coarse = Vec(maxes) + Vec(maxes); // 2p-2 per lane
    const fr m = neg_one + neg_one;           // (p-1)+(p-1) = p-2 mod p
    std::array<fr, 5> add_exp;
    std::array<fr, 5> sub_exp;
    std::array<fr, 5> mul_exp;
    for (size_t i = 0; i < 5; ++i) {
        add_exp[i] = m + m;
        sub_exp[i] = m - m;
        mul_exp[i] = m * m;
    }
    EXPECT_TRUE(field_array_eq(add_exp, (max_coarse + max_coarse).to_array()));
    EXPECT_TRUE(field_array_eq(sub_exp, (max_coarse - max_coarse).to_array()));
    EXPECT_TRUE(field_array_eq(mul_exp, (max_coarse * max_coarse).to_array()));
}

TEST(VectorFieldTest, CoarseStoreReloadRoundTrip)
{
    // Between polynomial passes a coarse (unreduced, [0, 2p)) VectorField is stored
    // to memory by one pass and reloaded by the next. The earlier round-trip tests
    // stored only canonical values from random_element(); here we store a coarse
    // value (a + b, left unreduced) and check that both the store_to/linear-memory
    // ctor path (SIMD shuffle) and the scatter/gather path (scalar random access)
    // reproduce it mod p.
    for (int trial = 0; trial < 64; ++trial) {
        auto a = random_five();
        auto b = random_five();
        Vec coarse = Vec(a) + Vec(b); // lanes in [0, 2p)
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[i] + b[i];
        }

        // store_to -> linear-memory ctor reload (SIMD-shuffle transpose).
        {
            std::array<fr, 5> buf;
            coarse.store_to(buf.data());
            Vec reloaded(buf.data());
            EXPECT_TRUE(field_array_eq(expected, reloaded.to_array())) << "store_to/ctor trial " << trial;
        }
        // scatter -> gather reload (scalar random-access path).
        {
            std::array<fr, 5> buf{ fr::zero(), fr::zero(), fr::zero(), fr::zero(), fr::zero() };
            std::array<size_t, 5> idx{ 0, 1, 2, 3, 4 };
            coarse.scatter(buf.data(), idx);
            Vec reloaded = Vec::gather(buf.data(), idx);
            EXPECT_TRUE(field_array_eq(expected, reloaded.to_array())) << "scatter/gather trial " << trial;
        }
    }

    // Deterministic maximally-coarse value: (p-1) + (p-1) = 2p-2 in every lane.
    const fr neg_one = -fr::one();
    std::array<fr, 5> maxes{ neg_one, neg_one, neg_one, neg_one, neg_one };
    Vec max_coarse = Vec(maxes) + Vec(maxes);
    const fr m = neg_one + neg_one;
    std::array<fr, 5> expected{ m, m, m, m, m };
    std::array<fr, 5> buf;
    max_coarse.store_to(buf.data());
    Vec reloaded(buf.data());
    EXPECT_TRUE(field_array_eq(expected, reloaded.to_array()));
}

} // namespace
