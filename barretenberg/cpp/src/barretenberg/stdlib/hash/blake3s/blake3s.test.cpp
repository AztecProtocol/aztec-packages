#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/streams.hpp"
#include "blake3s.hpp"
#include <gtest/gtest.h>

using namespace bb;

using byte_array_ct = stdlib::byte_array<bb::UltraCircuitBuilder>;
using UltraBuilder = UltraCircuitBuilder;

std::vector<std::string> test_vectors = { std::string{},
                                          "a",
                                          "ab",
                                          "abc",
                                          "abcd",
                                          "abcdefg",
                                          "abcdefgh",
                                          "abcdefghijklmnopqrstuvwxyz01234",
                                          "abcdefghijklmnopqrstuvwxyz012345",
                                          "abcdefghijklmnopqrstuvwxyz0123456",
                                          "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0",
                                          "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01",
                                          "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz012",
                                          "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789" };

TEST(stdlib_blake3s, test_single_block)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_double_block)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_too_large_input)
{
    auto builder = UltraBuilder();

    std::vector<uint8_t> input_v(1025, 0);

    byte_array_ct input_arr(&builder, input_v);
    EXPECT_THROW_OR_ABORT(stdlib::Blake3s<UltraBuilder>::hash(input_arr),
                          "Barretenberg does not support blake3s with input lengths greater than 1024 bytes.");
}

TEST(stdlib_blake3s, test_witness_and_constant)
{
    UltraBuilder builder;

    // create a byte array that is a circuit witness
    std::string witness_str = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz";
    std::vector<uint8_t> witness_str_vec(witness_str.begin(), witness_str.end());

    // create a byte array that is part circuit witness and part circuit constant
    // start with the witness part, then append constant padding
    byte_array_ct input_arr(&builder, witness_str_vec);
    input_arr.write(byte_array_ct::constant_padding(&builder, 1, '0'))
        .write(byte_array_ct::constant_padding(&builder, 1, '1'));

    // for expected value calculation
    std::vector<uint8_t> constant_vec = { '0', '1' };

    // create expected input vector by concatenating witness and constant parts
    std::vector<uint8_t> input_v;
    input_v.insert(input_v.end(), witness_str_vec.begin(), witness_str_vec.end());
    input_v.insert(input_v.end(), constant_vec.begin(), constant_vec.end());

    // Verify the circuit input matches the expected input
    EXPECT_EQ(input_arr.get_value(), input_v);

    // hash the combined byte array
    byte_array_ct output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);

    // compute expected hash
    auto expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_multiple_sized_blocks)
{
    int i = 0;

    for (auto v : test_vectors) {
        UltraBuilder builder;

        std::vector<uint8_t> input_v(v.begin(), v.end());

        byte_array_ct input_arr(&builder, input_v);
        byte_array_ct output = stdlib::Blake3s<UltraBuilder>::hash(input_arr);

        auto expected = blake3::blake3s(input_v);

        EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

        info("test vector ", i++, ".: builder gates = ", builder.get_num_finalized_gates_inefficient());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }
}
