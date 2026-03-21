/**
 * @brief Tests for bn254_cycle_group: BN254 point operations in a Grumpkin circuit
 * @details We verify correctness by checking that circuit witness values match native computations.
 * Full circuit satisfiability is verified end-to-end in the ChonkG integration tests (Step 1.4).
 */
#include "barretenberg/stdlib/primitives/group/bn254_cycle_group.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>
using namespace bb;
using namespace bb::stdlib;

class BN254CycleGroupTests : public ::testing::Test {
  protected:
    using Builder = GrumpkinUltraCircuitBuilder;
    using FF = Builder::FF; // grumpkin::fr = bn254::fq
    using CycleGroup = bn254_cycle_group<Builder>;
    using AffineElement = CycleGroup::AffineElement;
    using Element = CycleGroup::Element;
    using ScalarField = CycleGroup::ScalarField; // bn254::fr
};

TEST_F(BN254CycleGroupTests, ValidateOnCurve)
{
    Builder builder;
    auto p = AffineElement(Element::random_element());
    auto circuit_p = CycleGroup::from_witness(&builder, p);
    // validate_on_curve is called within from_witness
    EXPECT_EQ(circuit_p.get_value(), p);
}

TEST_F(BN254CycleGroupTests, UnconditionalAdd)
{
    Builder builder;
    auto p1_native = AffineElement(Element::random_element());
    auto p2_native = AffineElement(Element::random_element());
    auto expected = AffineElement(Element(p1_native) + Element(p2_native));

    auto p1 = CycleGroup::from_witness(&builder, p1_native);
    auto p2 = CycleGroup::from_witness(&builder, p2_native);
    auto p3 = p1.unconditional_add(p2);

    EXPECT_EQ(p3.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, UnconditionalSubtract)
{
    Builder builder;
    auto p1_native = AffineElement(Element::random_element());
    auto p2_native = AffineElement(Element::random_element());
    auto expected = AffineElement(Element(p1_native) - Element(p2_native));

    auto p1 = CycleGroup::from_witness(&builder, p1_native);
    auto p2 = CycleGroup::from_witness(&builder, p2_native);
    auto p3 = p1.unconditional_subtract(p2);

    EXPECT_EQ(p3.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, Dbl)
{
    Builder builder;
    auto p1_native = AffineElement(Element::random_element());
    auto expected = AffineElement(Element(p1_native).dbl());

    auto p1 = CycleGroup::from_witness(&builder, p1_native);
    auto p3 = p1.dbl();

    EXPECT_EQ(p3.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, Negate)
{
    Builder builder;
    auto p1_native = AffineElement(Element::random_element());
    auto expected = AffineElement(-Element(p1_native));

    auto p1 = CycleGroup::from_witness(&builder, p1_native);
    auto p3 = -p1;

    EXPECT_EQ(p3.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, ScalarMul)
{
    Builder builder;
    auto p_native = AffineElement(Element::random_element());
    auto scalar = ScalarField::random_element();
    auto expected = AffineElement(Element(p_native) * scalar);

    auto p = CycleGroup::from_witness(&builder, p_native);
    auto result = p.scalar_mul(scalar);

    EXPECT_EQ(result.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, ScalarMulSmallScalar)
{
    Builder builder;
    auto p_native = AffineElement(Element::random_element());
    ScalarField scalar(7);
    auto expected = AffineElement(Element(p_native) * scalar);

    auto p = CycleGroup::from_witness(&builder, p_native);
    auto result = p.scalar_mul(scalar);

    EXPECT_EQ(result.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, ScalarMulOne)
{
    Builder builder;
    auto p_native = AffineElement(Element::random_element());
    ScalarField scalar(1);

    auto p = CycleGroup::from_witness(&builder, p_native);
    auto result = p.scalar_mul(scalar);

    EXPECT_EQ(result.get_value(), p_native);
}

TEST_F(BN254CycleGroupTests, BatchMul)
{
    Builder builder;
    constexpr size_t num_points = 3;
    std::vector<AffineElement> points_native;
    std::vector<ScalarField> scalars_native;
    std::vector<CycleGroup> points;

    Element expected_native = Element(AffineElement::infinity());
    for (size_t i = 0; i < num_points; i++) {
        auto p = AffineElement(Element::random_element());
        auto s = ScalarField::random_element();
        points_native.push_back(p);
        scalars_native.push_back(s);
        points.push_back(CycleGroup::from_witness(&builder, p));
        expected_native += Element(p) * s;
    }

    auto result = CycleGroup::batch_mul(points, scalars_native);
    auto expected = AffineElement(expected_native);

    EXPECT_EQ(result.get_value(), expected);
}

TEST_F(BN254CycleGroupTests, AddChain)
{
    Builder builder;
    auto p1 = AffineElement(Element::random_element());
    auto p2 = AffineElement(Element::random_element());
    auto p3 = AffineElement(Element::random_element());
    auto expected = AffineElement(Element(p1) + Element(p2) + Element(p3));

    auto cp1 = CycleGroup::from_witness(&builder, p1);
    auto cp2 = CycleGroup::from_witness(&builder, p2);
    auto cp3 = CycleGroup::from_witness(&builder, p3);
    auto result = cp1.unconditional_add(cp2).unconditional_add(cp3);

    EXPECT_EQ(result.get_value(), expected);
}
