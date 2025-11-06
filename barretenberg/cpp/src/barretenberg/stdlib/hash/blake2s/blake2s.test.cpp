#include "barretenberg/crypto/blake2s/blake2s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "blake2s.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::stdlib;

using Builder = UltraCircuitBuilder;

using field_ct = field_t<Builder>;
using witness_ct = witness_t<Builder>;
using byte_array_ct = byte_array<Builder>;
using public_witness_t = public_witness_t<Builder>;

std::vector<std::string> test_vectors = { "",
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

TEST(stdlib_blake2s, test_single_block)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake2s, test_double_block)
{
    Builder builder;
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_ct input_arr(&builder, input_v);
    byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake2s, test_witness_and_constant)
{
    Builder builder;

    // create a byte array that is a circuit witness
    std::string witness_str = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz";
    std::vector<uint8_t> witness_str_vec(witness_str.begin(), witness_str.end());
    byte_array_ct witness_str_ct(&builder, witness_str_vec);

    // create a byte array that is a circuit constant
    std::vector<uint8_t> constant_vec = { '0', '1' };
    std::vector<field_ct> constant_vec_field_ct;
    for (auto b : constant_vec) {
        constant_vec_field_ct.emplace_back(field_ct(bb::fr(b)));
    }
    byte_array_ct constant_vec_ct(&builder, constant_vec_field_ct);

    // create a byte array that is part circuit witness and part circuit constant
    byte_array_ct input_arr(&builder);
    input_arr.write(witness_str_ct).write(constant_vec_ct);

    // hash the combined byte array
    byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

    // create expected input vector by concatenating witness and constant parts
    std::vector<uint8_t> input_v;
    input_v.insert(input_v.end(), witness_str_vec.begin(), witness_str_vec.end());
    input_v.insert(input_v.end(), constant_vec.begin(), constant_vec.end());

    // compute expected hash
    auto expected = crypto::blake2s(input_v);

    EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

    info("builder gates = ", builder.get_num_finalized_gates_inefficient());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake2s, test_multiple_sized_blocks)
{

    int i = 0;

    for (auto v : test_vectors) {
        Builder builder;

        std::vector<uint8_t> input_v(v.begin(), v.end());

        byte_array_ct input_arr(&builder, input_v);
        byte_array_ct output = stdlib::Blake2s<Builder>::hash(input_arr);

        auto expected = crypto::blake2s(input_v);

        EXPECT_EQ(output.get_value(), std::vector<uint8_t>(expected.begin(), expected.end()));

        info("test vector ", i++, ".: builder gates = ", builder.get_num_finalized_gates_inefficient());

        bool proof_result = CircuitChecker::check(builder);
        EXPECT_EQ(proof_result, true);
    }
}
