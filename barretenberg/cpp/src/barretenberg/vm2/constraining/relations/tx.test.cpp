#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using tx = bb::avm2::tx<FF>;

TEST(TxExecutionConstrainingTest, Basic)
{
    // clang-format off
    TestTraceContainer trace({
         {{ C::execution_sel, 1 }, { C::execution_pc, 0 }},
         {{ C::execution_sel, 1 }, { C::execution_pc, 20 }, { C::execution_last, 1 }}
    });
    // clang-format on

    check_relation<tx>(trace);
}

TEST(TxExecutionConstrainingTest, Continuity)
{
    // clang-format off
    TestTraceContainer trace({
        {{ C::precomputed_first_row, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }},
        {{ C::execution_sel, 1 }, {C::execution_last, 1}},
    });
    // clang-format on
}

} // namespace
} // namespace bb::avm2::constraining
