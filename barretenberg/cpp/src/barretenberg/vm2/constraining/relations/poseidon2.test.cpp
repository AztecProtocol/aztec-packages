#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_poseidon2_hash.hpp"
#include "barretenberg/vm2/generated/relations/poseidon2_hash.hpp"
#include "barretenberg/vm2/optimized/relations/poseidon2_perm.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"

// Temporary imports, see comment in test.
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {

using ::testing::ElementsAreArray;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;

using tracegen::Poseidon2TraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using poseidon2_hash = bb::avm2::poseidon2_hash<FF>;
using poseidon2_perm = bb::avm2::optimized_poseidon2_perm<FF>;
using poseidon2_mem = bb::avm2::poseidon2_mem<FF>;

using simulation::DeduplicatingEventEmitter;
using simulation::EventEmitter;
using simulation::ExecutionIdManager;
using simulation::FieldGreaterThan;
using simulation::FieldGreaterThanEvent;
using simulation::GreaterThan;
using simulation::GreaterThanEvent;
using simulation::MockMemory;
using simulation::MockRangeCheck;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;

class Poseidon2ConstrainingTest : public ::testing::Test {
  protected:
    Poseidon2ConstrainingTest()
        : execution_id_manager(0)
        , ff_gt(range_check, field_gt_event_emitter)
        , gt(ff_gt, range_check, gt_event_emitter)
        , poseidon2(execution_id_manager, gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter)
    {}
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    EventEmitter<GreaterThanEvent> gt_event_emitter;

    ExecutionIdManager execution_id_manager;
    NiceMock<MockRangeCheck> range_check;
    FieldGreaterThan ff_gt;
    GreaterThan gt;
    Poseidon2 poseidon2;
};

TEST_F(Poseidon2ConstrainingTest, Poseidon2EmptyRow)
{
    check_relation<poseidon2_hash>(testing::empty_trace());
    check_relation<poseidon2_perm>(testing::empty_trace());
    check_relation<poseidon2_mem>(testing::empty_trace());
}

// These tests imports a bunch of external code since hand-generating the poseidon2 trace is a bit laborious atm.
TEST_F(Poseidon2ConstrainingTest, BasicPermutation)
{
    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF d("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::array<FF, 4> input = { a, b, c, d };
    auto result = poseidon2.permutation(input);

    std::array<FF, 4> expected = {
        FF("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95"),
        FF("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f"),
        FF("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3"),
        FF("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41"),
    };

    EXPECT_THAT(result, ElementsAreArray(expected));

    TestTraceContainer trace;
    tracegen::Poseidon2TraceBuilder builder;

    builder.process_permutation(perm_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), 1);

    check_relation<poseidon2_perm>(trace);
}

TEST_F(Poseidon2ConstrainingTest, HashWithSinglePermutation)
{
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::vector<FF> input = { a, b, c };
    poseidon2.hash(input);

    // This first row column is set becuase it is used in the relations for Poseidon2Hash.
    // This could be replaced by having the precomputed tables in the trace, but currently that would
    // mean the clk column of length 2^21 -1 will be include :O
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    Poseidon2TraceBuilder builder;

    builder.process_hash(hash_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 1);

    check_relation<poseidon2_hash>(trace);
}

TEST_F(Poseidon2ConstrainingTest, HashWithMultiplePermutation)
{
    // Taken From barretenberg/crypto/poseidon2/poseidon2.test.cpp
    FF a("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF b("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF c("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");
    FF d("0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789");

    std::vector<FF> input = { a, b, c, d };
    poseidon2.hash(input);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    Poseidon2TraceBuilder builder;

    builder.process_hash(hash_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + 2);

    check_relation<poseidon2_hash>(trace);
}

TEST_F(Poseidon2ConstrainingTest, MultipleHashInvocations)
{
    std::vector<FF> input = { 1, 2, 3, 4 };

    FF result = poseidon2.hash(input);
    FF bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash(input);
    EXPECT_EQ(result, bb_result);

    result = poseidon2.hash({ result, 1, 2, 3, 4 });
    bb_result = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::hash({ bb_result, 1, 2, 3, 4 });
    EXPECT_EQ(result, bb_result);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    Poseidon2TraceBuilder builder;

    builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process_permutation(perm_event_emitter.dump_events(), trace);
    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2 + /*second_invokcation=*/2);

    check_relation<poseidon2_hash>(trace);
}

TEST_F(Poseidon2ConstrainingTest, HashPermInteractions)
{
    std::vector<FF> input = { 1, 2, 3, 4 };

    poseidon2.hash(input);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    Poseidon2TraceBuilder builder;

    builder.process_hash(hash_event_emitter.dump_events(), trace);
    builder.process_permutation(perm_event_emitter.dump_events(), trace);
    check_interaction<Poseidon2TraceBuilder, lookup_poseidon2_hash_poseidon2_perm_settings>(trace);

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2);

    check_relation<poseidon2_hash>(trace);
    check_relation<poseidon2_perm>(trace);
    check_all_interactions<Poseidon2TraceBuilder>(trace);
}

