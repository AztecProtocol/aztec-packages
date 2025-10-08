#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/lookups_bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_hash.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using ::testing::StrictMock;

using testing::random_bytes;
using testing::random_fields;

using simulation::EventEmitter;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using tracegen::BytecodeTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_hashing = bb::avm2::bc_hashing<FF>;
using poseidon2 = bb::avm2::poseidon2_hash<FF>;

class BytecodeHashingConstrainingTest : public ::testing::Test {
  public:
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    StrictMock<MockGreaterThan> mock_gt;
    StrictMock<MockExecutionIdManager> mock_execution_id_manager;

    Poseidon2TraceBuilder poseidon2_builder;
    PrecomputedTraceBuilder precomputed_builder;
    BytecodeTraceBuilder builder;
};

class BytecodeHashingConstrainingTestTraceHelper : public BytecodeHashingConstrainingTest {
  public:
    TestTraceContainer process_bc_hashing_trace(std::vector<std::vector<FF>> all_bytecode_fields,
                                                std::vector<uint32_t> bytecode_ids)
    {
        // Note: this helper expects bytecode fields without the prepended separator and does not complete decomposition
        Poseidon2 poseidon2 = Poseidon2(
            mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
        TestTraceContainer trace({
            { { C::precomputed_first_row, 1 } },
        });
        uint32_t row = 1;
        for (uint32_t j = 0; j < all_bytecode_fields.size(); j++) {
            uint32_t pc_index = 0;
            auto bytecode_fields = all_bytecode_fields[j];
            auto bytecode_id = bytecode_ids[j];
            bytecode_fields.insert(bytecode_fields.begin(), GENERATOR_INDEX__PUBLIC_BYTECODE);
            auto hash = poseidon2.hash(bytecode_fields);
            auto bytecode_field_at = [&bytecode_fields](size_t i) -> FF {
                return i < bytecode_fields.size() ? bytecode_fields[i] : 0;
            };
            auto padding_amount = (3 - (bytecode_fields.size() % 3)) % 3;
            auto num_rounds = (bytecode_fields.size() + padding_amount) / 3;
            for (uint32_t i = 0; i < bytecode_fields.size(); i += 3) {
                bool start = i == 0;
                bool end = i + 3 >= bytecode_fields.size();
                auto pc_index_1 = start ? 0 : pc_index + 31;
                trace.set(row,
                          { {
                              { C::bc_hashing_bytecode_id, bytecode_id },
                              { C::bc_hashing_latch, end },
                              { C::bc_hashing_output_hash, hash },
                              { C::bc_hashing_input_len, bytecode_fields.size() },
                              { C::bc_hashing_rounds_rem, num_rounds },
                              { C::bc_hashing_packed_fields_0, bytecode_field_at(i) },
                              { C::bc_hashing_packed_fields_1, bytecode_field_at(i + 1) },
                              { C::bc_hashing_packed_fields_2, bytecode_field_at(i + 2) },
                              { C::bc_hashing_pc_index, pc_index },
                              { C::bc_hashing_pc_index_1, pc_index_1 },
                              { C::bc_hashing_pc_index_2, pc_index_1 + 31 },
                              { C::bc_hashing_sel, 1 },
                              { C::bc_hashing_sel_not_padding_1, end && padding_amount == 2 ? 0 : 1 },
                              { C::bc_hashing_sel_not_padding_2, end && padding_amount > 0 ? 0 : 1 },
                              { C::bc_hashing_sel_not_start, !start },
                              { C::bc_hashing_start, start },
                          } });
                if (end) {
                    // TODO(MW): Cleanup: below sets the pc at which the final field starts.
                    // It can't just be pc_index + 31 * padding_amount because we 'skip' 31 bytes at start == 1 to force
                    // the first field to be the separator.
                    trace.set(row,
                              { {
                                  { C::bc_hashing_pc_at_final_field,
                                    padding_amount == 2 ? pc_index : pc_index_1 + (31 * (1 - padding_amount)) },
                              } });
                }
                row++;
                num_rounds--;
                pc_index = pc_index_1 + 62;
            }
        }
        precomputed_builder.process_misc(trace, 256);
        poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
        return trace;
    }
};

TEST_F(BytecodeHashingConstrainingTest, EmptyRow)
{
    check_relation<bc_hashing>(testing::empty_trace());
}

TEST_F(BytecodeHashingConstrainingTest, SingleBytecodeHashOneRow)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    std::vector<FF> bytecode_fields = { 1, 2 };
    std::vector<uint8_t> bytecode = {};

