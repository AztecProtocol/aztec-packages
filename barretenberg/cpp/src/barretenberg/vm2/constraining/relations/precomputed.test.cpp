#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/precomputed.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using precomputed = bb::avm2::precomputed<FF>;

TEST(PrecomputedConstrainingTest, EmptyRow)
{
    check_relation<precomputed>(testing::empty_trace());
}

TEST(PrecomputedConstrainingTest, GranularSelectorsOnRange16)
{
    // All granular selectors high on a row where sel_range_16 is also high: subset holds.
    TestTraceContainer trace({ {
        { C::precomputed_sel_range_16, 1 },
        { C::precomputed_sel_range_16_active, 1 },
        { C::precomputed_sel_bitwise, 1 },
        { C::precomputed_sel_addressing_gas, 1 },
    } });

    check_relation<precomputed>(trace, precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16);
}

TEST(PrecomputedConstrainingTest, NegativeRange16ActiveOnRange16)
{
    // sel_range_16_active high while sel_range_16 is low: subset violated.
    TestTraceContainer trace({ {
        { C::precomputed_sel_range_16, 0 },
        { C::precomputed_sel_range_16_active, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<precomputed>(trace, precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16),
                              precomputed::get_subrelation_label(precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16));
}

TEST(PrecomputedConstrainingTest, NegativeBitwiseOnRange16)
{
    // sel_bitwise high while sel_range_16 is low: subset violated.
    TestTraceContainer trace({ {
        { C::precomputed_sel_range_16, 0 },
        { C::precomputed_sel_bitwise, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<precomputed>(trace, precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16),
                              precomputed::get_subrelation_label(precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16));
}

TEST(PrecomputedConstrainingTest, NegativeAddressingGasOnRange16)
{
    // sel_addressing_gas high while sel_range_16 is low: subset violated.
    TestTraceContainer trace({ {
        { C::precomputed_sel_range_16, 0 },
        { C::precomputed_sel_addressing_gas, 1 },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<precomputed>(trace, precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16),
                              precomputed::get_subrelation_label(precomputed::SR_GRANULAR_SELECTORS_ON_RANGE_16));
}

} // namespace
} // namespace bb::avm2::constraining
