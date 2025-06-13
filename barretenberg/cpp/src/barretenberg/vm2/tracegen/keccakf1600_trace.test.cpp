#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/testing/keccakf1600_fixture.test.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::Field;

using R = TestTraceContainer::Row;
using C = Column;

simulation::KeccakF1600Event create_standard_event_mem_slice()
{
    simulation::KeccakF1600Event event;
    event.src_addr = 100;
    event.dst_addr = 200;
    event.space_id = 23;

    // Initialize source memory values with U64 tags and state values
    for (size_t i = 0; i < 5; i++) {
        for (size_t j = 0; j < 5; j++) {
            const uint64_t input_value = (i * 5 + j) + 1000;
            const uint64_t output_value = (i * 5 + j) + 10000;
            event.src_mem_values[i][j] = MemoryValue::from<uint64_t>(input_value);
            event.rounds[0].state[i][j] = input_value;
            if (i == 0 && j == 0) {
                event.rounds[AVM_KECCAKF1600_NUM_ROUNDS - 1].state_iota_00 = output_value;
            } else {
                event.rounds[AVM_KECCAKF1600_NUM_ROUNDS - 1].state_chi[i][j] = output_value;
            }
        }
    }

    return event;
}

TEST(KeccakF1600TraceGenTest, MemorySliceReadAndWrite)
{
    TestTraceContainer trace;
    KeccakF1600TraceBuilder builder;

    // Create a standard event
    auto event = create_standard_event_mem_slice();

    // Process the event
    builder.process_memory_slices({ event }, trace);

    // Get the rows
    auto rows = trace.as_rows();

    // Check that we have the correct number of rows (2 * AVM_KECCAKF1600_STATE_SIZE for read and write)
    EXPECT_EQ(rows.size(), 2 * AVM_KECCAKF1600_STATE_SIZE + 1); // +1 for the initial empty row

    // Check the first row of the read operation
    EXPECT_THAT(
        rows.at(1),
        AllOf(ROW_FIELD_EQ(keccak_memory_sel, 1),
              ROW_FIELD_EQ(keccak_memory_ctr, 1),
              ROW_FIELD_EQ(keccak_memory_start, 1),
              ROW_FIELD_EQ(keccak_memory_last, 0),
              ROW_FIELD_EQ(keccak_memory_ctr_end, 0),
              ROW_FIELD_EQ(keccak_memory_rw, 0),
              ROW_FIELD_EQ(keccak_memory_addr, 100),
              ROW_FIELD_EQ(keccak_memory_space_id, 23),
              ROW_FIELD_EQ(keccak_memory_val00, 1000),
              ROW_FIELD_EQ(keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
              ROW_FIELD_EQ(keccak_memory_single_tag_error, 0),
              ROW_FIELD_EQ(keccak_memory_tag_error, 0),
              ROW_FIELD_EQ(keccak_memory_ctr_inv, 1),
              ROW_FIELD_EQ(keccak_memory_ctr_min_state_size_inv, (FF(1) - FF(AVM_KECCAKF1600_STATE_SIZE)).invert()),
              ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv, 1)));

    // Check the last row of the read operation
    EXPECT_THAT(rows.at(AVM_KECCAKF1600_STATE_SIZE),
                AllOf(ROW_FIELD_EQ(keccak_memory_sel, 1),
                      ROW_FIELD_EQ(keccak_memory_ctr, AVM_KECCAKF1600_STATE_SIZE),
                      ROW_FIELD_EQ(keccak_memory_start, 0),
                      ROW_FIELD_EQ(keccak_memory_last, 1),
                      ROW_FIELD_EQ(keccak_memory_ctr_end, 1),
                      ROW_FIELD_EQ(keccak_memory_rw, 0),
                      ROW_FIELD_EQ(keccak_memory_addr, 100 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(keccak_memory_space_id, 23),
                      ROW_FIELD_EQ(keccak_memory_val00, 1000 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
                      ROW_FIELD_EQ(keccak_memory_single_tag_error, 0),
                      ROW_FIELD_EQ(keccak_memory_tag_error, 0),
                      ROW_FIELD_EQ(keccak_memory_ctr_inv, FF(AVM_KECCAKF1600_STATE_SIZE).invert()),
                      ROW_FIELD_EQ(keccak_memory_ctr_min_state_size_inv, 1),
                      ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv, 1)));

    // Check the first row of the write operation (after read operation)
    EXPECT_THAT(
        rows.at(AVM_KECCAKF1600_STATE_SIZE + 1),
        AllOf(ROW_FIELD_EQ(keccak_memory_sel, 1),
              ROW_FIELD_EQ(keccak_memory_ctr, 1),
              ROW_FIELD_EQ(keccak_memory_start, 1),
              ROW_FIELD_EQ(keccak_memory_last, 0),
              ROW_FIELD_EQ(keccak_memory_ctr_end, 0),
              ROW_FIELD_EQ(keccak_memory_rw, 1),
              ROW_FIELD_EQ(keccak_memory_addr, 200),
              ROW_FIELD_EQ(keccak_memory_space_id, 23),
              ROW_FIELD_EQ(keccak_memory_val00, 10000),
              ROW_FIELD_EQ(keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
              ROW_FIELD_EQ(keccak_memory_single_tag_error, 0),
              ROW_FIELD_EQ(keccak_memory_tag_error, 0),
              ROW_FIELD_EQ(keccak_memory_ctr_inv, 1),
              ROW_FIELD_EQ(keccak_memory_ctr_min_state_size_inv, (FF(1) - FF(AVM_KECCAKF1600_STATE_SIZE)).invert()),
              ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv, 1)));

    // Check the last row of the write operation
    EXPECT_THAT(rows.at(2 * AVM_KECCAKF1600_STATE_SIZE),
                AllOf(ROW_FIELD_EQ(keccak_memory_sel, 1),
                      ROW_FIELD_EQ(keccak_memory_ctr, AVM_KECCAKF1600_STATE_SIZE),
                      ROW_FIELD_EQ(keccak_memory_start, 0),
                      ROW_FIELD_EQ(keccak_memory_last, 1),
                      ROW_FIELD_EQ(keccak_memory_ctr_end, 1),
                      ROW_FIELD_EQ(keccak_memory_rw, 1),
                      ROW_FIELD_EQ(keccak_memory_addr, 200 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(keccak_memory_space_id, 23),
                      ROW_FIELD_EQ(keccak_memory_val00, 10000 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
                      ROW_FIELD_EQ(keccak_memory_single_tag_error, 0),
                      ROW_FIELD_EQ(keccak_memory_tag_error, 0),
                      ROW_FIELD_EQ(keccak_memory_ctr_inv, FF(AVM_KECCAKF1600_STATE_SIZE).invert()),
                      ROW_FIELD_EQ(keccak_memory_ctr_min_state_size_inv, 1),
                      ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv, 1)));
}

// We use simulation to generate the trace of a positive keccakf1600 event.
TEST(KeccakF1600TraceGenTest, MainKeccakTraceWithSimulation)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 123;
    const MemoryAddress dst_addr = 456;
    const uint32_t space_id = 23;

    testing::generate_keccak_trace(trace, { dst_addr }, { src_addr }, space_id);

    // Get the rows
    auto rows = trace.as_rows();

    // Specific checks on the first row of the keccakf1600 permutation subtrace.
    // A memory slice read is active.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(keccakf1600_start, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_read, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                      ROW_FIELD_EQ(keccakf1600_src_addr, src_addr),
                      ROW_FIELD_EQ(keccakf1600_last, 0)));

    // Check values on all rows of the keccakf1600 permutation subtrace.
    for (size_t i = 1; i < AVM_KECCAKF1600_NUM_ROUNDS + 1; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                          ROW_FIELD_EQ(keccakf1600_clk, 1),
                          ROW_FIELD_EQ(keccakf1600_round, i),
                          ROW_FIELD_EQ(keccakf1600_dst_addr, dst_addr),
                          ROW_FIELD_EQ(keccakf1600_bitwise_xor_op_id, static_cast<uint8_t>(BitwiseOperation::XOR)),
                          ROW_FIELD_EQ(keccakf1600_bitwise_and_op_id, static_cast<uint8_t>(BitwiseOperation::AND)),
                          ROW_FIELD_EQ(keccakf1600_round_cst, simulation::keccak_round_constants[i - 1]),
                          ROW_FIELD_EQ(keccakf1600_thirty_two, AVM_MEMORY_NUM_BITS),
                          ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                          ROW_FIELD_EQ(keccakf1600_error, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_no_error, 1)));
    }

    // Specific checks on the last row of the keccakf1600 permutation subtrace.
    EXPECT_THAT(rows.at(AVM_KECCAKF1600_NUM_ROUNDS),
                AllOf(ROW_FIELD_EQ(keccakf1600_start, 0),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_write, 1),
                      ROW_FIELD_EQ(keccakf1600_src_addr, 0),
                      ROW_FIELD_EQ(keccakf1600_last, 1)));
}

