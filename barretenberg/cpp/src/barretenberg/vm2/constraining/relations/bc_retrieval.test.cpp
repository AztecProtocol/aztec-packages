#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_decomposition.hpp"
#include "barretenberg/vm2/generated/relations/bc_hashing.hpp"
#include "barretenberg/vm2/generated/relations/bc_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/class_id_derivation.hpp"
#include "barretenberg/vm2/generated/relations/contract_instance_retrieval.hpp"
#include "barretenberg/vm2/generated/relations/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/indexed_tree_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {
using ::testing::StrictMock;

using testing::random_contract_class;
using testing::random_contract_instance;
using tracegen::BytecodeTraceBuilder;
using tracegen::ClassIdDerivationTraceBuilder;
using tracegen::ContractInstanceRetrievalTraceBuilder;
using tracegen::FieldGreaterThanTraceBuilder;
using tracegen::IndexedTreeCheckTraceBuilder;
using tracegen::Poseidon2TraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::EventEmitter;
using simulation::FieldGreaterThan;
using simulation::IndexedTreeCheck;
using simulation::IndexedTreeCheckEvent;
using simulation::IndexedTreeLeafData;
using simulation::IndexedTreeReadWriteEvent;
using simulation::MerkleCheck;
using simulation::MockExecutionIdManager;
using simulation::MockGreaterThan;
using simulation::Poseidon2;
using simulation::Poseidon2HashEvent;
using simulation::Poseidon2PermutationEvent;
using simulation::Poseidon2PermutationMemoryEvent;
using simulation::RangeCheck;
using simulation::RetrievedBytecodesTreeCheck;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_retrieval = bb::avm2::bc_retrieval<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

class BytecodeRetrievalConstrainingTest : public ::testing::Test {
  public:
    static TestTraceContainer init_trace()
    {
        // Add first row.
        TestTraceContainer trace({
            { { C::precomputed_first_row, 1 } },
        });
        return trace;
    }
};

TEST_F(BytecodeRetrievalConstrainingTest, EmptyRow)
{
    check_relation<bc_retrieval>(testing::empty_trace());
}

TEST_F(BytecodeRetrievalConstrainingTest, SuccessfulRetrieval)
{
    TestTraceContainer trace = init_trace();
    BytecodeTraceBuilder builder;
    ContractInstanceRetrievalTraceBuilder contract_instance_retrieval_builder;
    ClassIdDerivationTraceBuilder class_id_builder;
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;

    FF nullifier_tree_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(klass.packed_bytecode);
    std::vector<FF> hash_input = { simulation::compute_public_bytecode_first_field(klass.packed_bytecode.size()) };
    hash_input.reserve(1 + bytecode_fields.size());
    hash_input.insert(hash_input.end(), bytecode_fields.begin(), bytecode_fields.end());
    // Compute the bytecode commitment separately
    FF bytecode_commitment = RawPoseidon2::hash(hash_input);
    builder.process_hashing({ { .bytecode_id = bytecode_commitment,
                                .bytecode_length_in_bytes = bytecode_size,
                                .bytecode_fields = bytecode_fields } },
                            trace);
    contract_instance_retrieval_builder.process({ {
                                                    .address = instance.deployer,
                                                    .contract_instance = { instance },
                                                    .nullifier_tree_root = nullifier_tree_root,
                                                    .public_data_tree_root = public_data_tree_root,
                                                    .exists = true,
                                                } },
                                                trace);
    class_id_builder.process({ { .class_id = instance.current_contract_class_id,
                                 .artifact_hash = klass.artifact_hash,
                                 .private_functions_root = klass.private_functions_root,
                                 .public_bytecode_commitment = bytecode_commitment } },
                             trace);

    AppendOnlyTreeSnapshot snapshot_before = AppendOnlyTreeSnapshot{
        .root = FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT),
        .next_available_leaf_index = AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    AppendOnlyTreeSnapshot snapshot_after = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .next_available_leaf_index = AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE + 1,
    };

    indexed_tree_check_builder.process(
        { // Read the tree of the retrieved bytecodes
          IndexedTreeReadWriteEvent{
              .value = instance.current_contract_class_id,
              .prev_snapshot = snapshot_before,
              .next_snapshot = snapshot_before,
              .tree_height = AVM_RETRIEVED_BYTECODES_TREE_HEIGHT,
              .merkle_hash_separator = FF(DOM_SEP__RETRIEVED_BYTECODES_MERKLE),
              .low_leaf_data = IndexedTreeLeafData{ .value = 0, .next_value = 0, .next_index = 0 },
              .low_leaf_hash = 0,
              .low_leaf_index = 0,
          },
          // Insertion in the retrieved bytecodes tree
          IndexedTreeReadWriteEvent{
              .value = instance.current_contract_class_id,
              .prev_snapshot = snapshot_before,
              .next_snapshot = snapshot_after,
              .tree_height = AVM_RETRIEVED_BYTECODES_TREE_HEIGHT,
              .merkle_hash_separator = FF(DOM_SEP__RETRIEVED_BYTECODES_MERKLE),
              .low_leaf_data = IndexedTreeLeafData{ .value = 0, .next_value = 0, .next_index = 0 },
              .low_leaf_hash = 0,
              .low_leaf_index = 0,
              .write = true,
          } },
        trace);

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                  .bytecode_id = bytecode_commitment, // bytecode_id equals commitment
                                  .address = instance.deployer,
                                  .current_class_id = instance.current_contract_class_id,
                                  .contract_class = klass,
                                  .nullifier_tree_root = nullifier_tree_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .retrieved_bytecodes_snapshot_before = snapshot_before,
                                  .retrieved_bytecodes_snapshot_after = snapshot_after,
                                  .is_new_class = true,
                              } },
                              trace);

    check_relation<bc_retrieval>(trace);
    check_interaction<BytecodeTraceBuilder,
                      lookup_bc_retrieval_class_id_derivation_settings,
                      lookup_bc_retrieval_contract_instance_retrieval_settings,
                      lookup_bc_retrieval_is_new_class_check_settings,
                      lookup_bc_retrieval_retrieved_bytecodes_insertion_settings>(trace);
}

