#include "barretenberg/crypto/keccak/keccak.hpp"
#include "../../primitives/plookup/plookup.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "keccak.hpp"
#include <gtest/gtest.h>

using namespace bb;

using Builder = UltraCircuitBuilder;
using byte_array = stdlib::byte_array<Builder>;
using public_witness_t = stdlib::public_witness_t<Builder>;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(stdlib_keccak, keccak_format_input_table)
{
    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint64_t limb_native = engine.get_random_uint64();
        field_ct limb(witness_ct(&builder, limb_native));
        stdlib::plookup_read<Builder>::read_from_1_to_2_table(plookup::KECCAK_FORMAT_INPUT, limb);
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_keccak, keccak_format_output_table)
{
    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint64_t limb_native = engine.get_random_uint64();
        uint256_t extended_native = stdlib::keccak<Builder>::convert_to_sparse(limb_native);
        field_ct limb(witness_ct(&builder, extended_native));
        stdlib::plookup_read<Builder>::read_from_1_to_2_table(plookup::KECCAK_FORMAT_OUTPUT, limb);
    }
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_keccak, keccak_theta_output_table)
{
    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint256_t extended_native = 0;
        for (size_t j = 0; j < 8; ++j) {
            extended_native *= 11;
            uint64_t base_value = (engine.get_random_uint64() % 11);
            extended_native += base_value;
        }
        field_ct limb(witness_ct(&builder, extended_native));
        stdlib::plookup_read<Builder>::read_from_1_to_2_table(plookup::KECCAK_THETA_OUTPUT, limb);
    }
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_keccak, keccak_rho_output_table)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/662)
    GTEST_SKIP() << "Bug in constant case?";
    Builder builder = Builder();

    constexpr_for<0, 25, 1>([&]<size_t i> {
        uint256_t extended_native = 0;
        uint256_t binary_native = 0;
        for (size_t j = 0; j < 64; ++j) {
            extended_native *= 11;
            binary_native = binary_native << 1;
            uint64_t base_value = (engine.get_random_uint64() % 3);
            extended_native += base_value;
            binary_native += (base_value & 1);
        }
        const size_t left_bits = stdlib::keccak<Builder>::ROTATIONS[i];
        const size_t right_bits = 64 - left_bits;
        const uint256_t left = binary_native >> right_bits;
        const uint256_t right = binary_native - (left << right_bits);
        const uint256_t binary_rotated = left + (right << left_bits);

        const uint256_t expected_limb = stdlib::keccak<Builder>::convert_to_sparse(binary_rotated);
        // msb only is correct iff rotation == 0 (no need to get msb for rotated lookups)
        const uint256_t expected_msb = (binary_native >> 63);
        field_ct limb(witness_ct(&builder, extended_native));
        field_ct result_msb;
        field_ct result_limb = stdlib::keccak<Builder>::normalize_and_rotate<i>(limb, result_msb);
        EXPECT_EQ(static_cast<uint256_t>(result_limb.get_value()), expected_limb);
        EXPECT_EQ(static_cast<uint256_t>(result_msb.get_value()), expected_msb);
    });

    info("num gates = ", builder.get_num_finalized_gates_inefficient());
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TEST(stdlib_keccak, keccak_chi_output_table)
{
    static constexpr uint64_t chi_normalization_table[5]{
        0, // 1 + 2a - b + c => a xor (~b & c)
        0, 1, 1, 0,
    };
    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint256_t normalized_native = 0;
        uint256_t extended_native = 0;
        uint256_t binary_native = 0;
        for (size_t j = 0; j < 8; ++j) {
            extended_native *= 11;
            normalized_native *= 11;
            binary_native = binary_native << 1;
            uint64_t base_value = (engine.get_random_uint64() % 5);
            extended_native += base_value;
            normalized_native += chi_normalization_table[base_value];
            binary_native += chi_normalization_table[base_value];
        }
        field_ct limb(witness_ct(&builder, extended_native));
        const auto accumulators =
            stdlib::plookup_read<Builder>::get_lookup_accumulators(plookup::KECCAK_CHI_OUTPUT, limb);

        field_ct normalized = accumulators[plookup::ColumnIdx::C2][0];
        field_ct msb = accumulators[plookup::ColumnIdx::C3][accumulators[plookup::ColumnIdx::C3].size() - 1];

        EXPECT_EQ(static_cast<uint256_t>(normalized.get_value()), normalized_native);
        EXPECT_EQ(static_cast<uint256_t>(msb.get_value()), binary_native >> 63);
    }
    info("num gates = n", builder.get_num_finalized_gates_inefficient());
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

// Matches the fuzzer logic
TEST(stdlib_keccak, permutation_opcode)
{
    Builder builder = Builder();

    // Create a random state (25 lanes of 64 bits)
    std::array<uint64_t, 25> native_state;
    for (size_t i = 0; i < 25; ++i) {
        native_state[i] = engine.get_random_uint64();
    }

    // Run native permutation
    std::array<uint64_t, 25> expected_state = native_state;
    ethash_keccakf1600(expected_state.data());

    // Convert state to circuit field elements
    std::array<field_ct, 25> circuit_state;
    for (size_t i = 0; i < 25; i++) {
        circuit_state[i] = witness_ct(&builder, native_state[i]);
    }

    // Run circuit permutation
    auto circuit_output = stdlib::keccak<Builder>::permutation_opcode(circuit_state, &builder);

    // Verify circuit correctness
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);

    // Compare outputs
    for (size_t i = 0; i < 25; i++) {
        uint64_t circuit_value = static_cast<uint64_t>(circuit_output[i].get_value());
        EXPECT_EQ(circuit_value, expected_state[i]);
    }

    info("num gates = ", builder.get_num_finalized_gates_inefficient());
}
