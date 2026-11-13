#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/stdlib_circuit_builders/bounded_range_sort.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <array>
#include <functional>
#include <gtest/gtest.h>

using namespace bb;

namespace bb {

static std::vector<uint32_t> add_variables(UltraCircuitBuilder& builder, const std::vector<fr>& variables)
{
    std::vector<uint32_t> res;
    for (size_t i = 0; i < variables.size(); i++) {
        res.emplace_back(builder.add_variable(variables[i]));
    }
    return res;
}
/**
 * @brief Circuit-checker range-constraint tests.
 *
 */
TEST(UltraCircuitBuilder, RangeConstraint)
{
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 8);
        }
        builder.enforce_small_deltas(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 3 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 3);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices = add_variables(builder, { 1, 2, 3, 4, 5, 6, 8, 25 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 8);
        }
        builder.enforce_small_deltas(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 2, 3, 4, 5, 6, 10, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 19, 51 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 128);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_TRUE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 2, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 79);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
    {
        UltraCircuitBuilder builder;
        auto indices =
            add_variables(builder, { 1, 0, 3, 80, 5, 6, 29, 8, 15, 11, 32, 21, 42, 79, 16, 10, 3, 26, 13, 14 });
        for (size_t i = 0; i < indices.size(); i++) {
            builder.create_small_range_constraint(indices[i], 79);
        }
        builder.create_unconstrained_gates(indices);
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}

TEST(UltraCircuitBuilder, RangeWithGates)
{
    UltraCircuitBuilder builder;
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_small_range_constraint(idx[i], 8);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, RangeWithGatesWhereRangeNotDyadic)
{
    UltraCircuitBuilder builder;
    auto idx = add_variables(builder, { 1, 2, 3, 4, 5, 6, 7, 8 });
    for (size_t i = 0; i < idx.size(); i++) {
        builder.create_small_range_constraint(idx[i], 12);
    }

    builder.create_add_gate({ idx[0], idx[1], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -3 });
    builder.create_add_gate({ idx[2], idx[3], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -7 });
    builder.create_add_gate({ idx[4], idx[5], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -11 });
    builder.create_add_gate({ idx[6], idx[7], builder.zero_idx(), fr::one(), fr::one(), fr::zero(), -15 });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, ComposedRangeConstraint)
{
    // even num bits - not divisible by 3
    UltraCircuitBuilder builder;
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = builder.add_variable(fr(e));
    builder.create_add_gate({ a_idx, builder.zero_idx(), builder.zero_idx(), 1, 0, 0, -fr(e) });
    builder.create_limbed_range_constraint(a_idx, 134);

    // odd num bits - divisible by 3
    auto c_1 = fr::random_element();
    auto d_1 = uint256_t(c_1).slice(0, 126);
    auto e_1 = fr(d_1);
    auto a_idx_1 = builder.add_variable(fr(e_1));
    builder.create_add_gate({ a_idx_1, builder.zero_idx(), builder.zero_idx(), 1, 0, 0, -fr(e_1) });
    builder.create_limbed_range_constraint(a_idx_1, 127);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST(UltraCircuitBuilder, RangeChecksOnDuplicates)
{
    UltraCircuitBuilder builder;

    uint32_t a = builder.add_variable(fr(100));
    uint32_t b = builder.add_variable(fr(100));
    uint32_t c = builder.add_variable(fr(100));
    uint32_t d = builder.add_variable(fr(100));

    builder.assert_equal(a, b);
    builder.assert_equal(a, c);
    builder.assert_equal(a, d);

    builder.create_small_range_constraint(a, 1000);
    builder.create_small_range_constraint(b, 1001);
    builder.create_small_range_constraint(c, 999);
    builder.create_small_range_constraint(d, 1000);

    builder.create_unconstrained_gates({ a, b, c, d });
    EXPECT_TRUE(CircuitChecker::check(builder));
}

} // namespace bb