TEST_F(BytecodeRetrievalConstrainingTest, TooManyBytecodes)
{
    TestTraceContainer trace = init_trace();
    BytecodeTraceBuilder builder;

    FF nullifier_tree_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);

    AppendOnlyTreeSnapshot snapshot_before = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .next_available_leaf_index =
            MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    AppendOnlyTreeSnapshot snapshot_after = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .next_available_leaf_index =
            MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                  .bytecode_id = 0, // bytecode_id equals commitment
                                  .address = instance.deployer,
                                  .current_class_id = instance.current_contract_class_id,
                                  .nullifier_tree_root = nullifier_tree_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .retrieved_bytecodes_snapshot_before = snapshot_before,
                                  .retrieved_bytecodes_snapshot_after = snapshot_after,
                                  .is_new_class = true,
                                  .error = simulation::BytecodeRetrievalEventError::TOO_MANY_BYTECODES,
                              } },
                              trace);

    check_relation<bc_retrieval>(trace);
}

TEST_F(BytecodeRetrievalConstrainingTest, NonExistentInstance)
{

    ContractInstanceRetrievalTraceBuilder contract_instance_retrieval_builder;
    TestTraceContainer trace = init_trace();
    FF contract_address = FF::random_element();

    // Instance retrieval enforces current_class_id = 0 when exists = 0:
    contract_instance_retrieval_builder.process({ {
                                                    .address = contract_address,
                                                    .exists = false,
                                                } },
                                                trace);

    // Manually set up a row where instance_exists = 0
    // All other fields should be forced to 0 by constraints
    trace.set(
        1,
        { {
            { C::bc_retrieval_sel, 1 },
            { C::bc_retrieval_instance_exists, 0 },
            { C::bc_retrieval_current_class_id, 0 },
            { C::bc_retrieval_artifact_hash, 0 },
            { C::bc_retrieval_private_functions_root, 0 },
            { C::bc_retrieval_bytecode_id, 0 },
            { C::bc_retrieval_address, contract_address },
            { C::bc_retrieval_prev_retrieved_bytecodes_tree_size, 1 },
            { C::bc_retrieval_next_retrieved_bytecodes_tree_size, 1 },
            { C::bc_retrieval_retrieved_bytecodes_tree_height, AVM_RETRIEVED_BYTECODES_TREE_HEIGHT },
            { C::bc_retrieval_retrieved_bytecodes_merkle_separator, DOM_SEP__RETRIEVED_BYTECODES_MERKLE },
            { C::bc_retrieval_remaining_bytecodes_inv, FF(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS).invert() },
            { C::bc_retrieval_error, 1 },
        } });

    check_relation<bc_retrieval>(trace);

    // mutate the current_class_id and confirm that a violation as it should be 0
    trace.set(C::bc_retrieval_current_class_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<BytecodeTraceBuilder, lookup_bc_retrieval_contract_instance_retrieval_settings>(trace)),
        "Failed.*LOOKUP_BC_RETRIEVAL_CONTRACT_INSTANCE_RETRIEVAL.*Could not find tuple in destination.");

    trace.set(C::contract_instance_retrieval_current_class_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bb::avm2::contract_instance_retrieval<FF>>(trace),
        bb::avm2::contract_instance_retrieval<FF>::get_subrelation_label(
            bb::avm2::contract_instance_retrieval<FF>::SR_INSTANCE_MEMBER_CLASS_ID_IS_ZERO_IF_DNE));

    // reset
    trace.set(C::bc_retrieval_current_class_id, 1, 0);
    trace.set(C::contract_instance_retrieval_current_class_id, 1, 0);

    // mutate the bytecode_id and confirm that it is a violation
    trace.set(C::bc_retrieval_bytecode_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace),
                              bc_retrieval::get_subrelation_label(bc_retrieval::SR_BYTECODE_ID_IS_ZERO_IF_ERROR));
    // reset
    trace.set(C::bc_retrieval_bytecode_id, 1, 0);
}

