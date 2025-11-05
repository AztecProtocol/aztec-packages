use blob::abis::FinalBlobAccumulator;
use types::{
    abis::{epoch_constant_data::EpochConstantData, fee_recipient::FeeRecipient},
    constants::AZTEC_MAX_EPOCH_DURATION,
};

pub struct RootRollupPublicInputs {
    // Root of archive tree before/after this rollup has been processed
    // We don't submit the nextAvailableLeafIndex to L1, it's validated by the circuits themselves:
    // During an epoch, we assert that the previous archive is the new archive from the next rollup merged in.
    // However, to validate the very first previous archive of an epoch, the validation is more succinct:
    //  - If you try to set a higher nextAvailableLeafIndex (skip), you won't be able to provide a valid preimage to `validate_previous_block_header_in_archive`
    //  - If you try to set a lower nextAvailableLeafIndex (overwrite), you'll fail the zero leaf check in the tree insertion code
    pub previous_archive_root: Field,
    pub new_archive_root: Field,
    pub checkpoint_header_hashes: [Field; AZTEC_MAX_EPOCH_DURATION],
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION],
    pub constants: EpochConstantData,
    pub blob_public_inputs: FinalBlobAccumulator,
}
