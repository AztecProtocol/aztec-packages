#include "barretenberg/vm2/generated/relations/calldata_hashing.hpp"
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_calldata_hashing.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_hash.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::StrictMock;

using testing::random_fields;

using simulation::EventEmitter;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using tracegen::CalldataTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using calldata_hashing = bb::avm2::calldata_hashing<FF>;
using poseidon2 = bb::avm2::poseidon2_hash<FF>;

class CalldataHashingConstrainingTest : public ::testing::Test {
  public:
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    StrictMock<MockGreaterThan> mock_gt;
    StrictMock<MockExecutionIdManager> mock_execution_id_manager;

    Poseidon2TraceBuilder poseidon2_builder;
    PrecomputedTraceBuilder precomputed_builder;
    CalldataTraceBuilder builder;
};

class CalldataHashingConstrainingTestTraceHelper : public CalldataHashingConstrainingTest {
  public:
    TestTraceContainer process_calldata_hashing_trace(std::vector<std::vector<FF>> all_calldata_fields,
                                                      std::vector<uint32_t> context_ids)
    {
        // Note: this helper expects calldata fields without the prepended separator
        Poseidon2 poseidon2 = Poseidon2(
            mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
        TestTraceContainer trace({
            { { C::precomputed_first_row, 1 } },
        });
        std::vector<simulation::CalldataEvent> events = {};
        uint32_t row = 1;
        for (uint32_t j = 0; j < all_calldata_fields.size(); j++) {
            uint32_t index = 0;
            auto calldata_fields = all_calldata_fields[j];
            auto context_id = context_ids[j];
            calldata_fields.insert(calldata_fields.begin(), GENERATOR_INDEX__PUBLIC_CALLDATA);
            auto hash = poseidon2.hash(calldata_fields);
            auto calldata_field_at = [&calldata_fields](size_t i) -> FF {
                return i < calldata_fields.size() ? calldata_fields[i] : 0;
            };
            events.push_back({
                .context_id = context_id,
                .calldata_size = static_cast<uint32_t>(all_calldata_fields[j].size()),
                .calldata = all_calldata_fields[j],
            });
            auto padding_amount = (3 - (calldata_fields.size() % 3)) % 3;
            auto num_rounds = (calldata_fields.size() + padding_amount) / 3;
            for (uint32_t i = 0; i < calldata_fields.size(); i += 3) {
                trace.set(
                    row,
                    { {
                        { C::calldata_hashing_sel, 1 },
                        { C::calldata_hashing_start, index == 0 ? 1 : 0 },
                        { C::calldata_hashing_sel_not_start, index == 0 ? 0 : 1 },
                        { C::calldata_hashing_context_id, context_id },
                        { C::calldata_hashing_calldata_size, calldata_fields.size() - 1 },
                        { C::calldata_hashing_input_len, calldata_fields.size() },
                        { C::calldata_hashing_rounds_rem, num_rounds },
                        { C::calldata_hashing_index_0_, index },
                        { C::calldata_hashing_index_1_, index + 1 },
                        { C::calldata_hashing_index_2_, index + 2 },
                        { C::calldata_hashing_input_0_, calldata_field_at(index) },
                        { C::calldata_hashing_input_1_, calldata_field_at(index + 1) },
                        { C::calldata_hashing_input_2_, calldata_field_at(index + 2) },
                        { C::calldata_hashing_output_hash, hash },
                        { C::calldata_hashing_sel_not_padding_1, (num_rounds == 1) && (padding_amount == 2) ? 0 : 1 },
                        { C::calldata_hashing_sel_not_padding_2, (num_rounds == 1) && (padding_amount > 0) ? 0 : 1 },
                        { C::calldata_hashing_latch, (num_rounds == 1) ? 1 : 0 },
                    } });
                row++;
                num_rounds--;
                index += 3;
            }
        }
        builder.process_retrieval(events, trace);
        precomputed_builder.process_misc(trace, 256);
        poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
        return trace;
    }
};

TEST_F(CalldataHashingConstrainingTest, EmptyRow)
{
    check_relation<calldata_hashing>(testing::empty_trace());
}

TEST_F(CalldataHashingConstrainingTest, SingleCalldataHashOneRow)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> calldata_fields = { 1, 2 };

