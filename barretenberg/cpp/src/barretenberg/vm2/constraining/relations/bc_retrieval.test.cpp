#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_retrieval.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"
#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using testing::random_contract_class;
using testing::random_contract_instance;
using tracegen::BytecodeTraceBuilder;
using tracegen::ClassIdDerivationTraceBuilder;
using tracegen::ContractInstanceRetrievalTraceBuilder;
using tracegen::RetrievedBytecodesTreeCheckTraceBuilder;
using tracegen::TestTraceContainer;

using simulation::ClassIdLeafValue;
using simulation::RetrievedBytecodesTreeCheckEvent;
using simulation::RetrievedBytecodesTreeLeafPreimage;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_retrieval = bb::avm2::bc_retrieval<FF>;
using RawPoseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

void init_trace(TestTraceContainer& trace)
{
    // Add first row.
    trace.set(C::precomputed_first_row, 0, 1);
}

TEST(BytecodeRetrievalConstrainingTest, EmptyRow)
{
    check_relation<bc_retrieval>(testing::empty_trace());
}

TEST(BytecodeRetrievalConstrainingTest, SuccessfulRetrieval)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;
    ContractInstanceRetrievalTraceBuilder contract_instance_retrieval_builder;
    ClassIdDerivationTraceBuilder class_id_builder;
    RetrievedBytecodesTreeCheckTraceBuilder retrieved_bytecodes_tree_check_builder;

    FF nullifier_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);
    std::vector<FF> bytecode_fields = simulation::encode_bytecode(klass.packed_bytecode);
    std::vector<FF> hash_input = { GENERATOR_INDEX__PUBLIC_BYTECODE };
    hash_input.insert(hash_input.end(), bytecode_fields.begin(), bytecode_fields.end());
    // random_contract_class() assigns a random FF as the commitment, so we overwrite to ensure the below passes:
    klass.public_bytecode_commitment = RawPoseidon2::hash(hash_input);
    builder.process_hashing({ { .bytecode_id = klass.public_bytecode_commitment,
                                .bytecode_length = bytecode_size,
                                .bytecode_fields = bytecode_fields } },
                            trace);
    contract_instance_retrieval_builder.process({ {
                                                    .address = instance.deployer_addr,
                                                    .contract_instance = { instance },
                                                    .nullifier_tree_root = nullifier_root,
                                                    .public_data_tree_root = public_data_tree_root,
                                                    .exists = true,
                                                } },
                                                trace);
    class_id_builder.process({ { .class_id = instance.current_class_id, .klass = klass } }, trace);

    AppendOnlyTreeSnapshot snapshot_before = AppendOnlyTreeSnapshot{
        .root = FF(AVM_RETRIEVED_BYTECODES_TREE_INITIAL_ROOT),
        .nextAvailableLeafIndex = AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    AppendOnlyTreeSnapshot snapshot_after = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .nextAvailableLeafIndex = AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE + 1,
    };

    // Read the tree of the retrieved bytecodes
    retrieved_bytecodes_tree_check_builder.process(
        { RetrievedBytecodesTreeCheckEvent{
            .class_id = instance.current_class_id,
            .prev_snapshot = snapshot_before,
            .next_snapshot = snapshot_after,
            .low_leaf_preimage = RetrievedBytecodesTreeLeafPreimage(ClassIdLeafValue(0), 0, 0),
            .low_leaf_index = 0,
        } },
        trace);

    // Insertion in the retrieved bytecodes tree
    retrieved_bytecodes_tree_check_builder.process(
        { RetrievedBytecodesTreeCheckEvent{
            .class_id = instance.current_class_id,
            .prev_snapshot = snapshot_before,
            .next_snapshot = snapshot_after,
            .low_leaf_preimage = RetrievedBytecodesTreeLeafPreimage(ClassIdLeafValue(0), 0, 0),
            .low_leaf_index = 0,
            .write = true,
        } },
        trace);

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                  .bytecode_id = klass.public_bytecode_commitment, // bytecode_id equals commitment
                                  .address = instance.deployer_addr,
                                  .current_class_id = instance.current_class_id,
                                  .contract_class = klass,
                                  .nullifier_root = nullifier_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .retrieved_bytecodes_snapshot_before = snapshot_before,
                                  .retrieved_bytecodes_snapshot_after = snapshot_after,
                                  .is_new_class = true,
                              } },
                              trace);

    check_relation<bc_retrieval>(trace);
    check_interaction<BytecodeTraceBuilder,
                      lookup_bc_retrieval_bytecode_hash_is_correct_settings,
                      lookup_bc_retrieval_class_id_derivation_settings,
                      lookup_bc_retrieval_contract_instance_retrieval_settings,
                      lookup_bc_retrieval_is_new_class_check_settings,
                      lookup_bc_retrieval_retrieved_bytecodes_insertion_settings>(trace);
}