    for (auto bytecode_field : bytecode_fields) {
        auto bytes = to_buffer(bytecode_field);
        // Each field elt of encoded bytecode represents 31 bytes, hence start at +1:
        bytecode.insert(bytecode.end(), bytes.begin() + 1, bytes.end());
    }

    auto hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_BYTECODE, 1, 2 });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::bc_hashing_input_len, 3 },
            { C::bc_hashing_latch, 1 },
            { C::bc_hashing_packed_fields_0, GENERATOR_INDEX__PUBLIC_BYTECODE },
            { C::bc_hashing_packed_fields_1, 1 },
            { C::bc_hashing_packed_fields_2, 2 },
            { C::bc_hashing_pc_at_final_field, 31 },
            { C::bc_hashing_pc_index_1, 0 },
            { C::bc_hashing_pc_index_2, 31 },
            { C::bc_hashing_sel_not_padding_1, 1 },
            { C::bc_hashing_sel_not_padding_2, 1 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, hash },
            { C::bc_hashing_pc_index, 0 },
            { C::bc_hashing_rounds_rem, 1 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_start, 1 },
        },
    });

    precomputed_builder.process_misc(trace, 3);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<bc_hashing>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, SingleBytecodeHash100Fields)
{
    // The hardcoded value is taken from noir-projects/aztec-nr/aztec/src/hash.nr:
    FF hash = FF("0x16d621c3387156ef53754679e7b2c9be8f0bceeb44aa59a74991df3b0b42a0bf");

    std::vector<FF> bytecode_fields = {};
    for (uint32_t i = 1; i < 100; i++) {
        bytecode_fields.push_back(FF(i));
    }

    TestTraceContainer trace = process_bc_hashing_trace({ bytecode_fields }, { 1 });

    std::vector<uint8_t> bytecode = {};
    for (auto bytecode_field : bytecode_fields) {
        auto bytes = to_buffer(bytecode_field);
        // Each field elt of encoded bytecode represents 31 bytes, but to_buffer returns 32, hence start at +1:
        bytecode.insert(bytecode.end(), bytes.begin() + 1, bytes.end());
    }

    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    check_relation<bc_hashing>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
    EXPECT_EQ(trace.get(C::bc_hashing_output_hash, 1), hash);
}

// Note: skipping this for now as it takes ~4s
TEST_F(BytecodeHashingConstrainingTestTraceHelper, SingleBytecodeHashMax)
{
    GTEST_SKIP();
    std::vector<uint8_t> bytecode = random_bytes(static_cast<size_t>(31 * MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS));
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ bytecode_fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    check_relation<bc_hashing>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, MultipleBytecodeHash)
{
    // 40 bytes => hash 3 fields, no padding
    // 20 bytes => hash 2 fields, one padding field
    // 80 bytes => hash 4 fields, two padding fields
    std::vector<std::vector<uint8_t>> all_bytecode = { random_bytes(40), random_bytes(20), random_bytes(80) };
    std::vector<std::vector<FF>> all_bytecode_fields = {
        simulation::encode_bytecode(all_bytecode[0]),
        simulation::encode_bytecode(all_bytecode[1]),
        simulation::encode_bytecode(all_bytecode[2]),
    };

    TestTraceContainer trace = process_bc_hashing_trace(all_bytecode_fields, { 1, 2, 3 });
    std::vector<simulation::BytecodeDecompositionEvent> decomp_events = {};

    for (uint32_t j = 0; j < all_bytecode.size(); j++) {
        const auto& bytecode = all_bytecode[j];
        decomp_events.push_back(simulation::BytecodeDecompositionEvent{
            .bytecode_id = j + 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) });
    }
    builder.process_decomposition({ decomp_events }, trace);

    check_relation<bc_hashing>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
}