    auto hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_CALLDATA, 1, 2 });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::calldata_hashing_index_1_, 1 },
            { C::calldata_hashing_index_2_, 2 },
            { C::calldata_hashing_input_0_, GENERATOR_INDEX__PUBLIC_CALLDATA },
            { C::calldata_hashing_input_1_, 1 },
            { C::calldata_hashing_input_2_, 2 },
            { C::calldata_hashing_input_len, 3 },
            { C::calldata_hashing_latch, 1 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 0 },
            { C::calldata_hashing_calldata_size, 2 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 0 },
            { C::calldata_hashing_output_hash, hash },
            { C::calldata_hashing_rounds_rem, 1 },
            { C::calldata_hashing_sel, 1 },
            { C::calldata_hashing_start, 1 },
        },
    });

    builder.process_retrieval({ { .context_id = 1, .calldata = calldata_fields } }, trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
}

TEST_F(CalldataHashingConstrainingTest, SingleCalldataHashOneElt)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> calldata_fields = { 2 };

    auto hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_CALLDATA, 2 });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::calldata_hashing_index_1_, 1 },
            { C::calldata_hashing_index_2_, 2 },
            { C::calldata_hashing_input_0_, GENERATOR_INDEX__PUBLIC_CALLDATA },
            { C::calldata_hashing_input_1_, 2 },
            { C::calldata_hashing_input_2_, 0 },
            { C::calldata_hashing_input_len, 2 },
            { C::calldata_hashing_latch, 1 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 0 },
            { C::calldata_hashing_sel_not_start, 0 },
            { C::calldata_hashing_calldata_size, 1 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 0 },
            { C::calldata_hashing_output_hash, hash },
            { C::calldata_hashing_rounds_rem, 1 },
            { C::calldata_hashing_sel, 1 },
            { C::calldata_hashing_start, 1 },
        },
    });

    builder.process_retrieval({ { .context_id = 1, .calldata = calldata_fields } }, trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
}

