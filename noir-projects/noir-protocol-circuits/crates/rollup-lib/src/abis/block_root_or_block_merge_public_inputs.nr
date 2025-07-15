use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, epoch_constant_data::EpochConstantData,
        global_variables::GlobalVariables,
    },
    address::EthAddress,
    constants::{AZTEC_MAX_EPOCH_DURATION, BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH},
    traits::{Deserialize, Empty, Serialize},
};
use blob::blob_batching_public_inputs::BlockBlobPublicInputs;

#[derive(Deserialize, Eq, Serialize)]
pub struct FeeRecipient {
    pub recipient: EthAddress,
    pub value: Field,
}

// TODO(#7346): Should the default empty value be MAX_FIELD? The zero addr may be a valid recipient
impl Empty for FeeRecipient {
    fn empty() -> Self {
        Self { recipient: EthAddress::zero(), value: 0 }
    }
}

#[derive(Deserialize, Eq, Serialize)]
pub struct BlockRootOrBlockMergePublicInputs {
    pub constants: EpochConstantData,
    pub previous_archive: AppendOnlyTreeSnapshot, // Archive tree root immediately before this block range
    pub new_archive: AppendOnlyTreeSnapshot, // Archive tree root after adding this block range
    pub start_global_variables: GlobalVariables, // Global variables for the first block in the range
    pub end_global_variables: GlobalVariables, // Global variables for the last block in the range
    pub out_hash: Field, // Merkle node of the L2-to-L1 messages merkle roots in the block range
    pub proposed_block_header_hashes: [Field; AZTEC_MAX_EPOCH_DURATION], // Hashes of proposed block headers for the block range
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION], // Concatenation of all coinbase and fees for the block range
    pub blob_public_inputs: BlockBlobPublicInputs, // Blob accumulators at the start and end of this block range
}

impl BlockRootOrBlockMergePublicInputs {
    pub fn num_blocks(self) -> u32 {
        self.end_global_variables.block_number - self.start_global_variables.block_number + 1
    }
}

impl Empty for BlockRootOrBlockMergePublicInputs {
    fn empty() -> Self {
        BlockRootOrBlockMergePublicInputs {
            constants: EpochConstantData::empty(),
            previous_archive: AppendOnlyTreeSnapshot::empty(),
            new_archive: AppendOnlyTreeSnapshot::empty(),
            start_global_variables: GlobalVariables::empty(),
            end_global_variables: GlobalVariables::empty(),
            out_hash: 0,
            proposed_block_header_hashes: [0; AZTEC_MAX_EPOCH_DURATION],
            fees: [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION],
            blob_public_inputs: BlockBlobPublicInputs::empty(),
        }
    }
}

#[test]
fn serialization_of_empty() {
    let item = BlockRootOrBlockMergePublicInputs::empty();
    // We use the BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH constant to ensure that there is a match between
    // the derived trait implementation and the constant.
    let serialized: [Field; BLOCK_ROOT_OR_BLOCK_MERGE_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = BlockRootOrBlockMergePublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}