namespace bb {

TEST(BoundedRangeSort, MatchesGeneralSortAndPreservesFallbackInputs)
{
    for (const uint64_t maximum : std::array<uint64_t, 7>{ 0, 1, 15, 255, 16383, 65535, 65536 }) {
        for (const size_t count : std::array<size_t, 7>{ 0, 1, 255, 256, 257, 16384, 65536 }) {
            for (const size_t shape : std::array<size_t, 5>{ 0, 1, 2, 3, 4 }) {
                std::vector<uint32_t> values(count);
                uint64_t state = 0x9e3779b97f4a7c15ULL;
                for (size_t i = 0; i < count; ++i) {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    values[i] = static_cast<uint32_t>(state % (maximum + 1));
                }
                if (shape == 1)
                    std::sort(values.begin(), values.end());
                if (shape == 2)
                    std::sort(values.begin(), values.end(), std::greater<uint32_t>());
                if (shape == 3)
                    std::fill(values.begin(), values.end(), static_cast<uint32_t>(maximum));
                if (shape == 4 && !values.empty())
                    values[count / 2] = static_cast<uint32_t>(maximum + 1);
                const auto original = values;
                auto expected = values;
                std::sort(expected.begin(), expected.end());
                const bool eligible =
                    maximum < 65536 && count >= 256 && count >= maximum + 1 &&
                    std::all_of(original.begin(), original.end(), [&](uint32_t value) { return value <= maximum; });
                const bool admitted = range_sort::try_counting_sort(values, maximum);
                EXPECT_EQ(admitted, eligible);
                if (admitted) {
                    EXPECT_EQ(values, expected);
                } else {
                    EXPECT_EQ(values, original);
                    std::sort(values.begin(), values.end());
                    EXPECT_EQ(values, expected);
                }
            }
        }
    }
}

TEST(UltraCircuitBuilder, BoundedRangeSortValidAndInvalidWitnesses)
{
    for (const size_t shape : std::array<size_t, 3>{ 0, 1, 2 }) {
        UltraCircuitBuilder builder;
        std::vector<uint32_t> indices;
        for (size_t i = 0; i < 512; ++i) {
            const uint32_t value = shape == 1 && i == 17 ? uint32_t(256) : static_cast<uint32_t>((i * 17) % 256);
            const fr field_value = shape == 2 && i == 17 ? fr(uint256_t(1) << 128) + fr(1) : fr(value);
            const uint32_t index = builder.add_variable(field_value);
            indices.push_back(index);
            builder.create_small_range_constraint(index, 255);
        }
        builder.assert_equal(indices[0], indices[256]); // Equal values with distinct original witness indices.
        builder.create_unconstrained_gates(indices);
        EXPECT_EQ(CircuitChecker::check(builder), shape == 0);
    }
}

} // namespace bb

namespace bb {
TEST(UltraCircuitBuilder, NativeSubLimbAdmissionPreservesRangeChecks)
{
    for (const uint64_t bits : std::array<uint64_t, 5>{ 14, 15, 28, 68, 253 }) {
        for (const size_t shape : std::array<size_t, 3>{ 0, 1, 2 }) {
            UltraCircuitBuilder builder;
            const uint256_t value =
                shape == 0 ? uint256_t(0) : (shape == 1 ? (uint256_t(1) << bits) - 1 : uint256_t(1) << bits);
            const uint32_t index = builder.add_variable(fr(value));
            const auto limbs = builder.create_limbed_range_constraint(index, bits, 14, "native-limb-test");
            EXPECT_EQ(limbs.size(), (bits + 13) / 14);
            for (size_t i = 0; i < limbs.size(); ++i) {
                EXPECT_EQ(builder.get_variable(limbs[i]), fr((value >> (i * 14)).data[0] & uint64_t(16383)));
            }
            EXPECT_EQ(builder.failed(), shape == 2);
            if (shape == 2) {
                EXPECT_EQ(builder.err(), "native-limb-test");
            }
            EXPECT_EQ(CircuitChecker::check(builder), shape != 2);
        }
    }
}
} // namespace bb
