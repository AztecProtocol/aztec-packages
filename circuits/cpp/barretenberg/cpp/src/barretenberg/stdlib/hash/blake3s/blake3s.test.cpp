#include "barretenberg/crypto/blake3s/blake3s.hpp"
#include "barretenberg/common/streams.hpp"
#include "blake3s.hpp"
#include "blake3s_plookup.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;
using namespace proof_system::plonk;

using Composer = proof_system::CircuitSimulatorBN254;
using byte_array = stdlib::byte_array<Composer>;
using byte_array_plookup = stdlib::byte_array<Composer>;
using public_witness_t = stdlib::public_witness_t<Composer>;
using public_witness_t_plookup = stdlib::public_witness_t<Composer>;

TEST(stdlib_blake3s, test_single_block)
{
    Composer composer = Composer();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array input_arr(&composer, input_v);
    byte_array output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_single_block_plookup)
{
    Composer composer = Composer();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&composer, input_v);
    byte_array_plookup output = stdlib::blake3s<Composer>(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_double_block)
{
    Composer composer = Composer();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array input_arr(&composer, input_v);
    byte_array output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_blake3s, test_double_block_plookup)
{
    Composer composer = Composer();
    std::string input = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz0123456789";
    std::vector<uint8_t> input_v(input.begin(), input.end());

    byte_array_plookup input_arr(&composer, input_v);
    byte_array_plookup output = stdlib::blake3s(input_arr);

    std::vector<uint8_t> expected = blake3::blake3s(input_v);

    EXPECT_EQ(output.get_value(), expected);

    info("composer gates = ", composer.get_num_gates());

    bool proof_result = composer.check_circuit();
    EXPECT_EQ(proof_result, true);
}