TEST_F(Poseidon2ConstrainingTest, NegativeHashPermInteractions)
{
    std::vector<FF> input = { 1, 2, 3, 4 };

    poseidon2.hash(input);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
    });
    Poseidon2TraceBuilder builder;

    builder.process_hash(hash_event_emitter.dump_events(), trace);

    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<Poseidon2TraceBuilder, lookup_poseidon2_hash_poseidon2_perm_settings>(trace)),
        "Failed.*POSEIDON2_PERM. Could not find tuple in destination.");

    EXPECT_EQ(trace.get_num_rows(), /*start_row=*/1 + /*first_invocation=*/2);

    check_relation<poseidon2_hash>(trace);
}

///////////////////////////
// Memory Aware Poseidon2
///////////////////////////

class Poseidon2MemoryConstrainingTest : public Poseidon2ConstrainingTest {
  protected:
    Poseidon2MemoryConstrainingTest() { ON_CALL(memory, get_space_id).WillByDefault(Return(0)); }

    TestTraceContainer trace;
    Poseidon2TraceBuilder builder;

    NiceMock<MockMemory> memory;
    std::vector<MemoryValue> inputs = {
        MemoryValue::from<FF>(1), MemoryValue::from<FF>(2), MemoryValue::from<FF>(3), MemoryValue::from<FF>(4)
    };

    uint32_t src_address = 0;
    uint32_t dst_address = 4;
};

TEST_F(Poseidon2MemoryConstrainingTest, PermutationMemory)
{
    // Read 4 inputs
    EXPECT_CALL(memory, get)
        .WillOnce(ReturnRef(inputs[0]))
        .WillOnce(ReturnRef(inputs[1]))
        .WillOnce(ReturnRef(inputs[2]))
        .WillOnce(ReturnRef(inputs[3]));
    EXPECT_CALL(memory, set).Times(4); // Write 4 outputs

    poseidon2.permutation(memory, src_address, dst_address);

    builder.process_permutation_with_memory(perm_mem_event_emitter.dump_events(), trace);

    check_relation<poseidon2_mem>(trace);
}

TEST_F(Poseidon2MemoryConstrainingTest, PermutationMemoryInteractions)
{
    // Read 4 inputs
    EXPECT_CALL(memory, get)
        .WillOnce(ReturnRef(inputs[0]))
        .WillOnce(ReturnRef(inputs[1]))
        .WillOnce(ReturnRef(inputs[2]))
        .WillOnce(ReturnRef(inputs[3]));
    EXPECT_CALL(memory, set).Times(4); // Write 4 outputs

    // Expected bb output from inputs = {1, 2, 3 ,4}
    std::vector<FF> outputs = { FF("0x224785a48a72c75e2cbb698143e71d5d41bd89a2b9a7185871e39a54ce5785b1"),
                                FF("0x225bb800db22c4f4b09ace45cb484d42b0dd7dfe8708ee26aacde6f2c1fb2cb8"),
                                FF("0x1180f4260e60b4264c987b503075ea8374b53ed06c5145f8c21c2aadb5087d21"),
                                FF("0x16c877b5b9c04d873218804ccbf65d0eeb12db447f66c9ca26fec380055df7e9") };

    // Set the execution and gt traces
    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_execute_poseidon2_perm, 1 },
            { C::execution_rop_0_, src_address },
            { C::execution_rop_1_, dst_address },
            // GT - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_address + 3 }, // highest write address is src_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
        {
            // GT - src out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, src_address + 3 }, // highest read address is dst_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
    });

    // Set up memory trace
    for (uint32_t i = 0; i < inputs.size(); ++i) {
        // Set memory reads
        trace.set(C::memory_address, i, src_address + i);
        trace.set(C::memory_value, i, inputs[i]);
        trace.set(C::memory_tag, i, static_cast<uint32_t>(inputs[i].get_tag()));
        trace.set(C::memory_sel, i, 1);
        // Set memory writes
        uint32_t write_index = i + static_cast<uint32_t>(inputs.size());
        trace.set(C::memory_address, write_index, dst_address + i);
        trace.set(C::memory_value, write_index, outputs[i]);
        trace.set(C::memory_sel, write_index, 1);
        trace.set(C::memory_rw, write_index, 1);
    }

    poseidon2.permutation(memory, src_address, dst_address);

    builder.process_permutation_with_memory(perm_mem_event_emitter.dump_events(), trace);
    builder.process_permutation(perm_event_emitter.dump_events(), trace);

    check_all_interactions<Poseidon2TraceBuilder>(trace);
    check_relation<poseidon2_mem>(trace);
}