TEST_F(BytecodeHashingConstrainingTest, BytecodeInteractions)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<uint8_t> bytecode = random_bytes(123);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 40, .bytecode_fields = fields } }, trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    check_interaction<BytecodeTraceBuilder,
                      lookup_bc_hashing_get_packed_field_0_settings,
                      lookup_bc_hashing_get_packed_field_1_settings,
                      lookup_bc_hashing_get_packed_field_0_settings,
                      lookup_bc_hashing_check_final_bytes_remaining_settings>(trace);
    check_relation<bc_hashing>(trace);
}

// Negative test where latch == 1 and sel == 0
TEST_F(BytecodeHashingConstrainingTest, NegativeLatchNotSel)
{
    TestTraceContainer trace;
    trace.set(0,
              { {
                  { C::bc_hashing_latch, 1 },
                  { C::bc_hashing_sel, 1 },
              } });

    check_relation<bc_hashing>(trace, bc_hashing::SR_SEL_TOGGLED_AT_LATCH);
    trace.set(C::bc_hashing_sel, 0, 0); // Mutate to wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_SEL_TOGGLED_AT_LATCH),
                              "SEL_TOGGLED_AT_LATCH");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeInvalidStartAfterLatch)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) },
                              { .bytecode_id = 2, .bytecode_length = 93, .bytecode_fields = random_fields(3) } },
                            trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_START_AFTER_LATCH);

    // Row = 2 is the start of the hashing for bytecode id = 2
    trace.set(Column::bc_hashing_start, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_START_AFTER_LATCH), "START_AFTER_LATCH");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeInvalidPCIncrement)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    builder.process_hashing(
        {
            { .bytecode_id = 1, .bytecode_length = 124, .bytecode_fields = random_fields(4) },
        },
        trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS);

    // This is the last row of the bytecode hashing, pc_index should be 62
    trace.set(Column::bc_hashing_pc_index, 2, 10);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS), "PC_INCREMENTS");
    // The next pc_index should be 93 = pc_index + 31
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS_1), "PC_INCREMENTS_1");
    // The next pc_index should be 124 = pc_index_1 + 31
    check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS_2);
    trace.set(Column::bc_hashing_pc_index_2, 2, 10);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS_2), "PC_INCREMENTS_2");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeStartIsSeparator)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = { 1, 2 } } }, trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_START_IS_SEPARATOR);

    // Row = 1 is the start of the hashing for bytecode id = 1
    trace.set(Column::bc_hashing_packed_fields_0, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_START_IS_SEPARATOR),
                              "START_IS_SEPARATOR");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeBytecodeInteraction)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<uint8_t> bytecode = random_bytes(150);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 150, .bytecode_fields = fields } }, trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Row = 2 constrains the hashing for the last 3 fields of the bytecode (no padding)
    // Modify the pc index for the lookup of the first packed field of row 2 (= fields[3])
    trace.set(Column::bc_hashing_pc_index, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_0_settings>(trace)),
        "Failed.*GET_PACKED_FIELD_0. Could not find tuple in destination.");

    // Modify the field value for the lookup of the second packed field of row 2 (= fields[4])
    trace.set(Column::bc_hashing_packed_fields_1, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_1_settings>(trace)),
        "Failed.*GET_PACKED_FIELD_1. Could not find tuple in destination.");

    // Modify the pc index for the lookup of the third packed field of row 2 (= fields[5])
    trace.set(Column::bc_hashing_pc_index_2, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_2_settings>(trace)),
        "Failed.*GET_PACKED_FIELD_2. Could not find tuple in destination.");

    // Reset for next test:
    trace.set(Column::bc_hashing_pc_index_2, 2, 124);
    check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_2_settings>(trace);

    // Modify the bytecode id for the lookup of the third packed field of row 2 (= fields[5])
    trace.set(Column::bc_hashing_bytecode_id, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_2_settings>(trace)),
        "Failed.*GET_PACKED_FIELD_2. Could not find tuple in destination.");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativePaddingSelectors)
{
    // 80 bytes => hash 4 fields, two padding fields
    std::vector<uint8_t> bytecode = random_bytes(80);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Row = 2 constrains the hashing for the last field of the bytecode, plus 2 padding fields
    // We cannot have padding anywhere but the last hashing row (= latch):
    trace.set(Column::bc_hashing_latch, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDING_END), "PADDING_END");
    trace.set(Column::bc_hashing_latch, 2, 1);

    // We cannot have packed_fields_1 is padding, but packed_fields_2 is not:
    trace.set(Column::bc_hashing_sel_not_padding_2, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDING_CONSISTENCY),
                              "PADDING_CONSISTENCY");
    trace.set(Column::bc_hashing_sel_not_padding_2, 2, 0);

    // We cannot have any padding with non-zero values:
    trace.set(Column::bc_hashing_packed_fields_1, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDED_BY_ZERO_1), "PADDED_BY_ZERO_1");
    trace.set(Column::bc_hashing_packed_fields_2, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDED_BY_ZERO_2), "PADDED_BY_ZERO_2");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativePaddingUnder)
{
    // 80 bytes => hash 4 fields, two padding fields
    std::vector<uint8_t> bytecode = random_bytes(80);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Row = 2 constrains the hashing for the last field of the bytecode, plus 2 padding fields
    // We cannot claim there is only one padding field:
    trace.set(Column::bc_hashing_sel_not_padding_1, 2, 1);
    // This will initially fail, because pc_at_final_field does not correspond to the pc at field 1...
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDING_CORRECTNESS),
                              "PADDING_CORRECTNESS");
    // ...setting it to that of field 2 will force the relation to pass...
    trace.set(Column::bc_hashing_pc_at_final_field, 2, 93);
    check_relation<bc_hashing>(trace, bc_hashing::SR_PADDING_CORRECTNESS);
    // ...but the lookup to find field 1 will fail...
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_1_settings>(trace)),
        "Failed.*GET_PACKED_FIELD_1. Could not find tuple in destination.");
    // ...and the lookup to check the final field against bytes remaining will fail:
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_check_final_bytes_remaining_settings>(trace)),
        "Failed.*CHECK_FINAL_BYTES_REMAINING. Could not find tuple in destination.");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativePaddingOver)
{
    // 100 bytes => hash 5 fields, one padding field
    std::vector<uint8_t> bytecode = random_bytes(100);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Row = 2 constrains the hashing for the last fields of the bytecode, plus 1 padding field
    // We cannot claim there are two padding fields (to attempt to skip processing the last bytecode field):
    trace.set(Column::bc_hashing_sel_not_padding_1, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PADDED_BY_ZERO_1), "PADDED_BY_ZERO_1");
    // If we incorrectly set packed_fields_1 to 0 and pc_at_final_field to pc_index_1...
    trace.set(Column::bc_hashing_packed_fields_1, 2, 0);
    trace.set(Column::bc_hashing_pc_at_final_field, 2, 62);
    // ...then the lookup into decomp will fail (bytes_remaining > 31):
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_check_final_bytes_remaining_settings>(trace)),
        "Failed.*CHECK_FINAL_BYTES_REMAINING. Could not find tuple in destination.");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativeInputLen)
{
    // 80 bytes => hash 4 fields, two padding fields
    std::vector<uint8_t> bytecode = random_bytes(80);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Set the incorrect input_len at the first row, and the lookup into (an honest) poseidon will fail:
    trace.set(Column::bc_hashing_input_len, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_settings>(trace)),
        "LOOKUP_BC_HASHING_POSEIDON2_HASH");

    trace.set(Column::bc_hashing_input_len, 1, 4);

    // Set the incorrect input_len at the final row, and the constraining length check will fail:
    trace.set(Column::bc_hashing_input_len, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_BYTECODE_LENGTH_FIELDS),
                              "BYTECODE_LENGTH_FIELDS");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativeRounds)
{
    // 80 bytes => hash 4 fields, two padding fields
    std::vector<uint8_t> bytecode = random_bytes(80);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    TestTraceContainer trace = process_bc_hashing_trace({ fields }, { 1 });
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Setting the incorrect number of rounds remaining will fail relative to the next row...
    trace.set(Column::bc_hashing_rounds_rem, 1, 3);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_ROUNDS_DECREMENT), "ROUNDS_DECREMENT");

    // ...and even if decremented correctly, will fail at latch if rounds_rem != 1:
    trace.set(Column::bc_hashing_rounds_rem, 2, 2);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_ROUNDS_DECREMENT), "ROUNDS_DECREMENT");
}

