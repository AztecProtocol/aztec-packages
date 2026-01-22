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

// Imports for class_id_derivation-based vulnerability test
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/generated/relations/class_id_derivation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/class_id_derivation.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"

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
            { C::execution_sel_exec_dispatch_poseidon2_perm, 1 },
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
            { C::execution_sel_exec_dispatch_poseidon2_perm, 1 },
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
            { C::execution_sel_exec_dispatch_poseidon2_perm, 1 },
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

///////////////////////////
// Regression Test: start * (1 - sel) = 0 constraint
///////////////////////////

// This test verifies that the SELECTOR_ON_START constraint in poseidon2_hash.pil
// correctly prevents a malicious prover from setting start=1 on inactive rows (sel=0).
//
// Previously, this was a vulnerability where a prover could forge hash results by
// creating rows with start=1, sel=0, and arbitrary inputs/outputs.
//
// The fix adds:
//   #[SELECTOR_ON_START]
//   start * (1 - sel) = 0;
//
// This mirrors the existing protection for `end` and matches merkle_check.pil.
TEST_F(Poseidon2ConstrainingTest, StartSelectorIsProtected)
{
    // Create a trace where start=1 but sel=0
    // This represents a forged row that a malicious prover would try to create
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        {
            // ATTACK ATTEMPT: sel=0 but start=1
            // This is now BLOCKED by SELECTOR_ON_START constraint
            { C::poseidon2_hash_sel, 0 },
            { C::poseidon2_hash_start, 1 },
            { C::poseidon2_hash_end, 0 },
            // Arbitrary inputs - attacker would try to claim fake hash
            { C::poseidon2_hash_input_0, FF(0xDEADBEEF) },
            { C::poseidon2_hash_input_1, FF(0xCAFEBABE) },
            { C::poseidon2_hash_input_2, FF(0x12345678) },
            { C::poseidon2_hash_output, FF(0x999999) },
            { C::poseidon2_hash_num_perm_rounds_rem, 2 },
            { C::poseidon2_hash_input_len, 4 },
            { C::poseidon2_hash_padding, 2 },
        },
    });

    // FIX VERIFIED: The SELECTOR_ON_START constraint now catches this attack
    EXPECT_THROW_WITH_MESSAGE(check_relation<poseidon2_hash>(trace, poseidon2_hash::SR_SELECTOR_ON_START),
                              "SELECTOR_ON_START");
}

