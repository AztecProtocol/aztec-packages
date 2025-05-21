#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/execution.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using context = bb::avm2::context<FF>;
using context_stack = bb::avm2::context_stack<FF>;

TEST(ContextStackConstrainingTest, Basic)
{
    // clang-format off
    TestTraceContainer trace({
         {{ C::context_stack_sel, 1 }, { C::context_stack_context_id, 1 }, {C::context_stack_context_id_inv, 1}},
    });
    // clang-format on

    check_relation<context_stack>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