TEST_F(BytecodeHashingConstrainingTestTraceHelper, NegativeOutputHash)
{
    std::vector<FF> bytecode_fields = random_fields(10);
    TestTraceContainer trace = process_bc_hashing_trace({ bytecode_fields }, { 1 });

    check_relation<bc_hashing>(trace);
    check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_settings>(trace);

    // Change any of the output_hash values
    trace.set(Column::bc_hashing_output_hash, 2, 123);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_settings>(trace)),
        "LOOKUP_BC_HASHING_POSEIDON2_HASH");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeSingleBytecodeHashIncrements)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    // Attempt to skip some init fields:
    // decomp: 3 fields 1, 2, 3 => real hash [ sep, 1, 2, 3 ] => try and claim hash [ sep, 2, 3 ] => start = 1, pc_index
    // = 31. Note that this is protected by the addition of precomputed.first_row in #[PC_INCREMENTS]
    std::vector<uint8_t> bytecode = random_bytes(static_cast<size_t>(31 * 3));
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(bytecode);

    auto bad_hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_BYTECODE, bytecode_fields[1], bytecode_fields[2] });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::bc_hashing_latch, 1 },
            { C::bc_hashing_packed_fields_0, GENERATOR_INDEX__PUBLIC_BYTECODE },
            { C::bc_hashing_packed_fields_1, bytecode_fields[1] },
            { C::bc_hashing_packed_fields_2, bytecode_fields[2] },
            { C::bc_hashing_pc_at_final_field, 62 },
            { C::bc_hashing_pc_index_1, 31 },
            { C::bc_hashing_pc_index_2, 62 },
            { C::bc_hashing_sel_not_padding_1, 1 },
            { C::bc_hashing_sel_not_padding_2, 1 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, bad_hash },
            { C::bc_hashing_pc_index, 31 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_sel_not_start, 0 },
            { C::bc_hashing_start, 1 },
        },
    });

    precomputed_builder.process_misc(trace, 256);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS), "PC_INCREMENTS");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeSingleBytecodeHashLength)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    // Attempt to prepend fields to the hash
    // decomp: 3 fields 1, 2, 3 => real hash [ sep, 1, 2, 3 ] => try and claim hash [ a, b, c, sep, 1, 2, 3 ]
    std::vector<uint8_t> bytecode = random_bytes(static_cast<size_t>(31 * 3));
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(bytecode);

    auto bad_hash = poseidon2.hash({ 0xa,
                                     0xb,
                                     0xc,
                                     GENERATOR_INDEX__PUBLIC_BYTECODE,
                                     bytecode_fields[0],
                                     bytecode_fields[1],
                                     bytecode_fields[2] });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::bc_hashing_input_len, 7 },
            { C::bc_hashing_packed_fields_0, GENERATOR_INDEX__PUBLIC_BYTECODE },
            { C::bc_hashing_packed_fields_1, bytecode_fields[0] },
            { C::bc_hashing_packed_fields_2, bytecode_fields[1] },
            { C::bc_hashing_pc_index_1, 0 },
            { C::bc_hashing_pc_index_2, 31 },
            { C::bc_hashing_sel_not_padding_1, 1 },
            { C::bc_hashing_sel_not_padding_2, 1 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, bad_hash },
            { C::bc_hashing_pc_index, 0 },
            { C::bc_hashing_rounds_rem, 2 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_start, 1 },
        },
        {
            { C::bc_hashing_input_len, 7 },
            { C::bc_hashing_latch, 1 },
            { C::bc_hashing_packed_fields_0, bytecode_fields[2] },
            { C::bc_hashing_packed_fields_1, 0 },
            { C::bc_hashing_packed_fields_2, 0 },
            { C::bc_hashing_pc_at_final_field, 62 },
            { C::bc_hashing_pc_index_1, 93 },
            { C::bc_hashing_pc_index_2, 124 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, bad_hash },
            { C::bc_hashing_pc_index, 62 },
            { C::bc_hashing_rounds_rem, 1 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_sel_not_start, 1 },
        },
    });

    precomputed_builder.process_misc(trace, 256);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // The correct rows (for input chunks [sep, 1, 2] and [3, 0, 0]) will exist in the poseidon trace, but the start
    // rows do not line up:
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_settings>(trace)),
        "LOOKUP_BC_HASHING_POSEIDON2_HASH");
    // At the final row, the length check will fail:
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_BYTECODE_LENGTH_FIELDS),
                              "BYTECODE_LENGTH_FIELDS");
}

