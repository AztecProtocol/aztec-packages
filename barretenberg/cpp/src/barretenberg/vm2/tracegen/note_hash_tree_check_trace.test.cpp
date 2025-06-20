#include "barretenberg/vm2/tracegen/note_hash_tree_check_trace.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/simulation/events/note_hash_tree_check_event.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using simulation::CheckPointEventType;
using simulation::NoteHashAppendData;
using simulation::NoteHashTreeCheckEvent;
using simulation::NoteHashTreeReadWriteEvent;

using ::testing::AllOf;
using ::testing::ElementsAre;

TEST(NoteHashTreeCheckTracegenTest, DiscardNestedReverts)
{
    std::vector<NoteHashTreeCheckEvent> events = {
        CheckPointEventType::CREATE_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1000,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 0,
                                        } },

        CheckPointEventType::CREATE_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1001,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 1,
                                        } },
        CheckPointEventType::REVERT_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1002,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 1,
                                        } },
        CheckPointEventType::REVERT_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1003,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 0,
                                        } },
    };

    NoteHashTreeCheckTraceBuilder builder;
    TestTraceContainer trace;
    builder.process(events, trace);
    EXPECT_EQ(trace.as_rows().size(), 4);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1000),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 0),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 1)),
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1001),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 1)),
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1002),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 1)),
                            // Not discarded
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1003),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 0),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 0))));
}

TEST(NoteHashTreeCheckTracegenTest, DiscardSequentialReverts)
{
    std::vector<NoteHashTreeCheckEvent> events = {
        NoteHashTreeReadWriteEvent{ .note_hash = 1000,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 0,
                                        } },

        CheckPointEventType::CREATE_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1001,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 1,
                                        } },
        CheckPointEventType::REVERT_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1002,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 1,
                                        } },
        CheckPointEventType::CREATE_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1003,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 2,
                                        } },
        CheckPointEventType::REVERT_CHECKPOINT,
        NoteHashTreeReadWriteEvent{ .note_hash = 1004,
                                    .append_data =
                                        NoteHashAppendData{
                                            .note_hash_counter = 2,
                                        } },
    };

    NoteHashTreeCheckTraceBuilder builder;
    TestTraceContainer trace;
    builder.process(events, trace);
    EXPECT_EQ(trace.as_rows().size(), 5);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1000),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 0),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 0)),
                            // First discarded checkpoint
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1001),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 1)),
                            // End first discarded checkpoint
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1002),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 0)),
                            // Second discarded checkpoint
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1003),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 2),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 1)),
                            // End second discarded checkpoint
                            AllOf(ROW_FIELD_EQ(note_hash_tree_check_sel, 1),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash, 1004),
                                  ROW_FIELD_EQ(note_hash_tree_check_note_hash_index, 2),
                                  ROW_FIELD_EQ(note_hash_tree_check_discard, 0))));
}

} // namespace
} // namespace bb::avm2::tracegen