TEST_F(Poseidon2MemoryConstrainingTest, PermutationMemoryInvalidTag)
{
    // Third input is of the wrong type
    std::vector<MemoryValue> inputs = {
        MemoryValue::from<FF>(1), MemoryValue::from<FF>(2), MemoryValue::from<uint64_t>(3), MemoryValue::from<FF>(4)
    };

    // Still load all the inputs even though there is in invalid tag
    EXPECT_CALL(memory, get)
        .WillOnce(ReturnRef(inputs[0]))
        .WillOnce(ReturnRef(inputs[1]))
        .WillOnce(ReturnRef(inputs[2]))
        .WillOnce(ReturnRef(inputs[3]));

    // Set the execution and gt traces
    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_execute_poseidon2_perm, 1 },
            { C::execution_rop_0_, src_address },
            { C::execution_rop_1_, dst_address },
            { C::execution_sel_opcode_error, 1 }, // Invalid tag error
            // GT - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_address + 3 }, // highest write address is src_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
        {
            // GT - src out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, src_address + 3 }, // highest read address is dst_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
    });

    // Set up memory trace
    for (uint32_t i = 0; i < inputs.size(); ++i) {
        // Set memory reads
        trace.set(C::memory_address, i, src_address + i);
        trace.set(C::memory_value, i, inputs[i]);
        trace.set(C::memory_tag, i, static_cast<uint32_t>(inputs[i].get_tag()));
        trace.set(C::memory_sel, i, 1);
    }

    EXPECT_THROW_WITH_MESSAGE(poseidon2.permutation(memory, src_address, dst_address),
                              "Poseidon2Exception.* input tag is not FF");

    builder.process_permutation_with_memory(perm_mem_event_emitter.dump_events(), trace);

    // Don't expect any permutation events since the memory access was invalid
    EXPECT_EQ(perm_event_emitter.dump_events().size(), 0);

    check_relation<poseidon2_mem>(trace);
    check_all_interactions<Poseidon2TraceBuilder>(trace);
}

TEST_F(Poseidon2MemoryConstrainingTest, PermutationMemoryInvalidAddressRange)
{
    uint32_t src_address = static_cast<uint32_t>(AVM_HIGHEST_MEM_ADDRESS - 2);

    TestTraceContainer trace = TestTraceContainer({
        // Row 0
        {
            // Execution
            { C::execution_sel, 1 },
            { C::execution_sel_execute_poseidon2_perm, 1 },
            { C::execution_rop_0_, src_address },
            { C::execution_rop_1_, dst_address },
            { C::execution_sel_opcode_error, 1 }, // Invalid address error
            // GT Subtrace - dst out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, dst_address + 3 }, // highest write address is src_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 0 },
        },
        {
            // GT Subtrace - src out of range check
            { C::gt_sel, 1 },
            { C::gt_input_a, static_cast<uint64_t>(src_address) + 3 }, // highest read address is dst_address + 3
            { C::gt_input_b, AVM_HIGHEST_MEM_ADDRESS },
            { C::gt_res, 1 },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(poseidon2.permutation(memory, src_address, dst_address),
                              "Poseidon2Exception.* src or dst address out of range");

    Poseidon2TraceBuilder builder;
    builder.process_permutation_with_memory(perm_mem_event_emitter.dump_events(), trace);

    // Don't expect any permutation events since the address range was invalid
    EXPECT_EQ(perm_event_emitter.dump_events().size(), 0);

    check_relation<poseidon2_mem>(trace);
    check_all_interactions<Poseidon2TraceBuilder>(trace);
}

} // namespace bb::avm2::constraining