// This test verifies that the SELECTOR_ON_START fix blocks the class_id forgery attack.
// Previously, an attacker could claim (real_artifact, real_private_root, real_bytecode) → FAKE_class_id
// by forging a start row with sel=0, start=1.
// Now the fix blocks this by requiring start=1 implies sel=1.
TEST_F(Poseidon2ConstrainingTest, FakeClassIdAttackIsBlocked)
{
    using simulation::ClassIdDerivation;
    using simulation::ClassIdDerivationEvent;
    using tracegen::ClassIdDerivationTraceBuilder;
    using class_id_derivation = bb::avm2::class_id_derivation<FF>;

    // =========================================================================
    // STEP 1: Define the REAL contract class that the attacker wants to target
    // =========================================================================
    FF real_artifact_hash = FF(0x1111);
    FF real_private_functions_root = FF(0x2222);
    FF real_bytecode_commitment = FF(0x3333);

    // This is the REAL class_id that should be derived
    FF real_class_id = poseidon2.hash(
        { FF(DOM_SEP__CONTRACT_CLASS_ID), real_artifact_hash, real_private_functions_root, real_bytecode_commitment });

    // =========================================================================
    // STEP 2: Attacker creates a VALID computation using the REAL bytecode
    // =========================================================================
    // The attacker chooses arbitrary first-round inputs but uses the REAL bytecode
    // in the second round. This gives them a valid end row with (real_bytecode, 0, 0).
    FF attacker_artifact = FF(0xAAAA);
    FF attacker_private_root = FF(0xBBBB);
    FF attacker_bytecode = real_bytecode_commitment; // Use the REAL bytecode

    // Compute the FAKE class_id using the attacker's chosen inputs + real bytecode
    FF fake_class_id =
        poseidon2.hash({ FF(DOM_SEP__CONTRACT_CLASS_ID), attacker_artifact, attacker_private_root, attacker_bytecode });

    ASSERT_NE(fake_class_id, real_class_id);

    // =========================================================================
    // STEP 3: Use ClassIdDerivation simulator to generate VALID trace for attacker's computation
    // =========================================================================
    EventEmitter<ClassIdDerivationEvent> attacker_class_id_emitter;
    ClassIdDerivation attacker_class_id_sim(poseidon2, attacker_class_id_emitter);

    ContractClassWithCommitment attacker_klass;
    attacker_klass.id = fake_class_id;
    attacker_klass.artifact_hash = attacker_artifact;
    attacker_klass.private_functions_root = attacker_private_root;
    attacker_klass.public_bytecode_commitment = attacker_bytecode;

    attacker_class_id_sim.assert_derivation(attacker_klass);

    // =========================================================================
    // STEP 4: Build the trace with the attacker's VALID computation
    // =========================================================================
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 }, { C::precomputed_zero, 0 } },
    });

    Poseidon2TraceBuilder poseidon2_builder;
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    ClassIdDerivationTraceBuilder class_id_builder;
    class_id_builder.process(attacker_class_id_emitter.dump_events(), trace);

    // =========================================================================
    // STEP 5: Verify the attacker's computation is valid (before the attack)
    // =========================================================================
    check_relation<poseidon2_hash>(trace);
    check_relation<class_id_derivation>(trace);

    // =========================================================================
    // STEP 6: ATTACK ATTEMPT - Claim the REAL inputs produce the FAKE class_id
    // =========================================================================
    uint32_t class_id_row = 0;
    trace.set(class_id_row,
              { {
                  { C::class_id_derivation_sel, 1 },
                  { C::class_id_derivation_class_id, fake_class_id },
                  { C::class_id_derivation_artifact_hash, real_artifact_hash },
                  { C::class_id_derivation_private_functions_root, real_private_functions_root },
                  { C::class_id_derivation_public_bytecode_commitment, real_bytecode_commitment },
                  { C::class_id_derivation_gen_index_contract_class_id, FF(DOM_SEP__CONTRACT_CLASS_ID) },
                  { C::class_id_derivation_const_two, 2 },
              } });

    // =========================================================================
    // STEP 7: Add FORGED start row (this is what the fix blocks)
    // =========================================================================
    uint32_t forged_row = trace.get_num_rows();
    trace.set(forged_row,
              { {
                  { C::poseidon2_hash_sel, 0 },   // INACTIVE
                  { C::poseidon2_hash_start, 1 }, // FORGED start - now blocked by SELECTOR_ON_START!
                  { C::poseidon2_hash_end, 0 },
                  { C::poseidon2_hash_input_0, FF(DOM_SEP__CONTRACT_CLASS_ID) },
                  { C::poseidon2_hash_input_1, real_artifact_hash },
                  { C::poseidon2_hash_input_2, real_private_functions_root },
                  { C::poseidon2_hash_output, fake_class_id },
                  { C::poseidon2_hash_num_perm_rounds_rem, 2 },
                  { C::poseidon2_hash_input_len, 4 },
                  { C::poseidon2_hash_padding, 2 },
              } });

    // =========================================================================
    // STEP 8: FIX VERIFIED - The SELECTOR_ON_START constraint blocks the attack
    // =========================================================================
    // The forged row has start=1 but sel=0, which violates: start * (1 - sel) = 0
    EXPECT_THROW_WITH_MESSAGE(check_relation<poseidon2_hash>(trace, poseidon2_hash::SR_SELECTOR_ON_START),
                              "SELECTOR_ON_START");

    // class_id_derivation relations still pass (the attack is blocked at the poseidon2_hash level)
    check_relation<class_id_derivation>(trace);

    // =========================================================================
    // ATTACK BLOCKED: The class_id forgery is no longer possible
    // =========================================================================
    // Previously, an attacker could claim ANY class_id for ANY contract inputs.
    // Now the SELECTOR_ON_START constraint ensures that start=1 requires sel=1,
    // meaning all poseidon2 constraints must be satisfied on start rows.
    // This makes it cryptographically infeasible to forge hash results.
}

} // namespace bb::avm2::constraining
