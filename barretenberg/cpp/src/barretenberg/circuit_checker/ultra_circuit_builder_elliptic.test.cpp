#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace bb {

TEST(UltraCircuitBuilder, TestEllipticGate)
{
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    UltraCircuitBuilder builder;

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x2 = builder.add_variable(p2.x);
    uint32_t y2 = builder.add_variable(p2.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, 1 });

    EXPECT_TRUE(CircuitChecker::check(builder));

    builder.create_ecc_add_gate({ x1 + 1, y1, x2, y2, x3, y3, 1 });

    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, TestEllipticGateFailure)
{
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    UltraCircuitBuilder builder;

    // Create two valid points on the curve
    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);

    // Compute the correct sum
    affine_element p3_correct(element(p1) + element(p2));

    // Create a point not on the curve by modifying p2's x-coordinate
    bb::fr invalid_x = p2.x + bb::fr(1);

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x2_invalid = builder.add_variable(invalid_x); // Invalid x coordinate
    uint32_t y2 = builder.add_variable(p2.y);
    uint32_t x3 = builder.add_variable(p3_correct.x);
    uint32_t y3 = builder.add_variable(p3_correct.y);

    // Construct addition gate with a point not on the curve
    builder.create_ecc_add_gate({ x1, y1, x2_invalid, y2, x3, y3, 1 });

    // CircuitChecker should fail in the elliptic relation
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, TestEllipticDoubleGate)
{
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    UltraCircuitBuilder builder;

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = builder.add_variable(p1.x);
    uint32_t y1 = builder.add_variable(p1.y);
    uint32_t x3 = builder.add_variable(p3.x);
    uint32_t y3 = builder.add_variable(p3.y);

    builder.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb
