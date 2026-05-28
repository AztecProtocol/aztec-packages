#include "barretenberg/polynomials/accumulator.hpp"

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>

namespace {

using Fr = bb::fr;
using Acc = bb::Accumulator<Fr>;
using Vec = bb::VectorField<bb::Bn254FrParams>;

TEST(AccumulatorTest, DefaultConstructorReducesToZero)
{
    Acc acc;
    EXPECT_TRUE(acc.reduce().is_zero());
}

TEST(AccumulatorTest, ScalarOnlyAddsMatchSerialSum)
{
    Acc acc;
    std::array<Fr, 7> xs;
    for (auto& x : xs) {
        x = Fr::random_element();
    }
    Fr expected = Fr::zero();
    for (const auto& x : xs) {
        acc += x;
        expected = expected + x;
    }
    EXPECT_EQ(acc.reduce(), expected);
}

TEST(AccumulatorTest, VectorOnlyAddsMatchSerialSum)
{
    Acc acc;
    // Three width-5 lane contributions; total = 15 random Fr's summed.
    std::array<Fr, 15> xs;
    for (auto& x : xs) {
        x = Fr::random_element();
    }
    for (size_t group = 0; group < 3; ++group) {
        std::array<Fr, 5> lanes{
            xs[5 * group + 0], xs[5 * group + 1], xs[5 * group + 2], xs[5 * group + 3], xs[5 * group + 4]
        };
        acc += Vec(lanes);
    }
    Fr expected = Fr::zero();
    for (const auto& x : xs) {
        expected = expected + x;
    }
    EXPECT_EQ(acc.reduce(), expected);
}

TEST(AccumulatorTest, MixedScalarAndVectorAdds)
{
    // Two width-5 lane blocks + a 3-element scalar tail — the canonical
    // bulk + tail shape produced by vectorized_for inside a kernel.
    Acc acc;
    std::array<Fr, 13> xs;
    for (auto& x : xs) {
        x = Fr::random_element();
    }
    acc += Vec(std::array<Fr, 5>{ xs[0], xs[1], xs[2], xs[3], xs[4] });
    acc += Vec(std::array<Fr, 5>{ xs[5], xs[6], xs[7], xs[8], xs[9] });
    acc += xs[10];
    acc += xs[11];
    acc += xs[12];

    Fr expected = Fr::zero();
    for (const auto& x : xs) {
        expected = expected + x;
    }
    EXPECT_EQ(acc.reduce(), expected);
}

TEST(AccumulatorTest, ReduceOrderInvariantOverLanePermutation)
{
    // Field addition is associative + commutative, so reduce()'s tree-shape
    // is order-invariant. Verifies the implementation doesn't accidentally
    // depend on a specific summation order.
    std::array<Fr, 5> lanes_a = { Fr(11), Fr(22), Fr(33), Fr(44), Fr(55) };
    std::array<Fr, 5> lanes_b = { Fr(55), Fr(44), Fr(33), Fr(22), Fr(11) };
    Acc a;
    a += Vec(lanes_a);
    Acc b;
    b += Vec(lanes_b);
    EXPECT_EQ(a.reduce(), b.reduce());
}

} // namespace
