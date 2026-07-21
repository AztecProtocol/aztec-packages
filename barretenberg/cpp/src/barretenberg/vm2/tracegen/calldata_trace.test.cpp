#include <algorithm>
#include <cmath>
#include <cstddef>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <sys/types.h>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using bb::avm2::testing::random_fields;
using testing::SizeIs;

namespace bb::avm2::tracegen {
namespace {

using C = Column;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

TEST(CalldataTraceGenTest, BasicHashing)
{
    TestTraceContainer trace;
    CalldataTraceBuilder builder;

    const auto calldata_hash = RawPoseidon2::hash({ DOM_SEP__PUBLIC_CALLDATA, 10, 20, 30 });

    builder.process_hashing(
        {
            simulation::CalldataEvent{
                .context_id = 1,
                .calldata = { 10, 20, 30 },
                .calldata_hash = calldata_hash,
            },
        },
        trace);
    const auto rows = trace.as_rows();

    // One extra empty row is prepended.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                      ROW_FIELD_EQ(calldata_hashing_start, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_start, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, 1),
                      ROW_FIELD_EQ(calldata_hashing_end, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, 0),
                      ROW_FIELD_EQ(calldata_hashing_context_id, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_0_, 0),
                      ROW_FIELD_EQ(calldata_hashing_index_1_, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_2_, 2),
                      ROW_FIELD_EQ(calldata_hashing_input_0_, DOM_SEP__PUBLIC_CALLDATA),
                      ROW_FIELD_EQ(calldata_hashing_input_1_, 10),
                      ROW_FIELD_EQ(calldata_hashing_input_2_, 20),
                      ROW_FIELD_EQ(calldata_hashing_calldata_size, 3),
                      ROW_FIELD_EQ(calldata_hashing_input_len, 4),
                      ROW_FIELD_EQ(calldata_hashing_rounds_rem, 2),
                      ROW_FIELD_EQ(calldata_hashing_output_hash, calldata_hash)));

    // End row
    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                      ROW_FIELD_EQ(calldata_hashing_start, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_start, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, 0),
                      ROW_FIELD_EQ(calldata_hashing_end, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, 1),
                      ROW_FIELD_EQ(calldata_hashing_context_id, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_0_, 3),
                      ROW_FIELD_EQ(calldata_hashing_index_1_, 4),
                      ROW_FIELD_EQ(calldata_hashing_index_2_, 5),
                      ROW_FIELD_EQ(calldata_hashing_input_0_, 30),
                      ROW_FIELD_EQ(calldata_hashing_input_1_, 0),
                      ROW_FIELD_EQ(calldata_hashing_input_2_, 0),
                      ROW_FIELD_EQ(calldata_hashing_calldata_size, 3),
                      ROW_FIELD_EQ(calldata_hashing_input_len, 4),
                      ROW_FIELD_EQ(calldata_hashing_rounds_rem, 1),
                      ROW_FIELD_EQ(calldata_hashing_output_hash, calldata_hash)));
}

