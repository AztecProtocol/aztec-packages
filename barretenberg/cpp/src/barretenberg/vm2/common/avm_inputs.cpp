#include "barretenberg/vm2/common/avm_inputs.hpp"

#include <vector>

#include "barretenberg/serialize/msgpack.hpp"

namespace bb::avm2 {

PublicInputs PublicInputs::from(const std::vector<uint8_t>& data)
{
    PublicInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

AvmProvingInputs AvmProvingInputs::from(const std::vector<uint8_t>& data)
{
    AvmProvingInputs inputs;
    msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size()).get().convert(inputs);
    return inputs;
}

std::vector<std::vector<FF>> PublicInputs::to_columns() const
{
    std::vector<std::vector<FF>> cols(AVM_NUM_PUBLIC_INPUT_COLUMNS,
                                      std::vector<FF>(AVM_PUBLIC_INPUTS_COLUMNS_MAX_LENGTH, FF(0)));

    // TODO(dbanks12): globalsVariables
    cols[0][AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX] = globalVariables.blockNumber;

    // start tree snapshots
    cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] =
        startTreeSnapshots.l1ToL2MessageTree.root;
    cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_L1_TO_L2_MESSAGE_TREE_ROW_IDX] =
        startTreeSnapshots.l1ToL2MessageTree.nextAvailableLeafIndex;
    cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] = startTreeSnapshots.noteHashTree.root;
    cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NOTE_HASH_TREE_ROW_IDX] =
        startTreeSnapshots.noteHashTree.nextAvailableLeafIndex;
    cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] = startTreeSnapshots.nullifierTree.root;
    cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_NULLIFIER_TREE_ROW_IDX] =
        startTreeSnapshots.nullifierTree.nextAvailableLeafIndex;
    cols[0][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] = startTreeSnapshots.publicDataTree.root;
    cols[1][AVM_PUBLIC_INPUTS_START_TREE_SNAPSHOTS_PUBLIC_DATA_TREE_ROW_IDX] =
        startTreeSnapshots.publicDataTree.nextAvailableLeafIndex;

    // TODO(dbanks12): start gas used
    // TODO(dbanks12): gas settings
    // TODO(dbanks12): fee payer
    // TODO(dbanks12): public setup call requests
    // TODO(dbanks12): public app logic call requests
    // TODO(dbanks12): public teardown call request
    // TODO(dbanks12): previous non revertible accumulated data array lengths
    // TODO(dbanks12): previous revertible accumulated data array lengths
    // TODO(dbanks12): previous non revertible accumulated data
    // TODO(dbanks12): previous revertible accumulated data
    // TODO(dbanks12): end tree snapshots
    // TODO(dbanks12): end gas used
    // TODO(dbanks12): accumulated data
    // TODO(dbanks12): transaction fee

    // reverted
    cols[0][AVM_PUBLIC_INPUTS_REVERTED_ROW_IDX] = static_cast<uint8_t>(reverted);

    return cols;
}

} // namespace bb::avm2