TEST_F(BytecodeHashingConstrainingTest, NegativeSingleBytecodeHashOutputConsistency)
{
    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    // Attempt to prepend fields to the hash
    // decomp: 5 fields 1, 2, 3, 4, 5 => real hash [ sep, 1, 2, 3, 4, 5 ] => try and claim hash [a, b, c, 3, 4, 5]
    std::vector<uint8_t> bytecode = random_bytes(static_cast<size_t>(31 * 5));
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(bytecode);

    auto good_hash = poseidon2.hash({ GENERATOR_INDEX__PUBLIC_BYTECODE,
                                      bytecode_fields[0],
                                      bytecode_fields[1],
                                      bytecode_fields[2],
                                      bytecode_fields[3],
                                      bytecode_fields[4] });
    auto bad_hash = poseidon2.hash({ 0xa, 0xb, 0xc, bytecode_fields[2], bytecode_fields[3], bytecode_fields[4] });

    auto trace = TestTraceContainer({
        { { C::precomputed_first_row, 1 } },
        {
            { C::bc_hashing_input_len, 6 },
            { C::bc_hashing_packed_fields_0, GENERATOR_INDEX__PUBLIC_BYTECODE },
            { C::bc_hashing_packed_fields_1, bytecode_fields[0] },
            { C::bc_hashing_packed_fields_2, bytecode_fields[1] },
            { C::bc_hashing_pc_index_1, 0 },
            { C::bc_hashing_pc_index_2, 31 },
            { C::bc_hashing_sel_not_padding_1, 1 },
            { C::bc_hashing_sel_not_padding_2, 1 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, good_hash },
            { C::bc_hashing_pc_index, 0 },
            { C::bc_hashing_rounds_rem, 2 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_start, 1 },
        },
        {
            { C::bc_hashing_input_len, 6 },
            { C::bc_hashing_latch, 1 },
            { C::bc_hashing_packed_fields_0, bytecode_fields[2] },
            { C::bc_hashing_packed_fields_1, bytecode_fields[3] },
            { C::bc_hashing_packed_fields_2, bytecode_fields[4] },
            { C::bc_hashing_pc_at_final_field, 124 },
            { C::bc_hashing_pc_index_1, 93 },
            { C::bc_hashing_pc_index_2, 124 },
            { C::bc_hashing_sel_not_padding_1, 1 },
            { C::bc_hashing_sel_not_padding_2, 1 },
            { C::bc_hashing_bytecode_id, 1 },
            { C::bc_hashing_output_hash, bad_hash },
            { C::bc_hashing_pc_index, 62 },
            { C::bc_hashing_rounds_rem, 1 },
            { C::bc_hashing_sel, 1 },
            { C::bc_hashing_sel_not_start, 1 },
        },
    });
    precomputed_builder.process_misc(trace, 256);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // The 'correct' rows (for input chunks [sep, 1, 2] and [3, 4, 5]) will exist in the poseidon trace, so the lookups
    // will pass...
    check_all_interactions<BytecodeTraceBuilder>(trace);
    // ...but the hash consistency check will fail:
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_HASH_CONSISTENCY), "HASH_CONSISTENCY");
}
} // namespace
} // namespace bb::avm2::constraining
