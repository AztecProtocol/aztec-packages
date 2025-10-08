use dep::types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, epoch_constant_data::EpochConstantData,
        fee_recipient::FeeRecipient,
    },
    constants::{AZTEC_MAX_EPOCH_DURATION, CHECKPOINT_ROLLUP_PUBLIC_INPUTS_LENGTH},
    tests::utils::make_fixture,
    traits::{Deserialize, Empty, Serialize},
    utils::arrays::array_length,
};
use blob::abis::{BlobAccumulator, FinalBlobBatchingChallenges};

/// Public inputs for the checkpoint root and checkpoint merge rollup circuits.
#[derive(Deserialize, Eq, Serialize)]
pub struct CheckpointRollupPublicInputs {
    pub constants: EpochConstantData,

    // Archive tree root immediately before this checkpoint range.
    pub previous_archive: AppendOnlyTreeSnapshot,
    // Archive tree root after applying this checkpoint range.
    pub new_archive: AppendOnlyTreeSnapshot,

    // Hashes of checkpoint headers for this checkpoint range.
    pub checkpoint_header_hashes: [Field; AZTEC_MAX_EPOCH_DURATION],

    // TODO(#15793): Keep accumulating `out_hash` all the way up to the root rollup, and set the final hash on L1 when
    // proving an epoch.
    // pub out_hash: Field,

    // Concatenation of all coinbase and fees for each checkpoint in this checkpoint range.
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION],

    // Accumulated opening proofs for all blobs before this checkpoint range.
    pub start_blob_accumulator: BlobAccumulator,
    // Accumulated opening proofs for all blobs after adding this checkpoint range.
    pub end_blob_accumulator: BlobAccumulator,
    // Final values z and gamma. Shared across the epoch.
    pub final_blob_challenges: FinalBlobBatchingChallenges,
}

impl CheckpointRollupPublicInputs {
    pub fn num_checkpoints(self) -> u16 {
        // Each checkpoint inserts its header hash into the `checkpoint_header_hashes` array.
        // The number of checkpoints is equal to the number of non-empty hashes in the array.
        // When merging two checkpoints, the checkpoint_merge circuit checks that the total number of checkpoints
        // does not exceed the size of the `checkpoint_header_hashes` array.
        array_length(self.checkpoint_header_hashes) as u16
    }
}

impl Empty for CheckpointRollupPublicInputs {
    fn empty() -> Self {
        Self {
            constants: EpochConstantData::empty(),
            previous_archive: AppendOnlyTreeSnapshot::empty(),
            new_archive: AppendOnlyTreeSnapshot::empty(),
            checkpoint_header_hashes: [0; AZTEC_MAX_EPOCH_DURATION],
            fees: [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION],
            start_blob_accumulator: BlobAccumulator::empty(),
            end_blob_accumulator: BlobAccumulator::empty(),
            final_blob_challenges: FinalBlobBatchingChallenges::empty(),
        }
    }
}

#[test]
fn serialization_of_checkpoint_rollup_public_inputs() {
    let item: CheckpointRollupPublicInputs = make_fixture(1);
    let serialized: [Field; CHECKPOINT_ROLLUP_PUBLIC_INPUTS_LENGTH] = item.serialize();
    let deserialized = CheckpointRollupPublicInputs::deserialize(serialized);
    assert(item.eq(deserialized));
}

#[test]
fn correct_num_checkpoints() {
    let mut item: CheckpointRollupPublicInputs = make_fixture(1);
    item.checkpoint_header_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
    item.checkpoint_header_hashes[0] = 11;
    item.checkpoint_header_hashes[1] = 22;
    item.checkpoint_header_hashes[2] = 33;
    assert_eq(item.num_checkpoints(), 3);
}
