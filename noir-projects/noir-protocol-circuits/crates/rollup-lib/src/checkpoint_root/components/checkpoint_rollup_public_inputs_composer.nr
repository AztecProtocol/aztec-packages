use crate::{
    abis::{BlockRollupPublicInputs, CheckpointRollupPublicInputs},
    block_merge::merge_block_rollups,
};
use blob::{
    abis::{BlobAccumulator, BLSPoint, FinalBlobBatchingChallenges},
    blob_batching::evaluate_blobs_and_batch,
};
use types::{
    abis::{
        checkpoint_header::CheckpointHeader, epoch_constant_data::EpochConstantData,
        fee_recipient::FeeRecipient,
    },
    constants::{AZTEC_MAX_EPOCH_DURATION, FIELDS_PER_BLOB},
    content_commitment::ContentCommitment,
    traits::{Empty, Hash},
};

pub struct CheckpointRollupPublicInputsComposer<let NumBlobs: u32> {
    merged_rollup: BlockRollupPublicInputs,
    start_blob_accumulator: BlobAccumulator,
    final_blob_challenges: FinalBlobBatchingChallenges,
    blobs_fields: [Field; FIELDS_PER_BLOB * NumBlobs],
    blob_commitments: [BLSPoint; NumBlobs],
    blobs_hash: Field,
}

impl<let NumBlobs: u32> CheckpointRollupPublicInputsComposer<NumBlobs> {
    pub fn new<let NumPreviousRollups: u32>(
        previous_rollups: [BlockRollupPublicInputs; NumPreviousRollups],
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

        let mut checkpoint_header_hashes = [0; AZTEC_MAX_EPOCH_DURATION];
        checkpoint_header_hashes[0] = self.create_checkpoint_header().hash();

        let mut fees = [FeeRecipient::empty(); AZTEC_MAX_EPOCH_DURATION];
        fees[0] = FeeRecipient {
            recipient: merged_rollup.constants.coinbase,
            value: merged_rollup.accumulated_fees,
        };

        let end_blob_accumulator = self.get_end_blob_accumulator();

        CheckpointRollupPublicInputs {
            constants,
            previous_archive: merged_rollup.previous_archive,
            new_archive: merged_rollup.new_archive,
            checkpoint_header_hashes,
            fees,
            start_blob_accumulator: self.start_blob_accumulator,
            end_blob_accumulator,
            final_blob_challenges: self.final_blob_challenges,
        }
    }

    fn create_checkpoint_header(self) -> CheckpointHeader {
        let merged_rollup = self.merged_rollup;
        let constants = merged_rollup.constants;

        let content_commitment = ContentCommitment {
            blobs_hash: self.blobs_hash,
            in_hash: merged_rollup.in_hash,
            out_hash: merged_rollup.out_hash,
        };

        CheckpointHeader {
            last_archive_root: merged_rollup.previous_archive.root,
            content_commitment,
            slot_number: constants.slot_number,
            timestamp: merged_rollup.end_timestamp,
            coinbase: constants.coinbase,
            fee_recipient: constants.fee_recipient,
            gas_fees: constants.gas_fees,
            total_mana_used: merged_rollup.accumulated_mana_used,
        }
    }

    fn get_end_blob_accumulator(self) -> BlobAccumulator {
        let mut end_sponge_blob = self.merged_rollup.end_sponge_blob;
        let sponge_blob_hash = end_sponge_blob.squeeze();

        if !dep::std::runtime::is_unconstrained() {
            let (end_blob_accumulator, hashed_blobs_fields) = evaluate_blobs_and_batch(
                self.blobs_fields,
                end_sponge_blob.expected_fields,
                self.blob_commitments,
                self.final_blob_challenges,
                self.start_blob_accumulator,
            );

            // Check that the injected fields do match what's been absorbed into the sponge by comparing their hashes.
            assert_eq(sponge_blob_hash, hashed_blobs_fields, "Mismatched blob fields hash");

            end_blob_accumulator
        } else {
            // Safety: TODO(#10323): this was added to save simulation time, if/when simulation times of unconstrained are improved, remove this.
            // The sponge_blob_hash is checked in the oracle against the `hashed_blobs_fields`, so that we can mock the
            // entire oracle call and assume it's correct when it is not relevant for the tests.
            unsafe {
                blob::mock_blob_oracle::evaluate_blobs_and_batch(
                    self.blobs_fields,
                    end_sponge_blob.fields,
                    sponge_blob_hash,
                    self.blob_commitments,
                    self.final_blob_challenges,
                    self.start_blob_accumulator,
                )
            }
        }
    }
}
