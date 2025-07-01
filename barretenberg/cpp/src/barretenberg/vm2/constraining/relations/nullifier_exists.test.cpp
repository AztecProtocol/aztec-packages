#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_nullifier_exists.hpp"
#include "barretenberg/vm2/generated/relations/nullifier_exists.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using nullifier_exists = bb::avm2::nullifier_exists<FF>;

TEST(NullifierExistsConstrainingTest, SimpleTest)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_register_0_, /*nullifier=*/FF(0x123456) },
          { C::execution_register_1_, /*address=*/FF(0xdeadbeef) },
          { C::execution_register_2_, /*exists=*/1 },
          { C::execution_prev_nullifier_tree_root, FF(0xabc) },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_nullifier_exists, 1 },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_sel_opcode_error, 0 } },
    });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, NullifierNotExists)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_register_0_, /*nullifier=*/FF(0x789abc) },
          { C::execution_register_1_, /*address=*/FF(0xcafeface) },
          { C::execution_register_2_, /*exists=*/0 },
          { C::execution_prev_nullifier_tree_root, FF(0xdef) },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_nullifier_exists, 1 },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::U1) },
          { C::execution_sel_opcode_error, 0 } },
    });
    check_relation<nullifier_exists>(trace);
}

TEST(NullifierExistsConstrainingTest, NegativeInvalidShouldDoFlag1)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_should_execute_opcode, 1 },
          { C::execution_sel_should_do_nullifier_exists, 0 } }, // Should be 1 but set to 0
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_exists>(trace, nullifier_exists::SR_SHOULD_DO_NULLIFIER_EXISTS),
                              "SHOULD_DO_NULLIFIER_EXISTS");
}

TEST(NullifierExistsConstrainingTest, NegativeInvalidShouldDoFlag2)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_should_execute_opcode, 0 },
          { C::execution_sel_should_do_nullifier_exists, 1 } }, // Should be 0 but set to 1
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_exists>(trace, nullifier_exists::SR_SHOULD_DO_NULLIFIER_EXISTS),
                              "SHOULD_DO_NULLIFIER_EXISTS");
}

TEST(NullifierExistsConstrainingTest, NegativeInvalidMemoryTag)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_sel_should_do_nullifier_exists, 1 },
          { C::execution_mem_tag_reg_2_, static_cast<uint8_t>(MemoryTag::FF) } }, // Should be U1 for exists result
    });
    EXPECT_THROW_WITH_MESSAGE(check_relation<nullifier_exists>(trace, nullifier_exists::SR_NULLIFIER_EXISTS_U1_TAG),
                              "NULLIFIER_EXISTS_U1_TAG");
}

TEST(NullifierExistsConstrainingTest, NegativeOpcodeErrorButOpcodeHasNoError)
{
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_nullifier_exists, 1 },
          { C::execution_sel_should_do_nullifier_exists, 1 },
          { C::execution_sel_opcode_error, 1 } }, // Error should prevent should_do flag
    });
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<nullifier_exists>(trace, nullifier_exists::SR_NULLIFIER_EXISTS_HAS_NO_OPCODE_ERROR),
        "NULLIFIER_EXISTS_HAS_NO_OPCODE_ERROR");
}

// TODO(dbanks12): interaction tests

} // namespace
} // namespace bb::avm2::constraining
