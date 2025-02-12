#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/bc_decomposition.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::BytecodeTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_decomposition = bb::avm2::bc_decomposition<FF>;

std::vector<uint8_t> random_bytes(size_t n)
{
    std::vector<uint8_t> bytes;
    bytes.reserve(n);
    for (size_t i = 0; i < n; ++i) {
        bytes.push_back(static_cast<uint8_t>(rand() % 256));
    }
    return bytes;
}

void init_trace(TestTraceContainer& trace)
{
    // Add first row.
    trace.set(C::precomputed_first_row, 0, 1);
}

TEST(BytecodeDecompositionConstrainingTest, EmptyRow)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, SingleBytecode)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) } }, trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40);
    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, ShortSingleBytecode)
{
    // Bytecode is shorter than the sliding window.
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(5)) } }, trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 5);
    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, MultipleBytecodes)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) },
          { .bytecode_id = 2, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(55)) } },
        trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40 + 55);
    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, MultipleBytecodesWithShortOnes)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(40)) },
          { .bytecode_id = 2, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(5)) },
          { .bytecode_id = 3, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(10)) },
          { .bytecode_id = 4, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(55)) },
          { .bytecode_id = 5, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(2)) } },
        trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 40 + 5 + 10 + 55 + 2);
    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, NegativeDeactivatedSel)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_bytes_rem_inv = FF(33).invert(),
            .bc_decomposition_bytes_remaining = 33,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_rem_inv = FF(32).invert(),
            .bc_decomposition_bytes_remaining = 32,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_rem_inv = FF(31).invert(),
            .bc_decomposition_bytes_remaining = 31,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_SEL_BYTES_REM_NON_ZERO);
    trace.set(C::bc_decomposition_sel, 2, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_SEL_BYTES_REM_NON_ZERO),
        "BC_DEC_SEL_BYTES_REM_NON_ZERO");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeDeactivateLastContract)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_bytes_rem_min_one_inv = FF(2).invert(),
            .bc_decomposition_bytes_remaining = 3,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_rem_min_one_inv = 1,
            .bc_decomposition_bytes_remaining = 2,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_rem_min_one_inv = 0,
            .bc_decomposition_bytes_remaining = 1,
            .bc_decomposition_last_of_contract = 1,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_LAST_CONTRACT_BYTES_REM_ONE);
    trace.set(C::bc_decomposition_last_of_contract, 2, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_LAST_CONTRACT_BYTES_REM_ONE),
        "BC_DEC_LAST_CONTRACT_BYTES_REM_ONE");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongInitializationFirstRow)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .precomputed_first_row = 1 },
        {
            .bc_decomposition_pc = 0,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION);
    trace.set(C::bc_decomposition_pc, 1, 7); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION),
        "BC_DEC_PC_ZERO_INITIALIZATION");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongInitializationInside)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        { .bc_decomposition_last_of_contract = 1 },
        {
            .bc_decomposition_pc = 0,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION);
    trace.set(C::bc_decomposition_pc, 1, 32); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_ZERO_INITIALIZATION),
        "BC_DEC_PC_ZERO_INITIALIZATION");
}

TEST(BytecodeDecompositionConstrainingTest, NegativePcWrongIncrement)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_pc = 5,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_pc = 6,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_last_of_contract = 1, // Required otherwise the test passes trivially
            .bc_decomposition_pc = 7,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_INCREMENT);
    trace.set(C::bc_decomposition_pc, 2, 6); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_PC_INCREMENT),
                              "BC_DEC_PC_INCREMENT");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeBytesRemWrongDecrement)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_bytes_remaining = 5,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_remaining = 4,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_bytes_remaining = 3,
            .bc_decomposition_last_of_contract = 1, // Required otherwise the test passes trivially
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_BYTES_REMAINING_DECREMENT);
    trace.set(C::bc_decomposition_bytes_remaining, 0, 4); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_BYTES_REMAINING_DECREMENT),
        "BC_DEC_BYTES_REMAINING_DECREMENT");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeMutateBytecodeId)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_id = 147,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_id = 147,
            .bc_decomposition_sel = 1,
        },
        {
            .bc_decomposition_id = 147,
            .bc_decomposition_last_of_contract = 1, // Required otherwise the test passes trivially
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_ID_CONSTANT);
    trace.set(C::bc_decomposition_id, 2, 77); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_ID_CONSTANT),
                              "BC_DEC_ID_CONSTANT");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeWrongBytesToReadNoCorrection)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_bytes_remaining = 75,
            .bc_decomposition_bytes_to_read = tracegen::DECOMPOSE_WINDOW_SIZE,
            .bc_decomposition_sel = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_OVERFLOW_CORRECTION_VALUE);
    trace.set(C::bc_decomposition_bytes_to_read, 0, 75); // Mutate to wrong value (bytes_remaining)
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_OVERFLOW_CORRECTION_VALUE),
        "BC_DEC_OVERFLOW_CORRECTION_VALUE");
}

TEST(BytecodeDecompositionConstrainingTest, NegativeWrongBytesToReadWithCorrection)
{
    TestTraceContainer trace = TestTraceContainer::from_rows({
        {
            .bc_decomposition_bytes_remaining = 13,
            .bc_decomposition_bytes_to_read = 13,
            .bc_decomposition_sel = 1,
            .bc_decomposition_sel_overflow_correction_needed = 1,
        },
    });

    check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_OVERFLOW_CORRECTION_VALUE);
    trace.set(
        C::bc_decomposition_bytes_to_read, 0, tracegen::DECOMPOSE_WINDOW_SIZE); // Mutate to wrong value (WINDOWS_SIZE)
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bc_decomposition>(trace, bc_decomposition::SR_BC_DEC_OVERFLOW_CORRECTION_VALUE),
        "BC_DEC_OVERFLOW_CORRECTION_VALUE");
}

} // namespace
} // namespace bb::avm2::constraining