class BytecodeRetrievalConstrainingTestFewerMocks : public BytecodeRetrievalConstrainingTest {
  public:
    EventEmitter<simulation::Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<simulation::Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<simulation::Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    EventEmitter<simulation::MerkleCheckEvent> merkle_check_emitter;
    EventEmitter<simulation::RangeCheckEvent> range_check_emitter;
    EventEmitter<simulation::FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<simulation::IndexedTreeCheckEvent> indexed_tree_check_event_emitter;

    StrictMock<MockGreaterThan> mock_gt;
    StrictMock<MockExecutionIdManager> mock_execution_id_manager;

    Poseidon2TraceBuilder poseidon2_builder;

    Poseidon2 poseidon2 =
        Poseidon2(mock_execution_id_manager, mock_gt, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);
    MerkleCheck merkle_check = MerkleCheck(poseidon2, merkle_check_emitter);
    RangeCheck range_check = RangeCheck(range_check_emitter);
    FieldGreaterThan field_gt = FieldGreaterThan(range_check, field_gt_emitter);
    IndexedTreeCheck indexed_tree_check = IndexedTreeCheck(
        poseidon2, merkle_check, field_gt, DOM_SEP__RETRIEVED_BYTECODES_MERKLE, indexed_tree_check_event_emitter);

    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check =
        RetrievedBytecodesTreeCheck(indexed_tree_check, simulation::build_retrieved_bytecodes_tree());

    BytecodeTraceBuilder builder;
    ContractInstanceRetrievalTraceBuilder contract_instance_retrieval_builder;
    ClassIdDerivationTraceBuilder class_id_builder;
    IndexedTreeCheckTraceBuilder indexed_tree_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    PrecomputedTraceBuilder precomputed_builder;
};

