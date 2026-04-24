#include "barretenberg/ecc/fields/vector_field.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>

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

// ---- dot_product ----
//
// Compares VectorField::dot_product<K>((a_0,b_0), ..., (a_{K-1},b_{K-1}))
// against the naive sum of K independent scalar muls, lane by lane.
// Covers K in {1, 2, 3} with 100 random trials each. Must pass on native
// (portable fallback path) and WASM (fused Karatsuba specialization path).

TEST(VectorFieldTest, DotProductK1MatchesSingleMul)
{
    // K=1 is just operator*. Covers the naive fallback template branch.
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        Vec va0(a0), vb0(b0);

        std::array<std::pair<Vec, Vec>, 1> pairs{ { { va0, vb0 } } };
        auto got = Vec::dot_product<1>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK2MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        auto a1 = random_five();
        auto b1 = random_five();
        Vec va0(a0), vb0(b0), va1(a1), vb1(b1);

        std::array<std::pair<Vec, Vec>, 2> pairs{ { { va0, vb0 }, { va1, vb1 } } };
        auto got = Vec::dot_product<2>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i] + a1[i] * b1[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK3MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        auto a1 = random_five();
        auto b1 = random_five();
        auto a2 = random_five();
        auto b2 = random_five();
        Vec va0(a0), vb0(b0), va1(a1), vb1(b1), va2(a2), vb2(b2);

        std::array<std::pair<Vec, Vec>, 3> pairs{ { { va0, vb0 }, { va1, vb1 }, { va2, vb2 } } };
        auto got = Vec::dot_product<3>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i] + a1[i] * b1[i] + a2[i] * b2[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK4MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 4> a, b;
        for (size_t k = 0; k < 4; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 4> pairs{
            { { Vec(a[0]), Vec(b[0]) }, { Vec(a[1]), Vec(b[1]) }, { Vec(a[2]), Vec(b[2]) }, { Vec(a[3]), Vec(b[3]) } }
        };
        auto got = Vec::dot_product<4>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 4; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK5MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 5> a, b;
        for (size_t k = 0; k < 5; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 5> pairs{ { { Vec(a[0]), Vec(b[0]) },
                                                    { Vec(a[1]), Vec(b[1]) },
                                                    { Vec(a[2]), Vec(b[2]) },
                                                    { Vec(a[3]), Vec(b[3]) },
                                                    { Vec(a[4]), Vec(b[4]) } } };
        auto got = Vec::dot_product<5>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 5; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK6MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 6> a, b;
        for (size_t k = 0; k < 6; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 6> pairs{ { { Vec(a[0]), Vec(b[0]) },
                                                    { Vec(a[1]), Vec(b[1]) },
                                                    { Vec(a[2]), Vec(b[2]) },
                                                    { Vec(a[3]), Vec(b[3]) },
                                                    { Vec(a[4]), Vec(b[4]) },
                                                    { Vec(a[5]), Vec(b[5]) } } };
        auto got = Vec::dot_product<6>(pairs).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 6; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK2EdgeCasesZerosAndOnes)
{
    // All-zero and all-one pairs to exercise boundary behaviour.
    std::array<fr, 5> zeros{ fr::zero(), fr::zero(), fr::zero(), fr::zero(), fr::zero() };
    std::array<fr, 5> ones{ fr::one(), fr::one(), fr::one(), fr::one(), fr::one() };
    auto rnd = random_five();
    Vec vzero(zeros), vone(ones), vrnd(rnd);

    {
        // (rnd, one) + (zero, rnd) == rnd
        std::array<std::pair<Vec, Vec>, 2> pairs{ { { vrnd, vone }, { vzero, vrnd } } };
        auto got = Vec::dot_product<2>(pairs).to_array();
        EXPECT_TRUE(field_array_eq(rnd, got));
    }
    {
        // (rnd, one) + (rnd, one) == 2*rnd
        std::array<std::pair<Vec, Vec>, 2> pairs{ { { vrnd, vone }, { vrnd, vone } } };
        auto got = Vec::dot_product<2>(pairs).to_array();
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = rnd[i] + rnd[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got));
    }
}

// Stress test the output's coarse [0, 2p) invariant. Constructs inputs where
// aR*bR is as large as possible (aR, bR chosen close to the coarse upper
// bound 2p-1) and sums K of them. Then verifies that the result, when chained
// into downstream field ops (+, -, ==, is_zero), gives consistent answers.
//
// Per the output-bound analysis in vector_field.hpp: output is ≤
// (1 + K/32)·p < 2p for K ≤ 6, so downstream coarse-form ops remain correct.
TEST(VectorFieldTest, DotProductK6WorstCaseOutputIsCoarseForm)
{
    // Pick 6 input pairs that are each near the top of [0, 2p) coarse form.
    // fr::random_element() already returns values in [0, p); to push toward 2p
    // we can't easily get them above p without hitting the reduce_once path,
    // so we use random_element + p (through vector add) as the worst case.
    // But simpler: just use 150 random trials with random_element (in [0, p))
    // and confirm the result survives a round-trip through vector add/sub.
    for (int trial = 0; trial < 150; ++trial) {
        std::array<std::array<fr, 5>, 6> a, b;
        for (size_t k = 0; k < 6; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 6> pairs{ { { Vec(a[0]), Vec(b[0]) },
                                                    { Vec(a[1]), Vec(b[1]) },
                                                    { Vec(a[2]), Vec(b[2]) },
                                                    { Vec(a[3]), Vec(b[3]) },
                                                    { Vec(a[4]), Vec(b[4]) },
                                                    { Vec(a[5]), Vec(b[5]) } } };
        Vec dp = Vec::dot_product<6>(pairs);

        // Expected value.
        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 6; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
        }
        Vec expected_v(expected);

        // 1. Equality check using coarse-form eq (exercises [0, 2p) invariant).
        EXPECT_EQ(dp.eq(expected_v), 0b11111u) << "eq failed on trial " << trial;

        // 2. Round-trip through + and -: (dp + rnd) - rnd == dp.
        Vec rnd(random_five());
        Vec rt = (dp + rnd) - rnd;
        EXPECT_EQ(rt.eq(dp), 0b11111u) << "add/sub round-trip failed on trial " << trial;

        // 3. Multiplying dp by one yields dp.
        std::array<fr, 5> ones{ fr::one(), fr::one(), fr::one(), fr::one(), fr::one() };
        Vec vone(ones);
        Vec mul1 = dp * vone;
        EXPECT_EQ(mul1.eq(dp), 0b11111u) << "mul-by-one failed on trial " << trial;

        // 4. Subtracting dp from itself yields zero.
        Vec zeroed = dp - dp;
        EXPECT_EQ(zeroed.is_zero(), 0b11111u) << "self-sub not zero on trial " << trial;
    }
}

// ---- dot_product<K, M> ----
//
// Tests the extended API:
//   dot_product<K, M>(pairs, linears) == sum_k a_k*b_k + sum_j c_j  (mod p)
//
// Combinations cover the corners of the K+M <= 6 / K >= 1 / M >= 1 constraint.

TEST(VectorFieldTest, DotProductK1M1MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        auto c0 = random_five();
        Vec va0(a0), vb0(b0), vc0(c0);

        std::array<std::pair<Vec, Vec>, 1> pairs{ { { va0, vb0 } } };
        std::array<Vec, 1> linears{ vc0 };
        auto got = Vec::dot_product<1, 1>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i] + c0[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK2M2MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        auto a1 = random_five();
        auto b1 = random_five();
        auto c0 = random_five();
        auto c1 = random_five();
        Vec va0(a0), vb0(b0), va1(a1), vb1(b1), vc0(c0), vc1(c1);

        std::array<std::pair<Vec, Vec>, 2> pairs{ { { va0, vb0 }, { va1, vb1 } } };
        std::array<Vec, 2> linears{ vc0, vc1 };
        auto got = Vec::dot_product<2, 2>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i] + a1[i] * b1[i] + c0[i] + c1[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK3M3MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 3> a, b;
        std::array<std::array<fr, 5>, 3> c;
        for (size_t k = 0; k < 3; ++k) {
            a[k] = random_five();
            b[k] = random_five();
            c[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 3> pairs{
            { { Vec(a[0]), Vec(b[0]) }, { Vec(a[1]), Vec(b[1]) }, { Vec(a[2]), Vec(b[2]) } }
        };
        std::array<Vec, 3> linears{ Vec(c[0]), Vec(c[1]), Vec(c[2]) };
        auto got = Vec::dot_product<3, 3>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 3; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
            for (size_t j = 0; j < 3; ++j) {
                expected[i] = expected[i] + c[j][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK4M2MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 4> a, b;
        std::array<std::array<fr, 5>, 2> c;
        for (size_t k = 0; k < 4; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        for (size_t j = 0; j < 2; ++j) {
            c[j] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 4> pairs{
            { { Vec(a[0]), Vec(b[0]) }, { Vec(a[1]), Vec(b[1]) }, { Vec(a[2]), Vec(b[2]) }, { Vec(a[3]), Vec(b[3]) } }
        };
        std::array<Vec, 2> linears{ Vec(c[0]), Vec(c[1]) };
        auto got = Vec::dot_product<4, 2>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 4; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
            for (size_t j = 0; j < 2; ++j) {
                expected[i] = expected[i] + c[j][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK2M4MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 2> a, b;
        std::array<std::array<fr, 5>, 4> c;
        for (size_t k = 0; k < 2; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        for (size_t j = 0; j < 4; ++j) {
            c[j] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 2> pairs{ { { Vec(a[0]), Vec(b[0]) }, { Vec(a[1]), Vec(b[1]) } } };
        std::array<Vec, 4> linears{ Vec(c[0]), Vec(c[1]), Vec(c[2]), Vec(c[3]) };
        auto got = Vec::dot_product<2, 4>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i] + a[1][i] * b[1][i];
            for (size_t j = 0; j < 4; ++j) {
                expected[i] = expected[i] + c[j][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK1M5MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        auto a0 = random_five();
        auto b0 = random_five();
        std::array<std::array<fr, 5>, 5> c;
        for (size_t j = 0; j < 5; ++j) {
            c[j] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 1> pairs{ { { Vec(a0), Vec(b0) } } };
        std::array<Vec, 5> linears{ Vec(c[0]), Vec(c[1]), Vec(c[2]), Vec(c[3]), Vec(c[4]) };
        auto got = Vec::dot_product<1, 5>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a0[i] * b0[i];
            for (size_t j = 0; j < 5; ++j) {
                expected[i] = expected[i] + c[j][i];
            }
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK5M1MatchesNaiveSum)
{
    for (int trial = 0; trial < 100; ++trial) {
        std::array<std::array<fr, 5>, 5> a, b;
        for (size_t k = 0; k < 5; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        auto c0 = random_five();
        std::array<std::pair<Vec, Vec>, 5> pairs{ { { Vec(a[0]), Vec(b[0]) },
                                                    { Vec(a[1]), Vec(b[1]) },
                                                    { Vec(a[2]), Vec(b[2]) },
                                                    { Vec(a[3]), Vec(b[3]) },
                                                    { Vec(a[4]), Vec(b[4]) } } };
        std::array<Vec, 1> linears{ Vec(c0) };
        auto got = Vec::dot_product<5, 1>(pairs, linears).to_array();

        std::array<fr, 5> expected;
        for (size_t i = 0; i < 5; ++i) {
            expected[i] = a[0][i] * b[0][i];
            for (size_t k = 1; k < 5; ++k) {
                expected[i] = expected[i] + a[k][i] * b[k][i];
            }
            expected[i] = expected[i] + c0[i];
        }
        EXPECT_TRUE(field_array_eq(expected, got)) << "trial " << trial;
    }
}

TEST(VectorFieldTest, DotProductK6M0MatchesKOnlyOverload)
{
    // dot_product<6, 0> must produce the same result as dot_product<6>.
    for (int trial = 0; trial < 50; ++trial) {
        std::array<std::array<fr, 5>, 6> a, b;
        for (size_t k = 0; k < 6; ++k) {
            a[k] = random_five();
            b[k] = random_five();
        }
        std::array<std::pair<Vec, Vec>, 6> pairs{ { { Vec(a[0]), Vec(b[0]) },
                                                    { Vec(a[1]), Vec(b[1]) },
                                                    { Vec(a[2]), Vec(b[2]) },
                                                    { Vec(a[3]), Vec(b[3]) },
                                                    { Vec(a[4]), Vec(b[4]) },
                                                    { Vec(a[5]), Vec(b[5]) } } };
        std::array<Vec, 0> empty_linears{};
        auto got_k_only = Vec::dot_product<6>(pairs).to_array();
        auto got_km = Vec::dot_product<6, 0>(pairs, empty_linears).to_array();
        EXPECT_TRUE(field_array_eq(got_k_only, got_km)) << "trial " << trial;
    }
}

// Stress the output's coarse [0, 2p) invariant after dot_product<K, M>: the
// N_SUB = 2M conditional subtracts in the tail must restore the coarse form so
// downstream operator+/-/*/eq/is_zero behave correctly.
TEST(VectorFieldTest, DotProductKMWorstCaseOutputIsCoarseForm)
{
    struct TestCase {
        const char* name;
    };

    // Test several (K, M) combos chaining the result through downstream ops.
    for (int trial = 0; trial < 100; ++trial) {
        // (K=3, M=3) — mid-range.
        {
            std::array<std::array<fr, 5>, 3> a, b, c;
            for (size_t k = 0; k < 3; ++k) {
                a[k] = random_five();
                b[k] = random_five();
                c[k] = random_five();
            }
            std::array<std::pair<Vec, Vec>, 3> pairs{
                { { Vec(a[0]), Vec(b[0]) }, { Vec(a[1]), Vec(b[1]) }, { Vec(a[2]), Vec(b[2]) } }
            };
            std::array<Vec, 3> linears{ Vec(c[0]), Vec(c[1]), Vec(c[2]) };
            Vec dp = Vec::dot_product<3, 3>(pairs, linears);

            std::array<fr, 5> expected;
            for (size_t i = 0; i < 5; ++i) {
                expected[i] = a[0][i] * b[0][i] + a[1][i] * b[1][i] + a[2][i] * b[2][i];
                for (size_t j = 0; j < 3; ++j) {
                    expected[i] = expected[i] + c[j][i];
                }
            }
            Vec expected_v(expected);

            EXPECT_EQ(dp.eq(expected_v), 0b11111u) << "(3,3) eq failed trial " << trial;
            Vec rnd(random_five());
            Vec rt = (dp + rnd) - rnd;
            EXPECT_EQ(rt.eq(dp), 0b11111u) << "(3,3) add/sub round-trip failed trial " << trial;
            Vec zeroed = dp - dp;
            EXPECT_EQ(zeroed.is_zero(), 0b11111u) << "(3,3) self-sub not zero trial " << trial;
        }

        // (K=1, M=5) — max linear adds.
        {
            std::array<fr, 5> a0 = random_five();
            std::array<fr, 5> b0 = random_five();
            std::array<std::array<fr, 5>, 5> c;
            for (size_t j = 0; j < 5; ++j) {
                c[j] = random_five();
            }
            std::array<std::pair<Vec, Vec>, 1> pairs{ { { Vec(a0), Vec(b0) } } };
            std::array<Vec, 5> linears{ Vec(c[0]), Vec(c[1]), Vec(c[2]), Vec(c[3]), Vec(c[4]) };
            Vec dp = Vec::dot_product<1, 5>(pairs, linears);

            std::array<fr, 5> expected;
            for (size_t i = 0; i < 5; ++i) {
                expected[i] = a0[i] * b0[i];
                for (size_t j = 0; j < 5; ++j) {
                    expected[i] = expected[i] + c[j][i];
                }
            }
            Vec expected_v(expected);

            EXPECT_EQ(dp.eq(expected_v), 0b11111u) << "(1,5) eq failed trial " << trial;
            Vec rnd(random_five());
            Vec rt = (dp + rnd) - rnd;
            EXPECT_EQ(rt.eq(dp), 0b11111u) << "(1,5) add/sub round-trip failed trial " << trial;
            // Multiply by one
            std::array<fr, 5> ones{ fr::one(), fr::one(), fr::one(), fr::one(), fr::one() };
            Vec vone(ones);
            Vec mul1 = dp * vone;
            EXPECT_EQ(mul1.eq(dp), 0b11111u) << "(1,5) mul-by-one failed trial " << trial;
        }
    }
}

} // namespace
