use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs},
    block_merge::merge_block_rollups,
};
use bignum::BLS12_381_Fr;
use blob::{
    abis::{BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges},
    blob_batching::evaluate_blobs_and_batch,
};
use types::{
    abis::{
        append_only_tree_snapshot::AppendOnlyTreeSnapshot, checkpoint_header::CheckpointHeader,
        epoch_constant_data::EpochConstantData, fee_recipient::FeeRecipient,
    },
    blob_data::SpongeBlob,
    constants::{FIELDS_PER_BLOB, MAX_CHECKPOINTS_PER_EPOCH, OUT_HASH_TREE_HEIGHT},
    merkle_tree::append_leaf_to_snapshot_sha,
    traits::{Empty, Hash},
    utils::arrays::assert_trailing_zeros,
};

pub struct CheckpointRollupPublicInputsComposer<let NumBlobs: u32> {
    merged_rollup: BlockRollupPublicInputs,
    // The below are all hints:
    previous_out_hash: AppendOnlyTreeSnapshot,
    new_out_hash_sibling_path: [Field; OUT_HASH_TREE_HEIGHT],
    start_blob_accumulator: BlobAccumulator,
    final_blob_challenges: FinalBlobBatchingChallenges,
    blobs_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    blob_commitments: [BLSPoint; NumBlobs],
    blobs_hash: Field,
}

impl<let NumBlobs: u32> CheckpointRollupPublicInputsComposer<NumBlobs> {
    pub fn new<let NumPreviousRollups: u32>(
        previous_rollups: [BlockRollupPublicInputs; NumPreviousRollups],
        // The below args are all hints:
        previous_out_hash: AppendOnlyTreeSnapshot,
        new_out_hash_sibling_path: [Field; OUT_HASH_TREE_HEIGHT],
        start_blob_accumulator: BlobAccumulator,
        final_blob_challenges: FinalBlobBatchingChallenges,
        blobs_fields: [Field; NumBlobs * FIELDS_PER_BLOB],
        blob_commitments: [BLSPoint; NumBlobs],
        blobs_hash: Field,
    ) -> Self {
        let mut merged_rollup = previous_rollups[0];
        for i in 1..NumPreviousRollups {
            merged_rollup = merge_block_rollups(merged_rollup, previous_rollups[i]);
        }

        Self {
            merged_rollup,
            previous_out_hash,
            new_out_hash_sibling_path,
            start_blob_accumulator,
            final_blob_challenges,
            blobs_fields,
            blob_commitments,
            blobs_hash,
        }
    }

    pub fn finish(self) -> CheckpointRollupPublicInputs {
        let merged_rollup = self.merged_rollup;

        let constants = EpochConstantData {
            chain_id: merged_rollup.constants.chain_id,
            version: merged_rollup.constants.version,
            vk_tree_root: merged_rollup.constants.vk_tree_root,
            protocol_contracts_hash: merged_rollup.constants.protocol_contracts_hash,
            prover_id: merged_rollup.constants.prover_id,
        };

        let new_out_hash = self.accumulate_checkpoint_out_hash(merged_rollup.out_hash);

        // Note: it might seem strange that we only write to the 0th index of an array of length
        // `MAX_CHECKPOINTS_PER_EPOCH`. "Why not output a single `Field`?". It's because we want the
        // layout of the public inputs of this Checkpoint Root circuit to match those of the Checkpoint
        // Merge circuit. In the Checkpoint Merge circuit, we use more elements of this array: we
        // progressively merge the arrays from left and right subtrees.
        let mut checkpoint_header_hashes = [0; MAX_CHECKPOINTS_PER_EPOCH];
        checkpoint_header_hashes[0] = self.create_checkpoint_header(new_out_hash.root).hash();

        // Note: as per the above note.
        let mut fees = [FeeRecipient::empty(); MAX_CHECKPOINTS_PER_EPOCH];
        fees[0] = FeeRecipient {
            recipient: merged_rollup.constants.coinbase,
            value: merged_rollup.accumulated_fees,
        };

        let end_blob_accumulator = self.get_end_blob_accumulator();

        CheckpointRollupPublicInputs {
            constants,
            previous_archive: merged_rollup.previous_archive,
            new_archive: merged_rollup.new_archive,
            previous_out_hash: self.previous_out_hash,
            new_out_hash,
            start_inbox_rolling_hash: merged_rollup.start_inbox_rolling_hash,
            end_inbox_rolling_hash: merged_rollup.end_inbox_rolling_hash,
            checkpoint_header_hashes,
            fees,
            start_blob_accumulator: self.start_blob_accumulator,
            end_blob_accumulator,
            final_blob_challenges: self.final_blob_challenges,
        }
    }

