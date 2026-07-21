#include "plookup.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/bitop/rotate.hpp"
#include "barretenberg/numeric/bitop/sparse_form.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::plookup;

// Defining ultra-specific types for local testing.
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using plookup_read = stdlib::plookup_read<Builder>;
namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(PlookupTests, uint32_xor)
{
    Builder builder = Builder();

    const size_t num_lookups = (32 + 5) / 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::UINT32_XOR, left, right, true);

    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);

    std::vector<uint256_t> out_expected(num_lookups);
    std::vector<uint256_t> left_expected(num_lookups);
    std::vector<uint256_t> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        out_expected[i] = left_slices[i] ^ right_slices[i];
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * (1 << 6);
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), bb::fr(left_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), bb::fr(right_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), bb::fr(out_expected[i]));
    }

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, blake2s_xor_rotate_16)
{
    Builder builder = Builder();

    const size_t num_lookups = 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_16, left, right, true);

    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);

    std::vector<fr> out_expected(num_lookups);
    std::vector<fr> left_expected(num_lookups);
    std::vector<fr> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        if (i == 2) {
            uint32_t a = static_cast<uint32_t>(left_slices[i]);
            uint32_t b = static_cast<uint32_t>(right_slices[i]);
            uint32_t c = numeric::rotate32(a ^ b, 4);
            out_expected[i] = uint256_t(c);
        } else {
            out_expected[i] = uint256_t(left_slices[i]) ^ uint256_t(right_slices[i]);
        }
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    /*
     * The following out coefficients are the ones multiplied for computing the cumulative intermediate terms
     * in the expected output. If the column_3_coefficients for this table are (a0, a1, ..., a5), then the
     * out_coefficients must be (a5/a4, a4/a3, a3/a2, a2/a1, a1/a0). Note that these are stored in reverse orde
     * for simplicity.
     */
    std::vector<fr> out_coefficients{ (1 << 6), (bb::fr(1) / bb::fr(1 << 22)), (1 << 2), (1 << 6), (1 << 6) };

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * out_coefficients[i];
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), left_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), right_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), out_expected[i]);
    }

    /*
     * Note that we multiply the output of the lookup table (lookup[Column::Idx}0]) by 2^{16} because
     * while defining the table we had set the coefficient of s0 to 1, so to correct that, we need to multiply by a
     * constant.
     */
    auto mul_constant = fr(1 << 16);
    fr lookup_output = lookup[ColumnIdx::C3][0].get_value() * mul_constant;
    uint32_t xor_rotate_output = numeric::rotate32(uint32_t(left_value) ^ uint32_t(right_value), 16);
    EXPECT_EQ(fr(uint256_t(xor_rotate_output)), lookup_output);

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, blake2s_xor_rotate_8)
{
    Builder builder = Builder();

    const size_t num_lookups = 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_8, left, right, true);

    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);

    std::vector<fr> out_expected(num_lookups);
    std::vector<fr> left_expected(num_lookups);
    std::vector<fr> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        if (i == 1) {
            uint32_t a = static_cast<uint32_t>(left_slices[i]);
            uint32_t b = static_cast<uint32_t>(right_slices[i]);
            uint32_t c = numeric::rotate32(a ^ b, 2);
            out_expected[i] = uint256_t(c);
        } else {
            out_expected[i] = uint256_t(left_slices[i]) ^ uint256_t(right_slices[i]);
        }
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    auto mul_constant = fr(1 << 24);
    std::vector<fr> out_coefficients{ (bb::fr(1) / mul_constant), (1 << 4), (1 << 6), (1 << 6), (1 << 6) };

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * out_coefficients[i];
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), left_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), right_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), out_expected[i]);
    }

    fr lookup_output = lookup[ColumnIdx::C3][0].get_value() * mul_constant;
    uint32_t xor_rotate_output = numeric::rotate32(uint32_t(left_value) ^ uint32_t(right_value), 8);
    EXPECT_EQ(fr(uint256_t(xor_rotate_output)), lookup_output);

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, blake2s_xor_rotate_7)
{
    Builder builder = Builder();

    const size_t num_lookups = 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR_ROTATE_7, left, right, true);

    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);

    std::vector<fr> out_expected(num_lookups);
    std::vector<fr> left_expected(num_lookups);
    std::vector<fr> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        if (i == 1) {
            uint32_t a = static_cast<uint32_t>(left_slices[i]);
            uint32_t b = static_cast<uint32_t>(right_slices[i]);
            uint32_t c = numeric::rotate32(a ^ b, 1);
            out_expected[i] = uint256_t(c);
        } else {
            out_expected[i] = uint256_t(left_slices[i]) ^ uint256_t(right_slices[i]);
        }
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    auto mul_constant = fr(1 << 25);
    std::vector<fr> out_coefficients{ (bb::fr(1) / mul_constant), (1 << 5), (1 << 6), (1 << 6), (1 << 6) };

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * out_coefficients[i];
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), left_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), right_expected[i]);
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), out_expected[i]);
    }

    fr lookup_output = lookup[ColumnIdx::C3][0].get_value() * mul_constant;
    uint32_t xor_rotate_output = numeric::rotate32(uint32_t(left_value) ^ uint32_t(right_value), 7);
    EXPECT_EQ(fr(uint256_t(xor_rotate_output)), lookup_output);

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, blake2s_xor)
{
    Builder builder = Builder();

    const size_t num_lookups = 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::BLAKE_XOR, left, right, true);

    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);

    std::vector<uint256_t> out_expected(num_lookups);
    std::vector<uint256_t> left_expected(num_lookups);
    std::vector<uint256_t> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        out_expected[i] = left_slices[i] ^ right_slices[i];
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    // Compute ror(a ^ b, 12) from lookup table.
    // t0 = 2^30 a5 + 2^24 a4 + 2^18 a3 + 2^12 a2 + 2^6 a1 + a0
    // t1 = 2^24 a5 + 2^18 a4 + 2^12 a3 + 2^6 a2 + a1
    // t2 = 2^18 a5 + 2^12 a4 + 2^6 a3 + a2
    // t3 = 2^12 a5 + 2^6 a4 + a3
    // t4 = 2^6 a5 + a4
    // t5 = a5
    //
    // output = (t0 - 2^12 t2) * 2^{32 - 12} + t2
    fr lookup_output = lookup[ColumnIdx::C3][2].get_value();
    fr t2_term = fr(1 << 12) * lookup[ColumnIdx::C3][2].get_value();
    lookup_output += fr(1 << 20) * (lookup[ColumnIdx::C3][0].get_value() - t2_term);

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * (1 << 6);
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    //
    // The following checks if the xor output rotated by 12 can be computed correctly from basic blake2s_xor.
    //
    auto xor_rotate_output = numeric::rotate32(uint32_t(left_value) ^ uint32_t(right_value), 12);
    EXPECT_EQ(fr(uint256_t(xor_rotate_output)), lookup_output);

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), bb::fr(left_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), bb::fr(right_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), bb::fr(out_expected[i]));
    }

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, uint32_and)
{
    Builder builder = Builder();

    const size_t num_lookups = (32 + 5) / 6;

    uint256_t left_value = (engine.get_random_uint256() & 0xffffffffULL);
    uint256_t right_value = (engine.get_random_uint256() & 0xffffffffULL);

    field_ct left = witness_ct(&builder, bb::fr(left_value));
    field_ct right = witness_ct(&builder, bb::fr(right_value));

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::UINT32_AND, left, right, true);
    const auto left_slices = numeric::slice_input(left_value, 1 << 6, num_lookups);
    const auto right_slices = numeric::slice_input(right_value, 1 << 6, num_lookups);
    std::vector<uint256_t> out_expected(num_lookups);
    std::vector<uint256_t> left_expected(num_lookups);
    std::vector<uint256_t> right_expected(num_lookups);

    for (size_t i = 0; i < left_slices.size(); ++i) {
        out_expected[i] = left_slices[i] & right_slices[i];
        left_expected[i] = left_slices[i];
        right_expected[i] = right_slices[i];
    }

    for (size_t i = num_lookups - 2; i < num_lookups; --i) {
        out_expected[i] += out_expected[i + 1] * (1 << 6);
        left_expected[i] += left_expected[i + 1] * (1 << 6);
        right_expected[i] += right_expected[i + 1] * (1 << 6);
    }

    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(lookup[ColumnIdx::C1][i].get_value(), bb::fr(left_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C2][i].get_value(), bb::fr(right_expected[i]));
        EXPECT_EQ(lookup[ColumnIdx::C3][i].get_value(), bb::fr(out_expected[i]));
    }

    bool result = CircuitChecker::check(builder);

    EXPECT_EQ(result, true);
}