// We test when the memory tag is not U64 for a read value at index (1, 2).
// We check that the tag_error is 1 for this index (flattened index 7) and that
// we correctly propagate the error to the top.
// We also check that tag_min_u64_inv is correctly computed.
TEST(KeccakF1600TraceGenTest, TagErrorHandling)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 0;
    const MemoryAddress dst_addr = 200;
    const uint32_t space_id = 79;

    // Position (1,2) in the 5x5 matrix corresponds to index 7 in the flattened array
    const size_t error_offset = 7;              // (1 * 5) + 2 = 7
    const MemoryTag error_tag = MemoryTag::U32; // Using U32 instead of U64 to trigger error

    testing::generate_keccak_trace_with_tag_error(trace, dst_addr, src_addr, error_offset, error_tag, space_id);

    const auto& rows = trace.as_rows();

    // Checks on the whole active keccak_memory subtrace.
    for (size_t i = 1; i < error_offset + 2; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccak_memory_ctr, i),
                          ROW_FIELD_EQ(keccak_memory_sel, 1),
                          ROW_FIELD_EQ(keccak_memory_rw, 0),
                          ROW_FIELD_EQ(keccak_memory_ctr_end, 0),
                          ROW_FIELD_EQ(keccak_memory_tag_error, 1),
                          ROW_FIELD_EQ(keccak_memory_space_id, space_id)));
    }

    // Checks on the whole active keccak_memory subtrace except the last row.
    for (size_t i = 1; i < error_offset + 1; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccak_memory_single_tag_error, 0),
                          ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv, 1),
                          ROW_FIELD_EQ(keccak_memory_last, 0)));
    }

    // Specific checks on the last row of the active keccak_memory subtrace.
    EXPECT_THAT(
        rows.at(error_offset + 1),
        AllOf(ROW_FIELD_EQ(keccak_memory_tag_min_u64_inv,
                           (FF(static_cast<uint8_t>(error_tag)) - FF(static_cast<uint8_t>(MemoryTag::U64))).invert()),
              ROW_FIELD_EQ(keccak_memory_last, 1)));

    // Next row is not active in keccak_memory.
    EXPECT_THAT(rows.at(error_offset + 2), ROW_FIELD_EQ(keccak_memory_sel, 0));

    // Check that the keccakf1600 permutation subtrace is correct.

    // Check that the first row of the keccakf1600 permutation subtrace is correct.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                      ROW_FIELD_EQ(keccakf1600_clk, 1),
                      ROW_FIELD_EQ(keccakf1600_start, 1),
                      ROW_FIELD_EQ(keccakf1600_round, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_read, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                      ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                      ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                      ROW_FIELD_EQ(keccakf1600_tag_error, 1),
                      ROW_FIELD_EQ(keccakf1600_error, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_no_error, 0),
                      ROW_FIELD_EQ(keccakf1600_last, 0)));

    // Check values in the rows between the first and up to the last row of the keccakf1600 permutation subtrace.
    for (size_t i = 2; i < AVM_KECCAKF1600_NUM_ROUNDS + 1; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                          ROW_FIELD_EQ(keccakf1600_clk, 1),
                          ROW_FIELD_EQ(keccakf1600_start, 0),
                          ROW_FIELD_EQ(keccakf1600_round, i),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                          ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                          ROW_FIELD_EQ(keccakf1600_error, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_no_error, 0),
                          ROW_FIELD_EQ(keccakf1600_last, i == AVM_KECCAKF1600_NUM_ROUNDS ? 1 : 0)));
    }
}

