#include "barretenberg/stdlib/primitives/group/straus_lookup_table.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/test_utils.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

template <class Builder> class StrausLookupTableTest : public ::testing::Test {
  public:
    using field_t = stdlib::field_t<Builder>;
    using witness_t = stdlib::witness_t<Builder>;
    using cycle_group = stdlib::cycle_group<Builder>;
    using straus_lookup_table = stdlib::straus_lookup_table<Builder>;
    using Curve = typename Builder::EmbeddedCurve;
    using Group = typename Curve::Group;
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;
};

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder, bb::MegaCircuitBuilder>;
TYPED_TEST_SUITE(StrausLookupTableTest, CircuitTypes);

STANDARD_TESTING_TAGS

using bb::stdlib::test_utils::check_circuit_and_gate_count;

/**
 * @brief Test table construction
 */
TYPED_TEST(StrausLookupTableTest, TestTableConstuction)
{
    using Builder = TypeParam;
    using cycle_group = typename TestFixture::cycle_group;
    using straus_lookup_table = typename TestFixture::straus_lookup_table;
    using Element = typename TestFixture::Element;

    Builder builder;

    auto base_point_native = Element::random_element(&engine);
    auto offset_gen_native = Element::random_element(&engine);

    auto base_point = cycle_group::from_witness(&builder, base_point_native);
    auto offset_gen = cycle_group::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 4;
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits);

    if constexpr (std::is_same_v<TypeParam, bb::UltraCircuitBuilder>) {
        check_circuit_and_gate_count(builder, 192);
    } else {
        check_circuit_and_gate_count(builder, 189);
    }
}

/**
 * @brief Test reading from lookup table
 */
TYPED_TEST(StrausLookupTableTest, TestTableRead)
{
    using Builder = TypeParam;
    using cycle_group = typename TestFixture::cycle_group;
    using straus_lookup_table = typename TestFixture::straus_lookup_table;
    using field_t = typename TestFixture::field_t;
    using Element = typename TestFixture::Element;
    using AffineElement = typename TestFixture::AffineElement;

    Builder builder;

    auto base_point_native = Element::random_element(&engine);
    auto offset_gen_native = Element::random_element(&engine);

    auto base_point = cycle_group::from_witness(&builder, base_point_native);
    auto offset_gen = cycle_group::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 4;
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits);

    // Read from the table at each index and verify the result vs expected value
    const size_t table_size = (1ULL << table_bits);
    for (size_t i = 0; i < table_size; i++) {
        auto index = field_t::from_witness(&builder, typename field_t::native(i));
        auto result = table.read(index);

        // Expected value: offset_gen + i * base_point
        AffineElement expected = AffineElement(offset_gen_native + (base_point_native * i));
        EXPECT_EQ(result.get_value(), expected);
    }

    // Gate count difference explanation:
    // Mega pre-adds constants {0, 3, 4, 8} for ECC op codes during construction. When setting ROM elements at indices
    // {3, 4, 8}, Mega doesn't need to add a corresponding gate for the constant value, whereas Ultra does.
    if constexpr (std::is_same_v<TypeParam, bb::UltraCircuitBuilder>) {
        check_circuit_and_gate_count(builder, 224);
    } else {
        check_circuit_and_gate_count(builder, 221);
    }
}

/**
 * @brief Test with provided hints
 */
