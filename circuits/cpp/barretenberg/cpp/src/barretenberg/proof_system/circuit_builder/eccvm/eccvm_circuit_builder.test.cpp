#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "eccvm_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace eccvm_circuit_builder_tests {

TEST(ECCVMCircuitConstructor, BaseCase)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::g1::element b = grumpkin::get_generator(1);
    grumpkin::g1::element c = grumpkin::get_generator(2);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);
    grumpkin::fr y = grumpkin::fr::random_element(&engine);

    grumpkin::g1::element expected_1 = (a * x) + a + a + (b * y) + (b * x) + (b * x);
    grumpkin::g1::element expected_2 = (a * x) + c + (b * x);

    circuit.add_accumulate(a);
    circuit.mul_accumulate(a, x);
    circuit.mul_accumulate(b, x);
    circuit.mul_accumulate(b, y);
    circuit.add_accumulate(a);
    circuit.mul_accumulate(b, x);
    circuit.eq(expected_1);
    circuit.add_accumulate(c);
    circuit.mul_accumulate(a, x);
    circuit.mul_accumulate(b, x);
    circuit.eq(expected_2);
    circuit.mul_accumulate(a, x);
    circuit.mul_accumulate(b, x);
    circuit.mul_accumulate(c, x);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, Add)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);

    circuit.add_accumulate(a);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, Mul)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    circuit.mul_accumulate(a, x);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, ShortMul)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    uint256_t small_x = 0;
    // make sure scalar is less than 127 bits to fit in z1
    small_x.data[0] = engine.get_random_uint64();
    small_x.data[1] = engine.get_random_uint64() & 0xFFFFFFFFFFFFULL;
    grumpkin::fr x = small_x;

    circuit.mul_accumulate(a, x);
    circuit.eq(a * small_x);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EqFails)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    circuit.mul_accumulate(a, x);
    circuit.eq(a);
    bool result = circuit.check_circuit();
    EXPECT_EQ(result, false);
}

TEST(ECCVMCircuitConstructor, EmptyRow)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    circuit.empty_row();

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EmptyRowBetweenOps)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    grumpkin::g1::element expected_1 = (a * x);

    circuit.mul_accumulate(a, x);
    circuit.empty_row();
    circuit.eq(expected_1);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EndWithEq)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    grumpkin::g1::element expected_1 = (a * x);

    circuit.mul_accumulate(a, x);
    circuit.eq(expected_1);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EndWithAdd)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    grumpkin::g1::element expected_1 = (a * x);

    circuit.mul_accumulate(a, x);
    circuit.eq(expected_1);
    circuit.add_accumulate(a);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EndWithMul)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    circuit.add_accumulate(a);
    circuit.eq(a);
    circuit.mul_accumulate(a, x);

    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, EndWithNoop)
{
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;

    grumpkin::g1::element a = grumpkin::get_generator(0);
    grumpkin::fr x = grumpkin::fr::random_element(&engine);

    circuit.add_accumulate(a);
    circuit.eq(a);
    circuit.mul_accumulate(a, x);
    circuit.empty_row();
    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(ECCVMCircuitConstructor, MSM)
{
    const auto try_msms = [&](const size_t num_msms, auto& circuit) {
        std::vector<grumpkin::g1::element> points;
        std::vector<grumpkin::fr> scalars;
        grumpkin::g1::element expected = grumpkin::g1::point_at_infinity;
        for (size_t i = 0; i < num_msms; ++i) {
            points.emplace_back(grumpkin::get_generator(i));
            scalars.emplace_back(grumpkin::fr::random_element(&engine));
            expected += (points[i] * scalars[i]);
            circuit.mul_accumulate(points[i], scalars[i]);
        }
        circuit.eq(expected);
    };

    // single msms
    for (size_t j = 1; j < 9; ++j) {
        proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;
        try_msms(j, circuit);
        bool result = circuit.check_circuit();
        EXPECT_EQ(result, true);
    }
    // chain msms
    proof_system::ECCVMCircuitConstructor<proof_system::honk::flavor::ECCVM> circuit;
    for (size_t j = 1; j < 9; ++j) {
        try_msms(j, circuit);
    }
    bool result = circuit.check_circuit();
    EXPECT_EQ(result, true);
}
} // namespace eccvm_circuit_builder_tests