TEST(PlookupTests, secp256k1_generator)
{
    using curve = stdlib::secp256k1<Builder>;
    Builder builder = Builder();

    uint256_t input_value = (engine.get_random_uint256() >> 128);

    uint64_t wnaf_entries[18] = { 0 };
    bool skew = false;
    wnaf::fixed_wnaf<129, 1, 8>(&input_value.data[0], &wnaf_entries[0], skew, 0);

    std::vector<uint64_t> naf_values;
    for (size_t i = 0; i < 17; ++i) {
        bool predicate = bool((wnaf_entries[i] >> 31U) & 1U);
        uint64_t offset_entry;
        if (predicate) {
            offset_entry = (127 - (wnaf_entries[i] & 0xffffff));
        } else {
            offset_entry = (128 + (wnaf_entries[i] & 0xffffff));
        }
        naf_values.emplace_back(offset_entry);
    }

    std::vector<field_ct> circuit_naf_values;
    for (size_t i = 0; i < naf_values.size(); ++i) {
        circuit_naf_values.emplace_back(witness_ct(&builder, naf_values[i]));
    }

    std::vector<field_ct> accumulators;
    for (size_t i = 0; i < naf_values.size(); ++i) {
        field_ct t1 = (circuit_naf_values[naf_values.size() - 1 - i]) * field_ct(uint256_t(1) << (i * 8 + 1));
        field_ct t2 = field_ct(255) * field_ct(uint256_t(1) << (i * 8));
        accumulators.emplace_back(t1 - t2);
    }
    field_ct accumulator_field = field_ct::accumulate(accumulators);
    EXPECT_EQ(accumulator_field.get_value(), bb::fr(input_value) + bb::fr(skew));

    for (size_t i = 0; i < 256; ++i) {
        field_ct index(witness_ct(&builder, bb::fr(i)));
        const auto xlo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XLO, index);
        const auto xhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XHI, index);
        const auto ylo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YLO, index);
        const auto yhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YHI, index);
        curve::BaseField x =
            curve::BaseField::unsafe_construct_from_limbs(xlo.first, xlo.second, xhi.first, xhi.second);
        curve::BaseField y =
            curve::BaseField::unsafe_construct_from_limbs(ylo.first, ylo.second, yhi.first, yhi.second);

        const auto res = curve::Group(x, y).get_value();
        curve::ScalarFieldNative scalar(i);
        scalar = scalar + scalar;
        scalar = scalar - 255;
        curve::GroupNative::affine_element expec(curve::GroupNative::one * scalar);

        EXPECT_EQ(res, expec);
    }
    curve::Group accumulator;
    {
        const auto xlo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XLO, circuit_naf_values[0]);
        const auto xhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XHI, circuit_naf_values[0]);
        const auto ylo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YLO, circuit_naf_values[0]);
        const auto yhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YHI, circuit_naf_values[0]);

        curve::BaseField x =
            curve::BaseField::unsafe_construct_from_limbs(xlo.first, xlo.second, xhi.first, xhi.second);
        curve::BaseField y =
            curve::BaseField::unsafe_construct_from_limbs(ylo.first, ylo.second, yhi.first, yhi.second);
        accumulator = curve::Group(x, y);
    }
    for (size_t i = 1; i < circuit_naf_values.size(); ++i) {
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();
        accumulator = accumulator.dbl();

        const auto xlo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XLO, circuit_naf_values[i]);
        const auto xhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_XHI, circuit_naf_values[i]);
        const auto ylo = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YLO, circuit_naf_values[i]);
        const auto yhi = plookup_read::read_pair_from_table(MultiTableId::SECP256K1_YHI, circuit_naf_values[i]);
        curve::BaseField x =
            curve::BaseField::unsafe_construct_from_limbs(xlo.first, xlo.second, xhi.first, xhi.second);
        curve::BaseField y =
            curve::BaseField::unsafe_construct_from_limbs(ylo.first, ylo.second, yhi.first, yhi.second);
        accumulator = accumulator.dbl() + curve::Group(x, y);
    }

    if (skew) {
        accumulator = accumulator - curve::Group::one(&builder);
    }

    curve::GroupNative::affine_element result = accumulator.get_value();
    curve::GroupNative::affine_element expected(curve::GroupNative::one * input_value);
    EXPECT_EQ(result, expected);

    bool proof_result = CircuitChecker::check(builder);
    EXPECT_EQ(proof_result, true);
}