TEST(CalldataTraceGenTest, BasicRetrievalAndHashing)
{
    TestTraceContainer trace;
    CalldataTraceBuilder builder;

    const auto calldata_hash_1 = RawPoseidon2::hash({ DOM_SEP__PUBLIC_CALLDATA, 1, 2 });
    const auto calldata_hash_2 = RawPoseidon2::hash({ DOM_SEP__PUBLIC_CALLDATA, 3 });

    // Must be sorted by context_id in ascending order.
    const auto events = { simulation::CalldataEvent{
                              .context_id = 1,
                              .calldata = { 1, 2 },
                              .calldata_hash = calldata_hash_1,
                          },
                          simulation::CalldataEvent{
                              .context_id = 3,
                              .calldata = { 3 },
                              .calldata_hash = calldata_hash_2,
                          } };

    builder.process_retrieval(events, trace);
    builder.process_hashing(events, trace);
    const auto rows = trace.as_rows();

    // One extra empty row is prepended.
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(calldata_sel, 1),
                      ROW_FIELD_EQ(calldata_end, 0),
                      ROW_FIELD_EQ(calldata_context_id, 1),
                      ROW_FIELD_EQ(calldata_index, 1),
                      ROW_FIELD_EQ(calldata_value, 1)));
    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(calldata_sel, 1),
                      ROW_FIELD_EQ(calldata_end, 1),
                      ROW_FIELD_EQ(calldata_context_id, 1),
                      ROW_FIELD_EQ(calldata_index, 2),
                      ROW_FIELD_EQ(calldata_value, 2)));
    EXPECT_THAT(rows.at(3),
                AllOf(ROW_FIELD_EQ(calldata_sel, 1),
                      ROW_FIELD_EQ(calldata_end, 1),
                      ROW_FIELD_EQ(calldata_context_id, 3),
                      ROW_FIELD_EQ(calldata_index, 1),
                      ROW_FIELD_EQ(calldata_value, 3)));
    // Hashing tracegen:
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                      ROW_FIELD_EQ(calldata_hashing_start, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_start, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, 1),
                      ROW_FIELD_EQ(calldata_hashing_end, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, 1),
                      ROW_FIELD_EQ(calldata_hashing_context_id, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_0_, 0),
                      ROW_FIELD_EQ(calldata_hashing_index_1_, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_2_, 2),
                      ROW_FIELD_EQ(calldata_hashing_input_0_, DOM_SEP__PUBLIC_CALLDATA),
                      ROW_FIELD_EQ(calldata_hashing_input_1_, 1),
                      ROW_FIELD_EQ(calldata_hashing_input_2_, 2),
                      ROW_FIELD_EQ(calldata_hashing_calldata_size, 2),
                      ROW_FIELD_EQ(calldata_hashing_input_len, 3),
                      ROW_FIELD_EQ(calldata_hashing_rounds_rem, 1),
                      ROW_FIELD_EQ(calldata_hashing_output_hash, calldata_hash_1)));

    EXPECT_THAT(rows.at(2),
                AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                      ROW_FIELD_EQ(calldata_hashing_start, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_start, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, 0),
                      ROW_FIELD_EQ(calldata_hashing_end, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, 1),
                      ROW_FIELD_EQ(calldata_hashing_context_id, 3),
                      ROW_FIELD_EQ(calldata_hashing_index_0_, 0),
                      ROW_FIELD_EQ(calldata_hashing_index_1_, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_2_, 2),
                      ROW_FIELD_EQ(calldata_hashing_input_0_, DOM_SEP__PUBLIC_CALLDATA),
                      ROW_FIELD_EQ(calldata_hashing_input_1_, 3),
                      ROW_FIELD_EQ(calldata_hashing_input_2_, 0),
                      ROW_FIELD_EQ(calldata_hashing_calldata_size, 1),
                      ROW_FIELD_EQ(calldata_hashing_input_len, 2),
                      ROW_FIELD_EQ(calldata_hashing_rounds_rem, 1),
                      ROW_FIELD_EQ(calldata_hashing_output_hash, calldata_hash_2)));
}

TEST(CalldataTraceGenTest, BasicRetrievalAndHashingEmpty)
{
    TestTraceContainer trace;
    CalldataTraceBuilder builder;

    const auto calldata_hash = RawPoseidon2::hash({ DOM_SEP__PUBLIC_CALLDATA });

    const auto events = { simulation::CalldataEvent{
        .context_id = 12,
        .calldata = {},
        .calldata_hash = calldata_hash,
    } };

    builder.process_retrieval(events, trace);
    builder.process_hashing(events, trace);
    const auto rows = trace.as_rows();

    // One extra empty row is prepended.

    // Retrieval tracegen should NOT create a row for empty calldata (no special row needed
    // since sel_end_not_empty = 0 for empty calldata, so no permutation entry is required).
    EXPECT_THAT(rows.at(1), AllOf(ROW_FIELD_EQ(calldata_sel, 0), ROW_FIELD_EQ(calldata_end, 0)));
    // Hashing tracegen should set the output hash as H(sep):
    EXPECT_THAT(rows.at(1),
                AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                      ROW_FIELD_EQ(calldata_hashing_start, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_start, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 0),
                      ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, 0),
                      ROW_FIELD_EQ(calldata_hashing_end, 1),
                      ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, 0),
                      ROW_FIELD_EQ(calldata_hashing_context_id, 12),
                      ROW_FIELD_EQ(calldata_hashing_index_0_, 0),
                      ROW_FIELD_EQ(calldata_hashing_index_1_, 1),
                      ROW_FIELD_EQ(calldata_hashing_index_2_, 2),
                      ROW_FIELD_EQ(calldata_hashing_input_0_, DOM_SEP__PUBLIC_CALLDATA),
                      ROW_FIELD_EQ(calldata_hashing_input_1_, 0),
                      ROW_FIELD_EQ(calldata_hashing_input_2_, 0),
                      ROW_FIELD_EQ(calldata_hashing_calldata_size, 0),
                      ROW_FIELD_EQ(calldata_hashing_input_len, 1),
                      ROW_FIELD_EQ(calldata_hashing_rounds_rem, 1),
                      ROW_FIELD_EQ(calldata_hashing_output_hash, calldata_hash)));
}