TEST_F(CalldataHashingConstrainingTest, EmptyCalldataHash)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> calldata_fields = {};

    auto hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_CALLDATA });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::calldata_hashing_index_1_, 1 },
            { C::calldata_hashing_index_2_, 2 },
            { C::calldata_hashing_input_0_, GENERATOR_INDEX__PUBLIC_CALLDATA },
            { C::calldata_hashing_input_1_, 0 },
            { C::calldata_hashing_input_2_, 0 },
            { C::calldata_hashing_input_len, 1 },
            { C::calldata_hashing_latch, 1 },
            { C::calldata_hashing_sel_not_padding_1, 0 },
            { C::calldata_hashing_sel_not_padding_2, 0 },
            { C::calldata_hashing_sel_not_start, 0 },
            { C::calldata_hashing_calldata_size, 0 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 0 },
            { C::calldata_hashing_output_hash, hash },
            { C::calldata_hashing_rounds_rem, 1 },
            { C::calldata_hashing_sel, 1 },
            { C::calldata_hashing_start, 1 },
        },
    });

    builder.process_retrieval({ { .context_id = 1, .calldata = calldata_fields } }, trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, EmptyCalldataHash)
{
    TestTraceContainer trace = process_calldata_hashing_trace({}, { 1 });

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, SingleCalldataHash100Fields)
{
    // The hardcoded value is taken from noir-projects/aztec-nr/aztec/src/hash.nr:
    FF hash = FF("0x191383c9f8964afd3ea8879a03b7dda65d6724773966d18dcf80e452736fc1f3");

    std::vector<FF> calldata_fields = {};
    calldata_fields.reserve(100);
    for (uint32_t i = 0; i < 100; i++) {
        calldata_fields.push_back(FF(i));
    }

    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
    EXPECT_EQ(trace.get(C::calldata_hashing_output_hash, 1), hash);
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, MultipleCalldataHash)
{
    // 50 calldata fields => hash 51 fields, no padding on 17th row
    // 100 calldata fields => hash 101 fields, one padding field on 34th row
    // 300 calldata fields  => hash 301 fields, two padding fields on 101st row
    std::vector<std::vector<FF>> all_calldata_fields = { random_fields(50), random_fields(100), random_fields(300) };

    TestTraceContainer trace = process_calldata_hashing_trace(all_calldata_fields, { 1, 2, 3 });

    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);
    uint32_t latch_row = 17;
    // First calldata:
    EXPECT_EQ(trace.get(C::calldata_hashing_latch, latch_row), 1);
    EXPECT_EQ(trace.get(C::calldata_hashing_sel_not_padding_2, latch_row), 1);
    // Second calldata:
    latch_row += 34;
    EXPECT_EQ(trace.get(C::calldata_hashing_latch, latch_row), 1);
    EXPECT_EQ(trace.get(C::calldata_hashing_sel_not_padding_2, latch_row), 0);
    EXPECT_EQ(trace.get(C::calldata_hashing_sel_not_padding_1, latch_row), 1);
    // Third calldata:
    latch_row += 101;
    EXPECT_EQ(trace.get(C::calldata_hashing_latch, latch_row), 1);
    EXPECT_EQ(trace.get(C::calldata_hashing_sel_not_padding_2, latch_row), 0);
    EXPECT_EQ(trace.get(C::calldata_hashing_sel_not_padding_1, latch_row), 0);
}