// Constant vs variable path tests
TEST(PlookupTests, ConstantInputsConstantOutputs)
{
    Builder builder;

    // Use constant field elements (not witnesses)
    field_ct left(&builder, bb::fr(0x12345678));
    field_ct right(&builder, bb::fr(0xDEADBEEF));

    ASSERT_TRUE(left.is_constant());
    ASSERT_TRUE(right.is_constant());

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::UINT32_XOR, left, right, true);

    // Result should be constant
    EXPECT_TRUE(lookup[ColumnIdx::C3][0].is_constant());

    // Result should still be correct
    uint32_t expected = 0x12345678 ^ 0xDEADBEEF;
    EXPECT_EQ(lookup[ColumnIdx::C3][0].get_value(), bb::fr(expected));
}

TEST(PlookupTests, VariableInputsVariableOutputs)
{
    Builder builder;

    // Use witness field elements
    field_ct left = witness_ct(&builder, bb::fr(0x12345678));
    field_ct right = witness_ct(&builder, bb::fr(0xDEADBEEF));

    ASSERT_FALSE(left.is_constant());
    ASSERT_FALSE(right.is_constant());

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::UINT32_XOR, left, right, true);

    // Result should NOT be constant
    EXPECT_FALSE(lookup[ColumnIdx::C3][0].is_constant());

    // Result should still be correct
    uint32_t expected = 0x12345678 ^ 0xDEADBEEF;
    EXPECT_EQ(lookup[ColumnIdx::C3][0].get_value(), bb::fr(expected));

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(PlookupTests, MixedConstantVariableInputs)
{
    Builder builder;

    // One constant, one variable
    field_ct left(&builder, bb::fr(0x12345678));
    field_ct right = witness_ct(&builder, bb::fr(0xDEADBEEF));

    ASSERT_TRUE(left.is_constant());
    ASSERT_FALSE(right.is_constant());

    const auto lookup = plookup_read::get_lookup_accumulators(MultiTableId::UINT32_XOR, left, right, true);

    // Result should NOT be constant (one input is variable)
    EXPECT_FALSE(lookup[ColumnIdx::C3][0].is_constant());

    // Result should still be correct
    uint32_t expected = 0x12345678 ^ 0xDEADBEEF;
    EXPECT_EQ(lookup[ColumnIdx::C3][0].get_value(), bb::fr(expected));

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Regression: the eight SECP256K1 generator MultiTables previously declared slice_sizes = 512
// while the basic tables only have 256 rows, so a key in [256, 511] would slip past the
// slice bound in slice_input_using_variable_bases and OOB-index generator_*_table.
TEST(PlookupTests, Secp256k1GeneratorSliceSizeBound)
{
    const std::array<MultiTableId, 8> ids{
        MultiTableId::SECP256K1_XLO,      MultiTableId::SECP256K1_XHI,          MultiTableId::SECP256K1_YLO,
        MultiTableId::SECP256K1_YHI,      MultiTableId::SECP256K1_XYPRIME,      MultiTableId::SECP256K1_XLO_ENDO,
        MultiTableId::SECP256K1_XHI_ENDO, MultiTableId::SECP256K1_XYPRIME_ENDO,
    };
    for (const auto id : ids) {
        // Last valid key.
        EXPECT_NO_THROW(plookup::get_lookup_accumulators(id, bb::fr(255), bb::fr(0), false));
        // First out-of-range key — used to silently OOB-read.
        EXPECT_THROW(plookup::get_lookup_accumulators(id, bb::fr(256), bb::fr(0), false), std::runtime_error);
        // Mid-range OOB witness from the auditor's PoC.
        EXPECT_THROW(plookup::get_lookup_accumulators(id, bb::fr(300), bb::fr(0), false), std::runtime_error);
    }
}

// Checking the eight SECP256R1_FIXED_BASE multitables: (1) the slicer rejects keys
// past the 2^136 / 2^120 bit budget, and (2) each slot's basic-table size equals its declared
// slice_size. Widening either bound lets a prover witness a slice past the tail's basic-table range.
TEST(PlookupTests, Secp256r1FixedBaseSliceSizeBound)
{
    using bb::numeric::uint256_t;
    using Params = Secp256r1FixedBaseParams;
    // Bits per half = (NUM_WINDOWS − 1) full 7-bit windows + tail: 136 (lo) and 120 (hi).
    constexpr size_t LO_BIT_BUDGET = ((Params::NUM_WINDOWS_LO - 1) * Params::WINDOW_BITS) + Params::WINDOW_BITS_LO_TAIL;
    constexpr size_t HI_BIT_BUDGET = ((Params::NUM_WINDOWS_HI - 1) * Params::WINDOW_BITS) + Params::WINDOW_BITS_HI_TAIL;

    const std::array<MultiTableId, 4> lo_ids{
        MultiTableId::SECP256R1_FIXED_BASE_XLO_LO,
        MultiTableId::SECP256R1_FIXED_BASE_XHI_LO,
        MultiTableId::SECP256R1_FIXED_BASE_YLO_LO,
        MultiTableId::SECP256R1_FIXED_BASE_YHI_LO,
    };
    const std::array<MultiTableId, 4> hi_ids{
        MultiTableId::SECP256R1_FIXED_BASE_XLO_HI,
        MultiTableId::SECP256R1_FIXED_BASE_XHI_HI,
        MultiTableId::SECP256R1_FIXED_BASE_YLO_HI,
        MultiTableId::SECP256R1_FIXED_BASE_YHI_HI,
    };

    // (1) Slicer rejects keys at the bit budget; accepts the immediately-preceding key.
    const uint256_t lo_oob_key = uint256_t(1) << LO_BIT_BUDGET;
    const uint256_t hi_oob_key = uint256_t(1) << HI_BIT_BUDGET;
    for (const auto id : lo_ids) {
        EXPECT_NO_THROW(plookup::get_lookup_accumulators(id, bb::fr(lo_oob_key - 1), bb::fr(0), false));
        EXPECT_THROW(plookup::get_lookup_accumulators(id, bb::fr(lo_oob_key), bb::fr(0), false), std::runtime_error);
    }
    for (const auto id : hi_ids) {
        EXPECT_NO_THROW(plookup::get_lookup_accumulators(id, bb::fr(hi_oob_key - 1), bb::fr(0), false));
        EXPECT_THROW(plookup::get_lookup_accumulators(id, bb::fr(hi_oob_key), bb::fr(0), false), std::runtime_error);
    }

    // (2) Each slot's slice_size and basic-table size both equal Params::TABLE_SIZE_BIG, except the tail.
    auto check_layout = [](MultiTableId mt_id, size_t num_windows, size_t tail_rows) {
        SCOPED_TRACE("MultiTable id=" + std::to_string(static_cast<size_t>(mt_id)));
        const auto& mt = get_multitable(mt_id);
        ASSERT_EQ(mt.basic_table_ids.size(), num_windows);
        ASSERT_EQ(mt.slice_sizes.size(), num_windows);
        for (size_t slot = 0; slot < num_windows; ++slot) {
            SCOPED_TRACE("slot=" + std::to_string(slot));
            const size_t expected = (slot == num_windows - 1) ? tail_rows : Params::TABLE_SIZE_BIG;
            EXPECT_EQ(mt.slice_sizes[slot], expected);
            EXPECT_EQ(create_basic_table(mt.basic_table_ids[slot], 1).size(), expected);
        }
    };
    for (const auto id : lo_ids) {
        check_layout(id, Params::NUM_WINDOWS_LO, Params::TABLE_SIZE_LO_TAIL);
    }
    for (const auto id : hi_ids) {
        check_layout(id, Params::NUM_WINDOWS_HI, Params::TABLE_SIZE_HI_TAIL);
    }
}

/**
 * @brief Invariant check for SHA-256 input multitables: basic-table sizes match declared slice_sizes.
 *
 * @details Each SHA-256 input multitable (MAJ_INPUT, CH_INPUT, WITNESS_INPUT) is a 1-to-1 decomposition
 * lookup: each slot reads a single key in [0, slice_sizes[slot]) and the backing basic table is generated
 * by iterating `i = 0 .. 2^bits_per_slice`. Soundness requires basic.size() == slice_sizes[slot]; a larger
 * basic table admits keys outside the declared range and lets a prover witness an out-of-range slice.
 *
 */
TEST(PlookupTests, Sha256InputMultiTablesMatchBasicTableSizes)
{
    const std::array<MultiTableId, 3> sha256_input_tables = {
        MultiTableId::SHA256_MAJ_INPUT,
        MultiTableId::SHA256_CH_INPUT,
        MultiTableId::SHA256_WITNESS_INPUT,
    };

    for (auto mt_id : sha256_input_tables) {
        const auto& mt = get_multitable(mt_id);
        ASSERT_EQ(mt.basic_table_ids.size(), mt.slice_sizes.size())
            << "MultiTable id=" << static_cast<size_t>(mt_id)
            << ": basic_table_ids and slice_sizes have different sizes";

        for (size_t slot = 0; slot < mt.slice_sizes.size(); ++slot) {
            const auto basic = create_basic_table(mt.basic_table_ids[slot], 1);
            EXPECT_EQ(basic.size(), mt.slice_sizes[slot])
                << "MultiTable id=" << static_cast<size_t>(mt_id) << " slot=" << slot << ": basic-table size "
                << basic.size() << " != declared slice_size " << mt.slice_sizes[slot];
        }
    }
}