TEST_F(BytecodeRetrievalConstrainingTestFewerMocks, SuccessfulRetrievalFewerMocks)
{
    TestTraceContainer trace = init_trace();

    FF nullifier_tree_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(klass.packed_bytecode);
    std::vector<FF> hash_input = { simulation::compute_public_bytecode_first_field(klass.packed_bytecode.size()) };
    hash_input.reserve(1 + bytecode_fields.size());
    hash_input.insert(hash_input.end(), bytecode_fields.begin(), bytecode_fields.end());
    // Compute the bytecode commitment separately
    FF bytecode_commitment = poseidon2.hash(hash_input);
    builder.process_decomposition({ { .bytecode_id = bytecode_commitment,
                                      .bytecode = std::make_shared<std::vector<uint8_t>>(klass.packed_bytecode) } },
                                  trace);
    trace.set(1, { { { C::bc_decomposition_sel_packed_read_0_, 1 } } });
    builder.process_hashing({ { .bytecode_id = bytecode_commitment,
                                .bytecode_length_in_bytes = bytecode_size,
                                .bytecode_fields = bytecode_fields } },
                            trace);
    // Compute the class id separately to produce the hash event, and replace the mocked value
    FF class_id = poseidon2.hash(
        { DOM_SEP__CONTRACT_CLASS_ID, klass.artifact_hash, klass.private_functions_root, bytecode_commitment });
    instance.current_contract_class_id = class_id;
    klass.id = class_id;
    contract_instance_retrieval_builder.process({ {
                                                    .address = instance.deployer,
                                                    .contract_instance = { instance },
                                                    .nullifier_tree_root = nullifier_tree_root,
                                                    .public_data_tree_root = public_data_tree_root,
                                                    .exists = true,
                                                } },
                                                trace);

    class_id_builder.process({ { .class_id = klass.id,
                                 .artifact_hash = klass.artifact_hash,
                                 .private_functions_root = klass.private_functions_root,
                                 .public_bytecode_commitment = bytecode_commitment } },
                             trace);

    AppendOnlyTreeSnapshot snapshot_before = retrieved_bytecodes_tree_check.get_snapshot();

    // Read the tree of the retrieved bytecodes
    retrieved_bytecodes_tree_check.contains(instance.current_contract_class_id);

    // Insertion in the retrieved bytecodes tree
    retrieved_bytecodes_tree_check.insert(instance.current_contract_class_id);

    AppendOnlyTreeSnapshot snapshot_after = retrieved_bytecodes_tree_check.get_snapshot();

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                  .bytecode_id = bytecode_commitment, // bytecode_id equals commitment
                                  .address = instance.deployer,
                                  .current_class_id = instance.current_contract_class_id,
                                  .contract_class = klass,
                                  .nullifier_tree_root = nullifier_tree_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .retrieved_bytecodes_snapshot_before = snapshot_before,
                                  .retrieved_bytecodes_snapshot_after = snapshot_after,
                                  .is_new_class = true,
                              } },
                              trace);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<bc_retrieval>(trace);
    check_relation<bb::avm2::bc_decomposition<FF>>(trace);
    check_relation<bb::avm2::bc_hashing<FF>>(trace);
    check_relation<bb::avm2::contract_instance_retrieval<FF>>(trace);
    check_relation<bb::avm2::class_id_derivation<FF>>(trace);
    check_relation<bb::avm2::indexed_tree_check<FF>>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
    check_all_interactions<ClassIdDerivationTraceBuilder>(trace);
}

