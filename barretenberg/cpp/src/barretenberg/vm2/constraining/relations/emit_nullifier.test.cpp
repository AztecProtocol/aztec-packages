#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/emit_nullifier.hpp"
#include "barretenberg/vm2/generated/relations/lookups_emit_nullifier.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using emit_nullifier = bb::avm2::emit_nullifier<FF>;

TEST(EmitNullifierConstrainingTest, SimpleTest)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_emit_nullifier, 1 },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_emit_nullifier, 1 },
          { C::execution_register_0_, /*nullifier=*/FF(0x789abc) },
          { C::execution_contract_address, /*contract_address=*/FF(0xcafeface) },
          { C::execution_nullifier_tree_root, FF(0xdef123) },
          { C::execution_sel_opcode_error, 0 } },
    });

    check_relation<emit_nullifier>(trace);
}

TEST(EmitNullifierConstrainingTest, NullifierCollision)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_emit_nullifier, 1 },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_emit_nullifier, 1 },
          { C::execution_register_0_, /*nullifier=*/FF(0x456789) },
          { C::execution_contract_address, /*contract_address=*/FF(0xdeadbeef) },
          { C::execution_nullifier_tree_root, FF(0x987654) },
          { C::execution_sel_opcode_error, 1 } },
    });
    check_relation<emit_nullifier>(trace);
}

TEST(EmitNullifierConstrainingTest, NegativeInvalidShouldDoFlag1)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_emit_nullifier, 1 },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_emit_nullifier, 0 } }, // Should be 1 but set to 0
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_nullifier>(trace, emit_nullifier::SR_SHOULD_DO_EMIT_NULLIFIER),
                              "SHOULD_DO_EMIT_NULLIFIER");
}

TEST(EmitNullifierConstrainingTest, NegativeInvalidShouldDoFlag2)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_emit_nullifier, 1 },
          { C::execution_should_execute_opcode, 0 },
          { C::execution_sel_should_do_emit_nullifier, 1 } }, // Should be 0 but set to 1
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<emit_nullifier>(trace, emit_nullifier::SR_SHOULD_DO_EMIT_NULLIFIER),
                              "SHOULD_DO_EMIT_NULLIFIER");
}

// TODO(dbanks12): interaction tests

} // namespace
} // namespace bb::avm2::constraining