TEST(CalldataTraceGenTest, LongerHash)
{
    TestTraceContainer trace;
    CalldataTraceBuilder builder;

    std::vector<FF> calldata = random_fields(100);
    std::vector<FF> preimage = { DOM_SEP__PUBLIC_CALLDATA };
    preimage.insert(preimage.end(), calldata.begin(), calldata.end());
    FF output_hash = RawPoseidon2::hash(preimage);

    builder.process_hashing(
        {
            simulation::CalldataEvent{
                .context_id = 1,
                .calldata = calldata,
                .calldata_hash = output_hash,
            },
        },
        trace);
    const auto rows = trace.as_rows();
    // Omit the prepended first row:
    const auto calldata_rows = std::span(rows.begin() + 1, rows.end());

    // 100 field calldata => hash 101 fields => 34 poseidon chunks
    EXPECT_THAT(calldata_rows, SizeIs(34));

    uint32_t expected_index = 0;
    for (auto row : calldata_rows) {
        // Elts which should match each row:
        EXPECT_THAT(row,
                    AllOf(ROW_FIELD_EQ(calldata_hashing_sel, 1),
                          ROW_FIELD_EQ(calldata_hashing_context_id, 1),
                          ROW_FIELD_EQ(calldata_hashing_calldata_size, 100),
                          ROW_FIELD_EQ(calldata_hashing_input_len, 101),
                          ROW_FIELD_EQ(calldata_hashing_output_hash, output_hash)));

        // Elts which change each row:
        EXPECT_THAT(
            row,
            AllOf(ROW_FIELD_EQ(calldata_hashing_index_0_, expected_index),
                  ROW_FIELD_EQ(calldata_hashing_index_1_, expected_index + 1),
                  ROW_FIELD_EQ(calldata_hashing_index_2_, expected_index + 2),
                  ROW_FIELD_EQ(calldata_hashing_input_0_, preimage.at(expected_index)),
                  ROW_FIELD_EQ(calldata_hashing_input_1_, preimage.at(expected_index + 1)),
                  // The final value is padded:
                  ROW_FIELD_EQ(calldata_hashing_input_2_, expected_index == 99 ? 0 : preimage.at(expected_index + 2)),
                  ROW_FIELD_EQ(calldata_hashing_rounds_rem, 34 - (expected_index / 3))));

        // Elts for start/end rows:
        EXPECT_THAT(row,
                    AllOf(ROW_FIELD_EQ(calldata_hashing_start, expected_index == 0 ? 1 : 0),
                          ROW_FIELD_EQ(calldata_hashing_sel_not_start, expected_index == 0 ? 0 : 1),
                          ROW_FIELD_EQ(calldata_hashing_end, expected_index == 99 ? 1 : 0),
                          ROW_FIELD_EQ(calldata_hashing_sel_end_not_empty, expected_index == 99 ? 1 : 0),
                          ROW_FIELD_EQ(calldata_hashing_sel_not_padding_1, 1),
                          // The final value is padded:
                          ROW_FIELD_EQ(calldata_hashing_sel_not_padding_2, expected_index == 99 ? 0 : 1)));

        expected_index += 3;
    }
}

} // namespace
} // namespace bb::avm2::tracegen