    fn accumulate_checkpoint_out_hash(self, checkpoint_out_hash: Field) -> AppendOnlyTreeSnapshot {
        append_leaf_to_snapshot_sha::<OUT_HASH_TREE_HEIGHT>(
            self.previous_out_hash,
            self.new_out_hash_sibling_path,
            checkpoint_out_hash,
        )
    }

    fn create_checkpoint_header(self, epoch_out_hash: Field) -> CheckpointHeader {
        let merged_rollup = self.merged_rollup;
        let constants = merged_rollup.constants;

        CheckpointHeader {
            last_archive_root: merged_rollup.previous_archive.root,
            block_headers_hash: merged_rollup.block_headers_hash,
            blobs_hash: self.blobs_hash,
            in_hash: merged_rollup.in_hash,
            inbox_rolling_hash: merged_rollup.end_inbox_rolling_hash,
            epoch_out_hash,
            slot_number: constants.slot_number,
            timestamp: merged_rollup.timestamp,
            coinbase: constants.coinbase,
            fee_recipient: constants.fee_recipient,
            gas_fees: constants.gas_fees,
            total_mana_used: merged_rollup.accumulated_mana_used,
            accumulated_fees: merged_rollup.accumulated_fees,
        }
    }

    fn get_end_blob_accumulator(self) -> BlobAccumulator {
        // Absorb the checkpoint end marker.
        let mut end_sponge_blob = self.merged_rollup.end_sponge_blob;
        end_sponge_blob.absorb_checkpoint_end_marker();

        let num_blob_fields = end_sponge_blob.num_absorbed_fields;

        let mut expected_end_sponge_blob = SpongeBlob::init();

        // Check that the first `num_blob_fields` of the hinted `self.blobs_fields` do match what's
        // been absorbed into the sponge.
        // Elaboration:
        // We have an `end_sponge_blob`, which is the result of incrementally absorbing data to the sponge
        // over many circuits (Tx Base circuits, Block Root circuits, and this Checkpoint Root circuit).
        // We need to give this Checkpoint Root circuit access to _all_ of that underlying data, flattened,
        // because later in this circuit we'll be interpolating that data into polynomials (one polynomial
        // per blob that we've used-up).
        // The flattened, underlying data is hinted to this circuit as `self.blobs_fields`.
        // To ensure `self.blobs_fields` actually matches the data that all of the previous circuits saw,
        // we repeat the entire sponge computation -- the one that was previously split across many
        // circuits -- entirely within this circuit in the line below.
        // We hope that `expected_end_sponge_blob == end_sponge_blob`.
        expected_end_sponge_blob.absorb(self.blobs_fields, num_blob_fields);
        assert_eq(
            end_sponge_blob,
            expected_end_sponge_blob,
            "Provided blob fields do not match the fields that were absorbed",
        );
        // Check that all fields after `num_blob_fields` are zero.
        assert_trailing_zeros(self.blobs_fields, num_blob_fields);

        let sponge_blob_hash = end_sponge_blob.squeeze();

        // Compute fracs and factor once from the shared challenge z.
        // These are reused for all blob evaluations in this checkpoint.
        let challenge_z = BLS12_381_Fr::from(self.final_blob_challenges.z);

        if !::std::runtime::is_unconstrained() {
            let end_blob_accumulator = evaluate_blobs_and_batch(
                self.blobs_fields,
                num_blob_fields,
                sponge_blob_hash,
                self.blob_commitments,
                self.final_blob_challenges,
                self.start_blob_accumulator,
                challenge_z,
            );

            end_blob_accumulator
        } else {
            // Safety: TODO(#10323): this was added to save simulation time, if/when simulation times of unconstrained are improved, remove this.
            // The sponge_blob_hash is checked in the oracle against the `hashed_blobs_fields`, so that we can mock the
            // entire oracle call and assume it's correct when it is not relevant for the tests.
            unsafe {
                blob::mock_blob_oracle::evaluate_blobs_and_batch(
                    self.blobs_fields,
                    num_blob_fields,
                    sponge_blob_hash,
                    self.blob_commitments,
                    self.final_blob_challenges,
                    self.start_blob_accumulator,
                    challenge_z,
                )
            }
        }
    }
}
