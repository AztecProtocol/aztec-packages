#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/keccakf1600_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::ElementsAre;
using ::testing::Field;

using R = TestTraceContainer::Row;
using C = Column;

simulation::KeccakF1600Event create_standard_event()
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
    auto event = create_standard_event();

    // Process the event
    builder.process_memory_slices({ event }, trace);

    // Get the rows
    auto rows = trace.as_rows();

    // Check that we have the correct number of rows (2 * AVM_KECCAKF1600_STATE_SIZE for read and write)
    EXPECT_EQ(rows.size(), 2 * AVM_KECCAKF1600_STATE_SIZE + 1); // +1 for the initial empty row

    // Check the first row of the read operation
    EXPECT_THAT(
        rows.at(1),
        AllOf(ROW_FIELD_EQ(R, keccak_memory_sel, 1),
              ROW_FIELD_EQ(R, keccak_memory_ctr, 1),
              ROW_FIELD_EQ(R, keccak_memory_start, 1),
              ROW_FIELD_EQ(R, keccak_memory_last, 0),
              ROW_FIELD_EQ(R, keccak_memory_rw, 0),
              ROW_FIELD_EQ(R, keccak_memory_addr, 100),
              ROW_FIELD_EQ(R, keccak_memory_space_id, 23),
              ROW_FIELD_EQ(R, keccak_memory_val00, 1000),
              ROW_FIELD_EQ(R, keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
              ROW_FIELD_EQ(R, keccak_memory_single_tag_error, 0),
              ROW_FIELD_EQ(R, keccak_memory_tag_error, 0),
              ROW_FIELD_EQ(R, keccak_memory_ctr_inv, 1),
              ROW_FIELD_EQ(R, keccak_memory_ctr_min_state_size_inv, (FF(1) - FF(AVM_KECCAKF1600_STATE_SIZE)).invert()),
              ROW_FIELD_EQ(R, keccak_memory_tag_min_u64_inv, 1)));

    // Check the last row of the read operation
    EXPECT_THAT(rows.at(AVM_KECCAKF1600_STATE_SIZE),
                AllOf(ROW_FIELD_EQ(R, keccak_memory_sel, 1),
                      ROW_FIELD_EQ(R, keccak_memory_ctr, AVM_KECCAKF1600_STATE_SIZE),
                      ROW_FIELD_EQ(R, keccak_memory_start, 0),
                      ROW_FIELD_EQ(R, keccak_memory_last, 1),
                      ROW_FIELD_EQ(R, keccak_memory_rw, 0),
                      ROW_FIELD_EQ(R, keccak_memory_addr, 100 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(R, keccak_memory_space_id, 23),
                      ROW_FIELD_EQ(R, keccak_memory_val00, 1000 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(R, keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
                      ROW_FIELD_EQ(R, keccak_memory_single_tag_error, 0),
                      ROW_FIELD_EQ(R, keccak_memory_tag_error, 0),
                      ROW_FIELD_EQ(R, keccak_memory_ctr_inv, FF(AVM_KECCAKF1600_STATE_SIZE).invert()),
                      ROW_FIELD_EQ(R, keccak_memory_ctr_min_state_size_inv, 1),
                      ROW_FIELD_EQ(R, keccak_memory_tag_min_u64_inv, 1)));

    // Check the first row of the write operation (after read operation)
    EXPECT_THAT(
        rows.at(AVM_KECCAKF1600_STATE_SIZE + 1),
        AllOf(ROW_FIELD_EQ(R, keccak_memory_sel, 1),
              ROW_FIELD_EQ(R, keccak_memory_ctr, 1),
              ROW_FIELD_EQ(R, keccak_memory_start, 1),
              ROW_FIELD_EQ(R, keccak_memory_last, 0),
              ROW_FIELD_EQ(R, keccak_memory_rw, 1),
              ROW_FIELD_EQ(R, keccak_memory_addr, 200),
              ROW_FIELD_EQ(R, keccak_memory_space_id, 23),
              ROW_FIELD_EQ(R, keccak_memory_val00, 10000),
              ROW_FIELD_EQ(R, keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
              ROW_FIELD_EQ(R, keccak_memory_single_tag_error, 0),
              ROW_FIELD_EQ(R, keccak_memory_tag_error, 0),
              ROW_FIELD_EQ(R, keccak_memory_ctr_inv, 1),
              ROW_FIELD_EQ(R, keccak_memory_ctr_min_state_size_inv, (FF(1) - FF(AVM_KECCAKF1600_STATE_SIZE)).invert()),
              ROW_FIELD_EQ(R, keccak_memory_tag_min_u64_inv, 1)));

    // Check the last row of the write operation
    EXPECT_THAT(rows.at(2 * AVM_KECCAKF1600_STATE_SIZE),
                AllOf(ROW_FIELD_EQ(R, keccak_memory_sel, 1),
                      ROW_FIELD_EQ(R, keccak_memory_ctr, AVM_KECCAKF1600_STATE_SIZE),
                      ROW_FIELD_EQ(R, keccak_memory_start, 0),
                      ROW_FIELD_EQ(R, keccak_memory_last, 1),
                      ROW_FIELD_EQ(R, keccak_memory_rw, 1),
                      ROW_FIELD_EQ(R, keccak_memory_addr, 200 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(R, keccak_memory_space_id, 23),
                      ROW_FIELD_EQ(R, keccak_memory_val00, 10000 + AVM_KECCAKF1600_STATE_SIZE - 1),
                      ROW_FIELD_EQ(R, keccak_memory_tag, static_cast<uint8_t>(MemoryTag::U64)),
                      ROW_FIELD_EQ(R, keccak_memory_single_tag_error, 0),
                      ROW_FIELD_EQ(R, keccak_memory_tag_error, 0),
                      ROW_FIELD_EQ(R, keccak_memory_ctr_inv, FF(AVM_KECCAKF1600_STATE_SIZE).invert()),
                      ROW_FIELD_EQ(R, keccak_memory_ctr_min_state_size_inv, 1),
                      ROW_FIELD_EQ(R, keccak_memory_tag_min_u64_inv, 1)));
}

// We test when the memory tag is not U64 for a read value at index (1, 2).
// We check that the tag_error is 1 for this index (flattened index7) and that
// we correctly propagate the error to the the top.
// We also check that tag_min_u64_inv is correctly computed.
// We also verify that keccak_memory_val00 is set to zero at the same row.

} // namespace
} // namespace bb::avm2::tracegen
