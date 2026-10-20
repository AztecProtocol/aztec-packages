#include "barretenberg/crypto/keccak/keccak.hpp"
#include "../../primitives/plookup/plookup.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "keccak.hpp"
#include <gtest/gtest.h>

using namespace bb;

template <class Builder> class StdlibKeccak : public ::testing::Test {};

using BuilderTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
TYPED_TEST_SUITE(StdlibKeccak, BuilderTypes);

namespace {
auto& engine = numeric::get_debug_randomness();
}

TYPED_TEST(StdlibKeccak, keccak_format_input_table)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint64_t limb_native = engine.get_random_uint64();
        field_ct limb(witness_ct(&builder, limb_native));

        auto accumulators = stdlib::plookup_read<Builder>::get_lookup_accumulators(plookup::KECCAK_FORMAT_INPUT, limb);

        field_ct sparse_limb = accumulators[plookup::ColumnIdx::C2][0];
        field_ct msb = accumulators[plookup::ColumnIdx::C3][accumulators[plookup::ColumnIdx::C3].size() - 1];

        uint256_t expected_sparse = stdlib::keccak<Builder>::convert_to_sparse(limb_native);
        uint64_t expected_msb = (limb_native >> 63) & 1ULL;

        EXPECT_EQ(static_cast<uint256_t>(sparse_limb.get_value()), expected_sparse);
        EXPECT_EQ(static_cast<uint64_t>(msb.get_value()), expected_msb);
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(StdlibKeccak, keccak_format_output_table)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint64_t limb_native = engine.get_random_uint64();
        uint256_t extended_native = stdlib::keccak<Builder>::convert_to_sparse(limb_native);
        field_ct limb(witness_ct(&builder, extended_native));

        auto accumulators = stdlib::plookup_read<Builder>::get_lookup_accumulators(plookup::KECCAK_FORMAT_OUTPUT, limb);
        field_ct normalized_limb = accumulators[plookup::ColumnIdx::C2][0];
        EXPECT_EQ(static_cast<uint256_t>(normalized_limb.get_value()), limb_native);
    }
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(StdlibKeccak, keccak_theta_output_table)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

    Builder builder = Builder();

    for (size_t i = 0; i < 25; ++i) {
        uint256_t extended_native = 0;
        uint256_t expected_normalized = 0;
        for (size_t j = 0; j < 8; ++j) {
            extended_native *= 11;
            expected_normalized *= 11;
            uint64_t base_value = (engine.get_random_uint64() % 11);
            uint64_t bit = base_value & 1;
            extended_native += base_value;
            expected_normalized += bit;
        }

        field_ct limb(witness_ct(&builder, extended_native));
        field_ct normalized = stdlib::plookup_read<Builder>::read_from_1_to_2_table(plookup::KECCAK_THETA_OUTPUT, limb);

        EXPECT_EQ(static_cast<uint256_t>(normalized.get_value()), expected_normalized);
    }

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(StdlibKeccak, keccak_rho_output_table)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

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
        // msb is the MSB of the normalized limb without rotation
        const uint256_t expected_msb = (binary_native >> 63);
        field_ct limb(witness_ct(&builder, extended_native));
        field_ct result_msb;
        field_ct result_limb = stdlib::keccak<Builder>::template normalize_and_rotate<i>(limb, result_msb);
        EXPECT_EQ(static_cast<uint256_t>(result_limb.get_value()), expected_limb);
        EXPECT_EQ(static_cast<uint256_t>(result_msb.get_value()), expected_msb);
    });

    info("num gates = ", builder.get_num_finalized_gates_inefficient());
    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

TYPED_TEST(StdlibKeccak, keccak_chi_output_table)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

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
TYPED_TEST(StdlibKeccak, permutation_opcode)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;

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

TYPED_TEST(StdlibKeccak, ZeroStateKnownAnswer)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    // Independent Keccak-f[1600] zero-state vector, checked with @noble/hashes keccakP.
    constexpr std::array<uint64_t, 25> expected{ 0xf1258f7940e1dde7ULL, 0x84d5ccf933c0478aULL, 0xd598261ea65aa9eeULL,
                                                 0xbd1547306f80494dULL, 0x8b284e056253d057ULL, 0xff97a42d7f8e6fd4ULL,
                                                 0x90fee5a0a44647c4ULL, 0x8c5bda0cd6192e76ULL, 0xad30a6f71b19059cULL,
                                                 0x30935ab7d08ffc64ULL, 0xeb5aa93f2317d635ULL, 0xa9a6e6260d712103ULL,
                                                 0x81a57c16dbcf555fULL, 0x43b831cd0347c826ULL, 0x01f22f1a11a5569fULL,
                                                 0x05e5635a21d9ae61ULL, 0x64befef28cc970f2ULL, 0x613670957bc46611ULL,
                                                 0xb87c5a554fd00ecbULL, 0x8c3ee88a1ccf32c8ULL, 0x940c7922ae3a2614ULL,
                                                 0x1841f924a2c509e4ULL, 0x16f53526e70465c2ULL, 0x75f644e97f30a13bULL,
                                                 0xeaf1ff7b5ceca249ULL };
    Builder builder;
    std::array<field_ct, 25> input;
    for (auto& lane : input) {
        lane = witness_ct(&builder, 0);
    }
    const auto output = stdlib::keccak<Builder>::permutation_opcode(input, &builder);
    EXPECT_TRUE(CircuitChecker::check(builder));
    for (size_t i = 0; i < output.size(); ++i) {
        EXPECT_EQ(static_cast<uint64_t>(output[i].get_value()), expected[i]);
    }
}

TYPED_TEST(StdlibKeccak, ThetaRejectsAlternativeDigitDecomposition)
{
    using Builder = TypeParam;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using keccak_ct = stdlib::keccak<Builder>;

    static constexpr uint256_t BASE = 11;

    // A low digit of one lets mid - 1 change only the first lookup slice.
    uint256_t mid_native = 0;
    for (size_t j = 0; j < 64; ++j) {
        const size_t digit_index = 63 - j;
        mid_native = mid_native * BASE + (digit_index == 0 ? 1 : (3 * digit_index + 1) % 11);
    }
    const uint256_t hi_native = 7; // any valid base-11 digit
    const uint256_t twisted = hi_native * BASE.pow(64) + mid_native;

    const bb::fr lane_native(twisted * BASE);
    const uint256_t normalized = keccak_ct::normalize_sparse(mid_native);
    const uint256_t normalized_alt = keccak_ct::normalize_sparse(mid_native - 1);
    ASSERT_NE(normalized, normalized_alt);

    for (bool forged : { false, true }) {
        Builder builder = [] {
            if constexpr (std::is_same_v<Builder, UltraCircuitBuilder>) {
                return Builder(/*is_write_vk_mode=*/true);
            } else {
                return Builder(std::make_shared<ECCOpQueue>(), /*is_write_vk_mode=*/true);
            }
        }();
        const field_ct lane(witness_ct(&builder, lane_native));
        const field_ct hi(witness_ct(&builder, hi_native));
        const field_ct mid(witness_ct(&builder, forged ? mid_native - 1 : mid_native));
        const field_ct lo(witness_ct(&builder, forged ? BASE : uint256_t(0)));
        const auto output = keccak_ct::normalize_theta_lane(lane, hi, mid, lo);
        EXPECT_EQ(output.get_value(), bb::fr(forged ? normalized_alt : normalized));
        EXPECT_EQ(CircuitChecker::check(builder), !forged);
    }
}