// We test when the src address is out of bounds.
// We check that the src_out_of_range_error is 1 and that the sel_no_error is propagated to the bottom.
// We also check that the sel_slice_read and sel_slice_write are 0 and that row == 1 of keccak_memory
// slice is inactive.
TEST(KeccakF1600TraceGenTest, SrcAddressOutOfBounds)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;
    const MemoryAddress dst_addr = 456;
    const uint32_t space_id = 23;

    testing::generate_keccak_trace_with_slice_error(trace, dst_addr, src_addr, space_id);

    const auto& rows = trace.as_rows();

    // Check that the keccakf1600 permutation subtrace is correct.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                      ROW_FIELD_EQ(keccakf1600_round, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                      ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 1),
                      ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                      ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                      ROW_FIELD_EQ(keccakf1600_error, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_no_error, 0),
                      ROW_FIELD_EQ(keccakf1600_last, 0)));

    // Check values in the rows between the first and up to the last row of the keccakf1600 permutation subtrace.
    for (size_t i = 2; i < AVM_KECCAKF1600_NUM_ROUNDS + 1; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                          ROW_FIELD_EQ(keccakf1600_round, i),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                          ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                          ROW_FIELD_EQ(keccakf1600_error, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_no_error, 0)));
    }

    // Check that first row of keccak_memory is inactive.
    EXPECT_THAT(rows.at(1), ROW_FIELD_EQ(keccak_memory_sel, 0));
}

