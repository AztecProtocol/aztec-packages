#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>
#include <memory>
#include <vector>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/bc_retrieval.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/bytecode_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using testing::random_contract_class;
using testing::random_contract_instance;
using tracegen::BytecodeTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using bc_retrieval = bb::avm2::bc_retrieval<FF>;

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

    FF nullifier_root = FF::random_element();
    FF public_data_tree_root = FF::random_element();

    ContractInstance instance = random_contract_instance();
    uint32_t bytecode_size = 20;
    ContractClass klass = random_contract_class(/*bytecode_size=*/bytecode_size);

    // Build a bytecode retrieval event where instance exists
    builder.process_retrieval({ { .bytecode_id = klass.public_bytecode_commitment, // bytecode_id equals commitment
                                  .address = instance.deployer_addr,
                                  .current_class_id = instance.current_class_id,
                                  .contract_class = klass,
                                  .nullifier_root = nullifier_root,
                                  .public_data_tree_root = public_data_tree_root,
                                  .error = false } },
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
    trace.set(1,
              { {
                  { C::bc_retrieval_sel, 1 },
                  { C::bc_retrieval_instance_exists, 0 },
                  { C::bc_retrieval_current_class_id, 0 },
                  { C::bc_retrieval_artifact_hash, 0 },
                  { C::bc_retrieval_private_function_root, 0 },
                  { C::bc_retrieval_bytecode_id, 0 },
                  { C::bc_retrieval_address, contract_address },
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
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace), "ARTIFACT_HASH_IS_ZERO_IF_INSTANCE_DOES_NOT_EXIST");
    // reset
    trace.set(C::bc_retrieval_artifact_hash, 1, 0);

    // mutate the private_function_root and confirm that it is a violation
    trace.set(C::bc_retrieval_private_function_root, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace),
                              "PRIVATE_FUNCTION_ROOT_IS_ZERO_IF_INSTANCE_DOES_NOT_EXIST");
    // reset
    trace.set(C::bc_retrieval_private_function_root, 1, 0);

    // mutate the bytecode_id and confirm that it is a violation
    trace.set(C::bc_retrieval_bytecode_id, 1, 99);
    EXPECT_THROW_WITH_MESSAGE(check_relation<bc_retrieval>(trace), "BYTECODE_ID_IS_ZERO_IF_INSTANCE_DOES_NOT_EXIST");
    // reset
    trace.set(C::bc_retrieval_bytecode_id, 1, 0);
}

} // namespace
} // namespace bb::avm2::constraining