TEST(BytecodeRetrievalConstrainingTest, TooManyBytecodes)
{
    TestTraceContainer trace;
    init_trace(trace);
    BytecodeTraceBuilder builder;

    FF nullifier_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);

    AppendOnlyTreeSnapshot snapshot_before = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .nextAvailableLeafIndex =
            MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    AppendOnlyTreeSnapshot snapshot_after = AppendOnlyTreeSnapshot{
        .root = FF(42),
        .nextAvailableLeafIndex =
            MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS + AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE,
    };

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ {
                                  .bytecode_id = 0, // bytecode_id equals commitment
                                  .address = instance.deployer_addr,
                                  .current_class_id = instance.current_class_id,
                                  .nullifier_root = nullifier_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .retrieved_bytecodes_snapshot_before = snapshot_before,
                                  .retrieved_bytecodes_snapshot_after = snapshot_after,
                                  .is_new_class = true,
                                  .limit_error = true,
                              } },
                              trace);

    check_relation<bc_retrieval>(trace);
}

TEST(BytecodeRetrievalConstrainingTest, NonExistentInstance)
{

    TestTraceContainer trace;
    init_trace(trace);

    FF contract_address = FF::random_element();

    // Manually set up a row where instance_exists = 0
    // All other fields should be forced to 0 by constraints
    trace.set(
        1,
        { {
            { C::bc_retrieval_sel, 1 },
            { C::bc_retrieval_instance_exists, 0 },
            { C::bc_retrieval_current_class_id, 0 },
            { C::bc_retrieval_artifact_hash, 0 },
            { C::bc_retrieval_private_function_root, 0 },
            { C::bc_retrieval_bytecode_id, 0 },
            { C::bc_retrieval_address, contract_address },
            { C::bc_retrieval_prev_retrieved_bytecodes_tree_size, 1 },
            { C::bc_retrieval_next_retrieved_bytecodes_tree_size, 1 },
            { C::bc_retrieval_remaining_bytecodes_inv, FF(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS).invert() },
            { C::bc_retrieval_error, 1 },
        } });

    check_relation<bc_retrieval>(trace);

    // mutate the current_class_id and confirm that a violation as it should be 0
    trace.set(C::bc_retrieval_current_class_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace),
                              "CURRENT_CLASS_ID_IS_ZERO_IF_INSTANCE_DOES_NOT_EXIST");
    // reset
    trace.set(C::bc_retrieval_current_class_id, 1, 0);

    // mutate the artifact_hash and confirm that it is a violation
    trace.set(C::bc_retrieval_artifact_hash, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace), "ARTIFACT_HASH_IS_ZERO_IF_ERROR");
    // reset
    trace.set(C::bc_retrieval_artifact_hash, 1, 0);

    // mutate the private_function_root and confirm that it is a violation
    trace.set(C::bc_retrieval_private_function_root, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace), "PRIVATE_FUNCTION_ROOT_IS_ZERO_IF_ERROR");
    // reset
    trace.set(C::bc_retrieval_private_function_root, 1, 0);

    // mutate the bytecode_id and confirm that it is a violation
    trace.set(C::bc_retrieval_bytecode_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace), "BYTECODE_ID_IS_ZERO_IF_ERROR");
    // reset
    trace.set(C::bc_retrieval_bytecode_id, 1, 0);
}

} // namespace
} // namespace bb::avm2::constraining