TYPED_TEST(StrausLookupTableTest, TestWithProvidedHints)
{
    using Builder = TypeParam;
    using cycle_group = typename TestFixture::cycle_group;
    using straus_lookup_table = typename TestFixture::straus_lookup_table;
    using field_t = typename TestFixture::field_t;
    using Element = typename TestFixture::Element;
    using AffineElement = typename TestFixture::AffineElement;

    Builder builder;

    auto base_point_native = Element::random_element(&engine);
    auto offset_gen_native = Element::random_element(&engine);

    auto base_point = cycle_group::from_witness(&builder, base_point_native);
    auto offset_gen = cycle_group::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 3;

    // Compute hints explicitly
    auto hints_elements = straus_lookup_table::compute_native_table(base_point_native, offset_gen_native, table_bits);

    std::vector<AffineElement> hints_affine;
    // Skip the first element (point_table[0]) and convert the rest to affine
    // because hints[i] should be the hint for point_table[i+1]
    for (size_t i = 1; i < hints_elements.size(); ++i) {
        hints_affine.push_back(AffineElement(hints_elements[i]));
    }

    // Create table with provided hints
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits, hints_affine);

    // Verify reading works correctly
    auto index_val = 5;
    auto index = field_t::from_witness(&builder, typename field_t::native(index_val));
    auto result = table.read(index);

    AffineElement expected = AffineElement(offset_gen_native + (base_point_native * index_val));
    EXPECT_EQ(result.get_value(), expected);

    // Gate count difference explanation:
    // Same as TestTableRead - ROM with 8 elements (indices 0-7).
    if constexpr (std::is_same_v<TypeParam, bb::UltraCircuitBuilder>) {
        check_circuit_and_gate_count(builder, 106);
    } else {
        check_circuit_and_gate_count(builder, 104);
    }
}

/**
 * @brief Test with point at infinity as base point
 */
TYPED_TEST(StrausLookupTableTest, TestInfinityBasePoint)
{
    using Builder = TypeParam;
    using cycle_group = typename TestFixture::cycle_group;
    using straus_lookup_table = typename TestFixture::straus_lookup_table;
    using field_t = typename TestFixture::field_t;
    using Element = typename TestFixture::Element;
    using AffineElement = typename TestFixture::AffineElement;
    using Group = typename TestFixture::Group;

    Builder builder;

    auto base_point_native = Group::point_at_infinity;
    auto offset_gen_native = Element::random_element(&engine);

    auto base_point = cycle_group::from_witness(&builder, base_point_native);
    auto offset_gen = cycle_group::from_witness(&builder, offset_gen_native);

    const size_t table_bits = 2;
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits);

    // All entries should be just the offset generator since base_point is infinity
    for (size_t i = 0; i < (1ULL << table_bits); i++) {
        auto index = field_t::from_witness(&builder, typename field_t::native(i));
        auto result = table.read(index);
        EXPECT_EQ(result.get_value(), AffineElement(offset_gen_native));
    }

    // Same as TestTableRead - ROM with 4 elements (indices 0-3).
    if constexpr (std::is_same_v<TypeParam, bb::UltraCircuitBuilder>) {
        check_circuit_and_gate_count(builder, 68);
    } else {
        check_circuit_and_gate_count(builder, 67);
    }
}

/**
 * When table_index = 0 and all the wires contributing to the lookup term are zero, the batched denominator term in the
 * log derivative lookup relation is equal to gamma (it is independent of beta), and a malicious prover could inject a
 * fake row anywhere in the trace balancing the lookup. This test shows this bug is not possible anymore because tables
 * are indexed from 1.
 *
 */
TYPED_TEST(StrausLookupTableTest, ZeroIndexTable)
{
    using Builder = TypeParam;
    using cycle_group_ct = stdlib::cycle_group<Builder>;
    using cycle_scalar_ct = typename cycle_group_ct::cycle_scalar;

    Builder builder;

    auto base = grumpkin::g1::affine_one;
    cycle_group_ct base_ct(base);

    auto scalar_value = grumpkin::fr::random_element();
    cycle_scalar_ct scalar = cycle_scalar_ct::from_witness(&builder, scalar_value);

    std::vector<cycle_group_ct> points = { base_ct };
    std::vector<cycle_scalar_ct> scalars = { scalar };

    cycle_group_ct::fixed_batch_mul(points, scalars);

    const auto& tables = builder.get_lookup_tables();
    ASSERT_FALSE(tables.empty());
    EXPECT_EQ(tables[0].table_index, 1U) << "The first registered table should be at index 1";
}
