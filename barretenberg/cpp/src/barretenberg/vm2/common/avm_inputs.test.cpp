#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <cstdint>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

namespace bb::avm2 {
namespace {

using ::testing::SizeIs;

TEST(AvmInputsTest, Deserialization)
{
    // cwd is expected to be barretenberg/cpp/build.
    auto data = read_file("../src/barretenberg/vm2/common/avm_inputs.testdata.bin");
    // We only check that deserialization does not crash.
    // Correctness of the deserialization itself is assumed via MessagePack.
    // What we are testing here is that the structure of the inputs in TS matches the C++ structs
    // that we have here. If someone changes the structure of the inputs in TS, this test would
    // force them to update the C++ structs as well (and therefore any usage of these structs).
    AvmProvingInputs::from(data);
}

TEST(AvmInputsTest, FormatTransformations)
{
    using ::testing::AllOf;
    using ::testing::ElementsAre;

    PublicInputs pi = testing::get_minimal_trace_with_pi().second;
    auto as_cols = pi.to_columns();
    auto flattened = PublicInputs::columns_to_flat(as_cols);
    auto unflattened = PublicInputs::flat_to_columns(flattened);

    ASSERT_THAT(as_cols, SizeIs(AVM_NUM_PUBLIC_INPUT_COLUMNS));
    for (size_t i = 0; i < AVM_NUM_PUBLIC_INPUT_COLUMNS; ++i) {
        EXPECT_THAT(as_cols[i], SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH));
    }
    EXPECT_THAT(flattened, SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));

    EXPECT_EQ(as_cols, unflattened);
}

TEST(AvmInputsTest, ValuesInColumns)
{
    // Create a test PublicInputs with specific values in currently-implemented fields
    PublicInputs pi;

    // Set global variables
    pi.globalVariables.blockNumber = 12345;

    // Set start tree snapshots
    pi.startTreeSnapshots.l1ToL2MessageTree.root = 1000;
    pi.startTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex = 2000;
    pi.startTreeSnapshots.noteHashTree.root = 3000;
    pi.startTreeSnapshots.noteHashTree.nextAvailableLeafIndex = 4000;
    pi.startTreeSnapshots.nullifierTree.root = 5000;
    pi.startTreeSnapshots.nullifierTree.nextAvailableLeafIndex = 6000;
    pi.startTreeSnapshots.publicDataTree.root = 7000;
    pi.startTreeSnapshots.publicDataTree.nextAvailableLeafIndex = 8000;

    // Set reverted flag
    pi.reverted = true;

    // Get the columns representation
    auto columns = pi.to_columns();

    // Convert to flat array for easier testing
    auto flat = PublicInputs::columns_to_flat(columns);
    ASSERT_THAT(flat, SizeIs(AVM_PUBLIC_INPUTS_COLUMNS_COMBINED_LENGTH));

    // Define column offsets based on the total number of rows per column
    const size_t col0_offset = 0;
    const size_t col1_offset = AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH;
    const size_t col2_offset = static_cast<size_t>(2 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);
    const size_t col3_offset = static_cast<size_t>(3 * AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH);

    // Verify specific values are at the expected positions

    // Global variables
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX],
              pi.globalVariables.blockNumber);

    // Start tree snapshots
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.startTreeSnapshots.l1ToL2MessageTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX],
              pi.startTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.startTreeSnapshots.noteHashTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX],
              pi.startTreeSnapshots.noteHashTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.startTreeSnapshots.nullifierTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX],
              pi.startTreeSnapshots.nullifierTree.nextAvailableLeafIndex);
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.startTreeSnapshots.publicDataTree.root);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX],
              pi.startTreeSnapshots.publicDataTree.nextAvailableLeafIndex);

    // Reverted status
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX], pi.reverted);

    // Check some unset locations to make sure they're zero initialized
    EXPECT_EQ(flat[col0_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 0);
    EXPECT_EQ(flat[col1_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 0);
    EXPECT_EQ(flat[col2_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 0);
    EXPECT_EQ(flat[col3_offset + AVM_PUBLIC_INPUTS_END_GAS_USED_ROW_IDX], 0);
}

} // namespace
} // namespace bb::avm2