TEST_F(BytecodeRetrievalConstrainingTestFewerMocks, SuccessfulRepeatedRetrievalFewerMocks)
{
    TestTraceContainer trace = init_trace();

    FF nullifier_tree_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(klass.packed_bytecode);
    std::vector<FF> hash_input = { simulation::compute_public_bytecode_first_field(klass.packed_bytecode.size()) };
    hash_input.reserve(1 + bytecode_fields.size());
    hash_input.insert(hash_input.end(), bytecode_fields.begin(), bytecode_fields.end());
    // Compute the bytecode commitment separately
    FF bytecode_commitment = poseidon2.hash(hash_input);
    builder.process_decomposition({ { .bytecode_id = bytecode_commitment,
                                      .bytecode = std::make_shared<std::vector<uint8_t>>(klass.packed_bytecode) } },
                                  trace);
    trace.set(1, { { { C::bc_decomposition_sel_packed_read_0_, 1 } } });
    builder.process_hashing({ { .bytecode_id = bytecode_commitment,
                                .bytecode_length_in_bytes = bytecode_size,
                                .bytecode_fields = bytecode_fields } },
                            trace);

    // Compute the class id separately to produce the hash event, and replace the mocked value
    FF class_id = poseidon2.hash(
        { DOM_SEP__CONTRACT_CLASS_ID, klass.artifact_hash, klass.private_functions_root, bytecode_commitment });
    instance.current_contract_class_id = class_id;
    klass.id = class_id;
    contract_instance_retrieval_builder.process({ {
                                                    .address = instance.deployer,
                                                    .contract_instance = { instance },
                                                    .nullifier_tree_root = nullifier_tree_root,
                                                    .public_data_tree_root = public_data_tree_root,
                                                    .exists = true,
                                                } },
                                                trace);
    class_id_builder.process({ { .class_id = klass.id,
                                 .artifact_hash = klass.artifact_hash,
                                 .private_functions_root = klass.private_functions_root,
                                 .public_bytecode_commitment = bytecode_commitment } },
                             trace);

    AppendOnlyTreeSnapshot snapshot_before = retrieved_bytecodes_tree_check.get_snapshot();

    // Read the tree of the retrieved bytecodes
    retrieved_bytecodes_tree_check.contains(instance.current_contract_class_id);

    // Insertion in the retrieved bytecodes tree
    retrieved_bytecodes_tree_check.insert(instance.current_contract_class_id);

    AppendOnlyTreeSnapshot snapshot_after = retrieved_bytecodes_tree_check.get_snapshot();

    // Retrieve the same again:

    // Read the tree of the retrieved bytecodes
    retrieved_bytecodes_tree_check.contains(instance.current_contract_class_id);

    // 'Insertion' in the retrieved bytecodes tree (shouldn't write)
    retrieved_bytecodes_tree_check.insert(instance.current_contract_class_id);

    indexed_tree_check_builder.process(indexed_tree_check_event_emitter.dump_events(), trace);

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                    .bytecode_id = bytecode_commitment, // bytecode_id equals commitment
                                    .address = instance.deployer,
                                    .current_class_id = instance.current_contract_class_id,
                                    .contract_class = klass,
                                    .nullifier_tree_root = nullifier_tree_root,
                                    .public_data_tree_root = public_data_tree_root,
                                    .retrieved_bytecodes_snapshot_before = snapshot_before,
                                    .retrieved_bytecodes_snapshot_after = snapshot_after,
                                    .is_new_class = true,
                                },
                                {
                                    .bytecode_id = bytecode_commitment, // bytecode_id equals commitment
                                    .address = instance.deployer,
                                    .current_class_id = instance.current_contract_class_id,
                                    .contract_class = klass,
                                    .nullifier_tree_root = nullifier_tree_root,
                                    .public_data_tree_root = public_data_tree_root,
                                    .retrieved_bytecodes_snapshot_before = snapshot_after,
                                    .retrieved_bytecodes_snapshot_after = snapshot_after,
                                    .is_new_class = false,
                                } },
                              trace);

    precomputed_builder.process_misc(trace, 256);
    precomputed_builder.process_sel_range_8(trace);
    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    check_relation<bc_retrieval>(trace);
    check_relation<bb::avm2::bc_decomposition<FF>>(trace);
    check_relation<bb::avm2::bc_hashing<FF>>(trace);
    check_relation<bb::avm2::contract_instance_retrieval<FF>>(trace);
    check_relation<bb::avm2::class_id_derivation<FF>>(trace);
    check_relation<bb::avm2::indexed_tree_check<FF>>(trace);
    check_all_interactions<BytecodeTraceBuilder>(trace);
    check_all_interactions<ClassIdDerivationTraceBuilder>(trace);

    // We cannot claim the second retrieval refers to a new class:
    // (1) The lookup into the transient tree will have leaf_not_exists == 0 at the root, which is
    // constrained in execution to either be continuous or correctly transitioned when adding a bytecode:
    trace.set(C::bc_retrieval_is_new_class, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(check_all_interactions<BytecodeTraceBuilder>(trace), "IS_NEW_CLASS_CHECK");
    // (2) Attempting to maliciously set not_exists == 1 will fail the transient tree's leaf checks:
    trace.set(C::indexed_tree_check_not_exists, 2, 1);
    trace.set(C::indexed_tree_check_exists, 2, 0);
    check_all_interactions<BytecodeTraceBuilder>(trace);
    check_relation<bc_retrieval>(trace);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<bb::avm2::indexed_tree_check<FF>>(trace),
        bb::avm2::indexed_tree_check<FF>::get_subrelation_label(bb::avm2::indexed_tree_check<FF>::SR_EXISTS_CHECK));
}

} // namespace
} // namespace bb::avm2::constraining
