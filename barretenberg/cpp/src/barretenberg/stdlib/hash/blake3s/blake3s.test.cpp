#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "blake3s.hpp"
#include "blake3s_plookup.hpp"
#include <gtest/gtest.h>

using namespace bb;

using byte_array_plookup = stdlib::byte_array<bb::UltraCircuitBuilder>;
using public_witness_t_plookup = stdlib::public_witness_t<bb::UltraCircuitBuilder>;
using UltraBuilder = UltraCircuitBuilder;

TEST(stdlib_blake3s, test_single_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("builder gates = ", builder.get_estimated_num_finalized_gates());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_double_block_plookup)
{
    auto builder = UltraBuilder();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&builder, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("builder gates = ", builder.get_estimated_num_finalized_gates());

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_too_large_input_plookup)
{
    auto builder = UltraBuilder();

    std::vector<uint8_t> input_v(1025, 0);

    byte_array_plookup input_arr(&builder, input_v);
    EXPECT_DEATH(stdlib::blake3s(input_arr),
                 "Barretenberg does not support blake3s with input lengths greater than 1024 bytes.");
}