// We test when the dst address is out of bounds.
// We check that the src_out_of_range_error is 1 and that the sel_no_error is propagated to the bottom.
// We also check that the sel_slice_read and sel_slice_write are 0 and that row == 1 of keccak_memory
// slice is inactive.
TEST(KeccakF1600TraceGenTest, DstAddressOutOfBounds)
{
    TestTraceContainer trace;

    const MemoryAddress src_addr = 123;
    const MemoryAddress dst_addr = AVM_HIGHEST_MEM_ADDRESS - AVM_KECCAKF1600_STATE_SIZE + 2;
    const uint32_t space_id = 23;

    testing::generate_keccak_trace_with_slice_error(trace, dst_addr, src_addr, space_id);

    const auto& rows = trace.as_rows();

    // Check that the keccakf1600 permutation subtrace is correct.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                      ROW_FIELD_EQ(keccakf1600_round, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                      ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                      ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                      ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 1),
                      ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                      ROW_FIELD_EQ(keccakf1600_error, 1),
                      ROW_FIELD_EQ(keccakf1600_sel_no_error, 0),
                      ROW_FIELD_EQ(keccakf1600_last, 0)));

    // Check values in the rows between the first and up to the last row of the keccakf1600 permutation subtrace.
    for (size_t i = 2; i < AVM_KECCAKF1600_NUM_ROUNDS + 1; i++) {
        EXPECT_THAT(rows.at(i),
                    AllOf(ROW_FIELD_EQ(keccakf1600_sel, 1),
                          ROW_FIELD_EQ(keccakf1600_round, i),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_read, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_slice_write, 0),
                          ROW_FIELD_EQ(keccakf1600_src_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_dst_out_of_range_error, 0),
                          ROW_FIELD_EQ(keccakf1600_tag_error, 0),
                          ROW_FIELD_EQ(keccakf1600_error, 0),
                          ROW_FIELD_EQ(keccakf1600_sel_no_error, 0)));
    }

    // Check that first row of keccak_memory is inactive.
    EXPECT_THAT(rows.at(1), ROW_FIELD_EQ(keccak_memory_sel, 0));
}

} // namespace
} // namespace bb::avm2::tracegen
