#include "barretenberg/stdlib/primitives/group/straus_lookup_table.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
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

using CircuitTypes = ::testing::Types<bb::UltraCircuitBuilder>;
TYPED_TEST_SUITE(StrausLookupTableTest, CircuitTypes);

STANDARD_TESTING_TAGS

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

    const size_t table_bits = 2;
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits);

    // Read various indices from the table
    for (size_t i = 0; i < (1ULL << table_bits); i++) {
        auto index = field_t::from_witness(&builder, i);
        auto result = table.read(index);

        // Expected value: offset_gen + i * base_point
        AffineElement expected = AffineElement(offset_gen_native + (base_point_native * i));
        EXPECT_EQ(result.get_value(), expected);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
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
    auto hints_elements =
        straus_lookup_table::compute_straus_lookup_table_hints(base_point_native, offset_gen_native, table_bits);

    std::vector<AffineElement> hints_affine;
    // Skip the first element (point_table[0]) and convert the rest to affine
    // because hints[i] should be the hint for point_table[i+1]
    for (size_t i = 1; i < hints_elements.size(); ++i) {
        hints_affine.push_back(AffineElement(hints_elements[i]));
    }

    // Create table with provided hints
    straus_lookup_table table(&builder, base_point, offset_gen, table_bits, hints_affine);

    // Verify reading works correctly
    auto index = field_t::from_witness(&builder, 5);
    auto result = table.read(index);

    AffineElement expected = AffineElement(offset_gen_native + (base_point_native * 5));
    EXPECT_EQ(result.get_value(), expected);

    EXPECT_TRUE(CircuitChecker::check(builder));
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
        auto index = field_t::from_witness(&builder, i);
        auto result = table.read(index);
        EXPECT_EQ(result.get_value(), AffineElement(offset_gen_native));
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}
