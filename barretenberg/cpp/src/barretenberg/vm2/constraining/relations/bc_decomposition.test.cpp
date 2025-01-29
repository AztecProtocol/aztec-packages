#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/flavor_settings.hpp"
#include "barretenberg/vm2/generated/relations/bc_decomposition.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
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
    BytecodeTraceBuilder builder;
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(random_bytes(5)) } }, trace);

    EXPECT_EQ(trace.get_num_rows(), 1 + 5);
    check_relation<bc_decomposition>(trace);
}

TEST(BytecodeDecompositionConstrainingTest, MultipleBytecodes)
{
    TestTraceContainer trace;
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

} // namespace
} // namespace bb::avm2::constraining
