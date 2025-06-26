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
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using testing::random_bytes;
using testing::random_fields;

using tracegen::BytecodeTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_hashing = bb::avm2::bc_hashing<FF>;
using poseidon2 = bb::avm2::poseidon2_hash<FF>;

TEST(BytecodeHashingConstrainingTest, EmptyRow)
{
    check_relation<bc_hashing>(testing::empty_trace());
}

TEST(BytecodeHashingConstrainingTest, SingleBytecodeHash)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    BytecodeTraceBuilder builder;

    builder.process_hashing(
        { { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) /* 62 bytes */ } }, trace);

    check_relation<bc_hashing>(trace);
}

TEST(BytecodeHashingConstrainingTest, MultipleBytecodeHash)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    BytecodeTraceBuilder builder;

    builder.process_hashing(
        { { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) /* 62 bytes */ },
          { .bytecode_id = 2, .bytecode_length = 62000, .bytecode_fields = random_fields(2000) /* 62k bytes */ } },
        trace);

    check_relation<bc_hashing>(trace);
}

TEST(BytecodeHashingConstrainingTest, PoseidonInteractions)
{
    simulation::EventEmitter<simulation::Poseidon2HashEvent> hash_event_emitter;
    simulation::EventEmitter<simulation::Poseidon2PermutationEvent> perm_event_emitter;
    simulation::Poseidon2 poseidon2(hash_event_emitter, perm_event_emitter);
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<FF> fields = random_fields(2);

    // This creates events for the poseidon2 hash trace
    FF first_incr_hash = poseidon2.hash({ fields[0], 62 });
    poseidon2.hash({ fields[1], first_incr_hash });

    Poseidon2TraceBuilder poseidon2_builder;
    BytecodeTraceBuilder bytecode_builder;

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);
    bytecode_builder.process_hashing(
        { { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = fields /* 62 bytes */ } }, trace);

    // TODO(dbanks12): re-enable once C++ and PIL use standard poseidon2 hashing for bytecode commitments.
    // check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_poseidon2_hash_relation>(trace);

    check_relation<bc_hashing>(trace);
}

TEST(BytecodeHashingConstrainingTest, BytecodeInteractions)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<uint8_t> bytecode = random_bytes(40);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);
    BytecodeTraceBuilder builder;

    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 40, .bytecode_fields = fields } }, trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    check_interaction<BytecodeTraceBuilder,
                      lookup_bc_hashing_get_packed_field_settings,
                      lookup_bc_hashing_iv_is_len_settings>(trace);

    check_relation<bc_hashing>(trace);
}

TEST(BytecodeHashingConstrainingTest, NegativeInvalidStartAfterLatch)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    BytecodeTraceBuilder builder;
    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) },
                              { .bytecode_id = 2, .bytecode_length = 93, .bytecode_fields = random_fields(3) } },
                            trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_START_AFTER_LATCH);

    // Row = 3 is the start of the hashing for bytecode id = 2
    trace.set(Column::bc_hashing_start, 3, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_START_AFTER_LATCH), "START_AFTER_LATCH");
}

TEST(BytecodeHashingConstrainingTest, NegativeInvalidPCIncrement)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    BytecodeTraceBuilder builder;
    builder.process_hashing(
        {
            { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) },
        },
        trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS);

    // This is the last row  of the bytecode hashing
    trace.set(Column::bc_hashing_pc_index, 2, 10);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_PC_INCREMENTS), "PC_INCREMENTS");
}

TEST(BytecodeHashingConstrainingTest, NegativeChainOutput)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    BytecodeTraceBuilder builder;
    builder.process_hashing(
        {
            { .bytecode_id = 1, .bytecode_length = 62, .bytecode_fields = random_fields(2) },
        },
        trace);
    check_relation<bc_hashing>(trace, bc_hashing::SR_CHAIN_OUTPUT_TO_INCR);

    // This is the last row  of the bytecode hashing
    trace.set(Column::bc_hashing_incremental_hash, 2, 123);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_hashing>(trace, bc_hashing::SR_CHAIN_OUTPUT_TO_INCR),
                              "CHAIN_OUTPUT_TO_INCR");
}

// Negative test where latch == 1 and sel == 0
TEST(BytecodeHashingConstrainingTest, NegativeLatchNotSel)
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

TEST(BytecodeHashingConstrainingTest, NegativeBytecodeInteraction)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });

    std::vector<uint8_t> bytecode = random_bytes(40);
    std::vector<FF> fields = simulation::encode_bytecode(bytecode);

    BytecodeTraceBuilder builder;

    builder.process_hashing({ { .bytecode_id = 1, .bytecode_length = 40, .bytecode_fields = fields } }, trace);
    builder.process_decomposition(
        { { .bytecode_id = 1, .bytecode = std::make_shared<std::vector<uint8_t>>(bytecode) } }, trace);

    // Row = 3 is the start of the hashing for bytecode id = 2
    // Modify the pc index for the lookup of the second packed field
    trace.set(Column::bc_hashing_pc_index, 2, 0);
    // Modify the first incremental hash value from the bytecode length to the invalid value, 10
    trace.set(Column::bc_hashing_incremental_hash, 1, 10);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_get_packed_field_settings>(trace)),
        "Failed.*GET_PACKED_FIELD. Could not find tuple in destination.");

    EXPECT_THROW_WITH_MESSAGE((check_interaction<BytecodeTraceBuilder, lookup_bc_hashing_iv_is_len_settings>(trace)),
                              "Failed.*IV_IS_LEN. Could not find tuple in destination.");
}

} // namespace
} // namespace bb::avm2::constraining