// Negative test where latch == 1 and sel == 0
TEST_F(CalldataHashingConstrainingTest, NegativeLatchNotSel)
{
    TestTraceContainer trace(
        { { { C::precomputed_first_row, 1 } }, { { C::calldata_hashing_latch, 1 }, { C::calldata_hashing_sel, 1 } } });

    check_relation<calldata_hashing>(trace, calldata_hashing::SR_SEL_TOGGLED_AT_LATCH);
    trace.set(C::calldata_hashing_sel, 1, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_SEL_TOGGLED_AT_LATCH),
                              "SEL_TOGGLED_AT_LATCH");
    // Same idea for calldata trace:
    trace.set(1,
              { {
                  { C::calldata_latch, 1 },
                  { C::calldata_sel, 1 },
              } });

    check_relation<bb::avm2::calldata<FF>>(trace, bb::avm2::calldata<FF>::SR_SEL_TOGGLED_AT_LATCH);
    trace.set(C::calldata_sel, 1, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bb::avm2::calldata<FF>>(trace, bb::avm2::calldata<FF>::SR_SEL_TOGGLED_AT_LATCH),
        "SEL_TOGGLED_AT_LATCH");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeInvalidStartAfterLatch)
{
    // Process two calldata instances:
    TestTraceContainer trace = process_calldata_hashing_trace({ random_fields(2), random_fields(3) }, { 1, 2 });
    check_relation<calldata_hashing>(trace);

    // Row = 1 is the start of the hashing for calldata with context_id = 1
    trace.set(Column::calldata_hashing_start, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_START_AFTER_LATCH),
                              "START_AFTER_LATCH");
    trace.set(Column::calldata_hashing_start, 1, 1);

    // Row = 2 is the start of the hashing for calldata with context_id = 2
    trace.set(Column::calldata_hashing_start, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_START_AFTER_LATCH),
                              "START_AFTER_LATCH");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeInvalidStartIndex)
{
    TestTraceContainer trace = process_calldata_hashing_trace({ random_fields(10) }, { 1 });
    check_relation<calldata_hashing>(trace);

    // Row = 1 is the start of the hashing for calldata with context_id = 1
    trace.set(Column::calldata_hashing_index_0_, 1, 5);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_START_INDEX_IS_ZERO),
                              "START_INDEX_IS_ZERO");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeStartIsSeparator)
{
    TestTraceContainer trace = process_calldata_hashing_trace({ random_fields(10) }, { 1 });
    check_relation<calldata_hashing>(trace);

    // Row = 1 is the start of the hashing for calldata with context_id = 1
    trace.set(Column::calldata_hashing_input_0_, 1, 5);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_START_IS_SEPARATOR),
                              "START_IS_SEPARATOR");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeInvalidIndexIncrements)
{
    TestTraceContainer trace = process_calldata_hashing_trace({ random_fields(10) }, { 1 });
    check_relation<calldata_hashing>(trace);

    // First row should have indices 0, 1, and 2
    trace.set(Column::calldata_hashing_index_1_, 1, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_INDEX_INCREMENTS_1),
                              "INDEX_INCREMENTS_1");
    trace.set(Column::calldata_hashing_index_1_, 1, 1);
    trace.set(Column::calldata_hashing_index_2_, 1, 3);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_INDEX_INCREMENTS_2),
                              "INDEX_INCREMENTS_2");
    trace.set(Column::calldata_hashing_index_2_, 1, 2);
    // Second row should have indices 3, 4, and 5
    trace.set(Column::calldata_hashing_index_0_, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_INDEX_INCREMENTS),
                              "INDEX_INCREMENTS");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeConsistency)
{
    std::vector<FF> calldata_fields = random_fields(10);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);

    // Rows 1 and 2 should deal with the same calldata:
    trace.set(Column::calldata_hashing_context_id, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_ID_CONSISTENCY),
                              "ID_CONSISTENCY");
    trace.set(Column::calldata_hashing_context_id, 2, 1);

    trace.set(Column::calldata_hashing_output_hash, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_HASH_CONSISTENCY),
                              "HASH_CONSISTENCY");
    trace.set(Column::calldata_hashing_output_hash, 2, trace.get(Column::calldata_hashing_output_hash, 1));

    trace.set(Column::calldata_hashing_calldata_size, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_SIZE_CONSISTENCY),
                              "SIZE_CONSISTENCY");
    trace.set(Column::calldata_hashing_calldata_size, 2, 10);

    // We don't directly constrain the consistency of input_len directly, but we do constrain input_len == size + 1:
    trace.set(Column::calldata_hashing_input_len, 1, 2);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<calldata_hashing>(trace, calldata_hashing::SR_CALLDATA_HASH_INPUT_LENGTH_FIELDS),
        "CALLDATA_HASH_INPUT_LENGTH_FIELDS");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeCalldataInteraction)
{
    std::vector<FF> calldata_fields = random_fields(10);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_all_interactions<CalldataTraceBuilder>(trace);

    // Row = 2 constrains the hashing for fields at calldata.pil indices 3, 4, and 5
    // Modify the index for the lookup of the first field of row 2 (= calldata_fields[2])
    trace.set(Column::calldata_hashing_index_0_, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_get_calldata_field_0_settings>(trace)),
        "Failed.*GET_CALLDATA_FIELD_0. Could not find tuple in destination.");

    // Modify the field value for the lookup of the second field of row 2 (= calldata_fields[3])
    trace.set(Column::calldata_hashing_input_1_, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_get_calldata_field_1_settings>(trace)),
        "Failed.*GET_CALLDATA_FIELD_1. Could not find tuple in destination.");

    // Modify the context id and attempt to lookup of the third field of row 2 (= calldata_fields[4])
    trace.set(Column::calldata_hashing_context_id, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_get_calldata_field_2_settings>(trace)),
        "Failed.*GET_CALLDATA_FIELD_2. Could not find tuple in destination.");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativePaddingSelectors)
{
    // 9 calldata fields => hash 10 fields => two padding fields
    std::vector<FF> calldata_fields = random_fields(9);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);

    // We cannot have padding anywhere but the last hashing row (= latch). Set padding to true on row 2:
    trace.set(Column::calldata_hashing_sel_not_padding_2, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_PADDING_END), "PADDING_END");
    trace.set(Column::calldata_hashing_sel_not_padding_2, 2, 1);

    // We cannot have input[1] is set as padding, but input[2] is not (row 4 is the final row for this calldata hash):
    trace.set(Column::calldata_hashing_sel_not_padding_2, 4, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_PADDING_CONSISTENCY),
                              "PADDING_CONSISTENCY");
    trace.set(Column::calldata_hashing_sel_not_padding_2, 4, 0);

    // We cannot have any padding with non-zero values:
    trace.set(Column::calldata_hashing_input_1_, 4, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_PADDED_BY_ZERO_1),
                              "PADDED_BY_ZERO_1");
    trace.set(Column::calldata_hashing_input_2_, 4, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_PADDED_BY_ZERO_2),
                              "PADDED_BY_ZERO_2");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativePaddingUnder)
{
    // 9 calldata fields => hash 10 fields => two padding fields
    // Attempt to underpad and insert an incorrect value at the end of the calldata
    std::vector<FF> calldata_fields = random_fields(9);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);

    // Row = 4 constrains the hashing for the last field of the calldata, plus 2 padding fields
    // We cannot claim there is only one padding field:
    trace.set(Column::calldata_hashing_sel_not_padding_1, 4, 1);
    // This will initially fail, because calldata_size = 9 = index[0] of row 4:
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_CHECK_FINAL_INDEX),
                              "CHECK_FINAL_INDEX");
    // calldata_size is constrained to be consistent every row, and to be equal to input_len - 1:
    for (uint32_t j = 1; j <= 4; j++) {
        trace.set(Column::calldata_hashing_calldata_size, j, 10);
        trace.set(Column::calldata_hashing_input_len, j, 11);
        // poseidon's input_len is only constrained at start:
        trace.set(Column::poseidon2_hash_input_len, j, 11);
    }
    // Now all relations pass...
    check_relation<calldata_hashing>(trace);
    // ...but the lookup to find field 1 will fail...
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_get_calldata_field_1_settings>(trace)),
        "Failed.*GET_CALLDATA_FIELD_1. Could not find tuple in destination.");
    // ...as will the lookup in the final row to check the calldata size against the index:
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_check_final_size_settings>(trace)),
        "Failed.*CHECK_FINAL_SIZE. Could not find tuple in destination.");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativePaddingOver)
{
    // 8 calldata fields => hash 9 fields => no padding fields
    // Attempt to overpad and omit a value at the end of the calldata
    std::vector<FF> calldata_fields = random_fields(8);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);

    // Row = 3 constrains the hashing for the last field of the calldata
    // We cannot claim there is any padding (to attempt to skip processing the last calldata field):
    trace.set(Column::calldata_hashing_sel_not_padding_2, 3, 0);
    // Since the value is non zero, and padding values must equal zero:
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_PADDED_BY_ZERO_2),
                              "PADDED_BY_ZERO_2");
    // If we set the value to zero...
    trace.set(Column::calldata_hashing_input_2_, 3, 0);
    // ...and again fiddle with the calldata sizing:
    for (uint32_t j = 1; j <= 3; j++) {
        trace.set(Column::calldata_hashing_calldata_size, j, 7);
        trace.set(Column::calldata_hashing_input_len, j, 8);
        // poseidon's input_len is only constrained at start:
        trace.set(Column::poseidon2_hash_input_len, j, 8);
    }
    // Now all relations pass...
    check_relation<calldata_hashing>(trace);
    // ...but the lookup in the final row to check the calldata size against the index will fail:
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_check_final_size_settings>(trace)),
        "Failed.*CHECK_FINAL_SIZE. Could not find tuple in destination.");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeInputLen)
{
    // 8 calldata fields => hash 9 fields => no padding fields
    // Attempt to set an incorrect input_len (and => IV value)
    std::vector<FF> calldata_fields = random_fields(8);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);

    // Set the incorrect input_len at the first row, and the lookup into poseidon will fail:
    trace.set(Column::calldata_hashing_input_len, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_poseidon2_hash_settings>(trace)),
        "Failed.*LOOKUP_CALLDATA_HASHING_POSEIDON2_HASH. Could not find tuple in destination.");

    trace.set(Column::calldata_hashing_input_len, 1, 9);
    // Set the incorrect input_len at any row, and the relation against calldata_size will fail:
    trace.set(Column::calldata_hashing_input_len, 2, 4);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<calldata_hashing>(trace, calldata_hashing::SR_CALLDATA_HASH_INPUT_LENGTH_FIELDS),
        "CALLDATA_HASH_INPUT_LENGTH_FIELDS");
    // If we force calldata_size to be the incorrect input_len - 1, its consistency across rows will fail:
    trace.set(Column::calldata_hashing_calldata_size, 2, 3);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_SIZE_CONSISTENCY),
                              "SIZE_CONSISTENCY");
    // We can force all relations to pass by maintaining consistency of incorrect values:
    for (uint32_t j = 1; j <= 3; j++) {
        trace.set(Column::calldata_hashing_calldata_size, j, 7);
        trace.set(Column::calldata_hashing_input_len, j, 8);
        // poseidon's input_len is only constrained at start:
        trace.set(Column::poseidon2_hash_input_len, j, 8);
    }
    // And setting the correct padding for an input_len of 8:
    trace.set(Column::calldata_hashing_sel_not_padding_2, 3, 0);
    trace.set(Column::calldata_hashing_input_2_, 3, 0);
    check_relation<calldata_hashing>(trace);
    // ...but the lookup in the final row to check the calldata size against the index will fail:
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<CalldataTraceBuilder, lookup_calldata_hashing_check_final_size_settings>(trace)),
        "Failed.*CHECK_FINAL_SIZE. Could not find tuple in destination.");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeRounds)
{
    std::vector<FF> calldata_fields = random_fields(8);
    TestTraceContainer trace = process_calldata_hashing_trace({ calldata_fields }, { 1 });
    check_relation<calldata_hashing>(trace);
    check_all_interactions<CalldataTraceBuilder>(trace);

    // Set the incorrect rounds_rem (should be 3 at row 1)
    trace.set(Column::calldata_hashing_rounds_rem, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_ROUNDS_DECREMENT),
                              "ROUNDS_DECREMENT");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativeOutputHash)
{
    Poseidon2 poseidon2_int =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> calldata_fields = random_fields(5);

    // Prepare a good trace for calldata hashing (minus final hash):
    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::calldata_hashing_index_1_, 1 },
            { C::calldata_hashing_index_2_, 2 },
            { C::calldata_hashing_input_0_, GENERATOR_INDEX__PUBLIC_CALLDATA },
            { C::calldata_hashing_input_1_, calldata_fields[0] },
            { C::calldata_hashing_input_2_, calldata_fields[1] },
            { C::calldata_hashing_input_len, 6 },
            { C::calldata_hashing_latch, 0 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 0 },
            { C::calldata_hashing_calldata_size, 5 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 0 },
            { C::calldata_hashing_rounds_rem, 2 },
            { C::calldata_hashing_sel, 1 },
            { C::calldata_hashing_start, 1 },
        },
        {
            { C::calldata_hashing_index_1_, 4 },
            { C::calldata_hashing_index_2_, 5 },
            { C::calldata_hashing_input_0_, calldata_fields[2] },
            { C::calldata_hashing_input_1_, calldata_fields[3] },
            { C::calldata_hashing_input_2_, calldata_fields[4] },
            { C::calldata_hashing_input_len, 6 },
            { C::calldata_hashing_latch, 1 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 1 },
            { C::calldata_hashing_calldata_size, 5 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 3 },
            { C::calldata_hashing_rounds_rem, 1 },
            { C::calldata_hashing_sel, 1 },
        },
    });

    builder.process_retrieval({ { .context_id = 1, .calldata = calldata_fields } }, trace);
    // Set the correct hash...
    auto good_hash = poseidon2_int.hash({
        GENERATOR_INDEX__PUBLIC_CALLDATA,
        calldata_fields[0],
        calldata_fields[1],
        calldata_fields[2],
        calldata_fields[3],
        calldata_fields[4],
    });
    // ...and an incorrect hash with a matching row at latch = 1:
    auto bad_hash = poseidon2_int.hash({
        0xa,
        0xb,
        0xc,
        calldata_fields[2],
        calldata_fields[3],
        calldata_fields[4],
    });
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    trace.set(Column::calldata_hashing_output_hash, 1, good_hash);
    // Set the incorrect hash to latch:
    trace.set(Column::calldata_hashing_output_hash, 2, bad_hash);
    // All lookups will pass (i.e. we successfully lookup a bad row in the poseidon trace)...
    check_all_interactions<CalldataTraceBuilder>(trace);
    // ...but since we constrain that the hash remains consistent, the relations fail:
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_HASH_CONSISTENCY),
                              "HASH_CONSISTENCY");
}

TEST_F(CalldataHashingConstrainingTestTraceHelper, NegativePoseidonInteraction)
{
    Poseidon2 poseidon2_int =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> calldata_fields = random_fields(10);

    // Prepare a good trace for calldata hashing (minus final hash):
    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::calldata_hashing_index_1_, 1 },
            { C::calldata_hashing_index_2_, 2 },
            { C::calldata_hashing_input_0_, GENERATOR_INDEX__PUBLIC_CALLDATA },
            { C::calldata_hashing_input_1_, calldata_fields[0] },
            { C::calldata_hashing_input_2_, calldata_fields[1] },
            { C::calldata_hashing_input_len, 11 },
            { C::calldata_hashing_latch, 0 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 0 },
            { C::calldata_hashing_calldata_size, 10 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 0 },
            { C::calldata_hashing_rounds_rem, 4 },
            { C::calldata_hashing_sel, 1 },
            { C::calldata_hashing_start, 1 },
        },
        {
            { C::calldata_hashing_index_1_, 4 },
            { C::calldata_hashing_index_2_, 5 },
            { C::calldata_hashing_input_0_, calldata_fields[2] },
            { C::calldata_hashing_input_1_, calldata_fields[3] },
            { C::calldata_hashing_input_2_, calldata_fields[4] },
            { C::calldata_hashing_input_len, 11 },
            { C::calldata_hashing_latch, 0 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 1 },
            { C::calldata_hashing_calldata_size, 10 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 3 },
            { C::calldata_hashing_rounds_rem, 3 },
            { C::calldata_hashing_sel, 1 },
        },
        {
            { C::calldata_hashing_index_1_, 7 },
            { C::calldata_hashing_index_2_, 8 },
            { C::calldata_hashing_input_0_, calldata_fields[5] },
            { C::calldata_hashing_input_1_, calldata_fields[6] },
            { C::calldata_hashing_input_2_, calldata_fields[7] },
            { C::calldata_hashing_input_len, 11 },
            { C::calldata_hashing_latch, 0 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 1 },
            { C::calldata_hashing_sel_not_start, 1 },
            { C::calldata_hashing_calldata_size, 10 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 6 },
            { C::calldata_hashing_rounds_rem, 2 },
            { C::calldata_hashing_sel, 1 },
        },
        {
            { C::calldata_hashing_index_1_, 10 },
            { C::calldata_hashing_index_2_, 11 },
            { C::calldata_hashing_input_0_, calldata_fields[8] },
            { C::calldata_hashing_input_1_, calldata_fields[9] },
            { C::calldata_hashing_input_2_, 0 },
            { C::calldata_hashing_input_len, 11 },
            { C::calldata_hashing_latch, 1 },
            { C::calldata_hashing_sel_not_padding_1, 1 },
            { C::calldata_hashing_sel_not_padding_2, 0 },
            { C::calldata_hashing_sel_not_start, 1 },
            { C::calldata_hashing_calldata_size, 10 },
            { C::calldata_hashing_context_id, 1 },
            { C::calldata_hashing_index_0_, 9 },
            { C::calldata_hashing_rounds_rem, 1 },
            { C::calldata_hashing_sel, 1 },
        },
    });

    builder.process_retrieval({ { .context_id = 1, .calldata = calldata_fields } }, trace);

    auto bad_hash_prepended = poseidon2_int.hash({
        0xa,
        0xb,
        0xc,
        GENERATOR_INDEX__PUBLIC_CALLDATA,
        calldata_fields[0],
        calldata_fields[1],
        calldata_fields[2],
        calldata_fields[3],
        calldata_fields[4],
        calldata_fields[5],
        calldata_fields[6],
        calldata_fields[7],
        calldata_fields[8],
        calldata_fields[9],
    });
    auto bad_hash_misordered = poseidon2_int.hash({
        GENERATOR_INDEX__PUBLIC_CALLDATA,
        calldata_fields[0],
        calldata_fields[1],
        calldata_fields[5],
        calldata_fields[6],
        calldata_fields[7],
        calldata_fields[2],
        calldata_fields[3],
        calldata_fields[4],
        calldata_fields[8],
        calldata_fields[9],
    });
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    check_relation<poseidon2>(trace);
    for (uint32_t j = 1; j <= 4; j++) {
        trace.set(Column::calldata_hashing_output_hash, j, bad_hash_prepended);
    }
    // All relations will pass, and all input values exist in the poseidon trace, but since we constrain the
    // start rows must match, the below fails at row 1:
    check_relation<calldata_hashing>(trace);
    EXPECT_THROW_WITH_MESSAGE((check_all_interactions<CalldataTraceBuilder>(trace)),
                              "Failed.*LOOKUP_CALLDATA_HASHING_POSEIDON2_HASH. .*row 1");

    for (uint32_t j = 1; j <= 4; j++) {
        trace.set(Column::calldata_hashing_output_hash, j, bad_hash_misordered);
    }
    // Again all relations will pass, but the lookup will fail at row 2 since the rounds_rem mismatch:
    check_relation<calldata_hashing>(trace);
    EXPECT_THROW_WITH_MESSAGE((check_all_interactions<CalldataTraceBuilder>(trace)),
                              "Failed.*LOOKUP_CALLDATA_HASHING_POSEIDON2_HASH. .*row 2");

    // If we try and manipulate the input_len so rounds_rem does match...
    trace.set(Column::calldata_hashing_rounds_rem, 2, 2);
    trace.set(Column::calldata_hashing_calldata_size, 2, 8);
    trace.set(Column::calldata_hashing_input_len, 2, 9);
    // (Shift by 5 for previous hash test:)
    trace.set(Column::poseidon2_hash_input_len, 3 + 5, 9);
    trace.set(Column::calldata_hashing_rounds_rem, 3, 3);
    trace.set(Column::calldata_hashing_calldata_size, 3, 12);
    trace.set(Column::calldata_hashing_input_len, 3, 13);
    // (Shift by 5 for previous hash test:)
    trace.set(Column::poseidon2_hash_input_len, 2 + 5, 13);
    // ...the poseidon trace will pass (since input_len is only constrained at start)...
    check_relation<poseidon2>(trace);
    // ...all lookups will pass...
    check_all_interactions<CalldataTraceBuilder>(trace);
    // ...but we protect against input_len manipulation with a consistency check, which would ensure incorrect values
    // fail at latch:
    EXPECT_THROW_WITH_MESSAGE(check_relation<calldata_hashing>(trace, calldata_hashing::SR_SIZE_CONSISTENCY),
                              "SIZE_CONSISTENCY");
}

} // namespace
} // namespace bb::avm2::constraining
