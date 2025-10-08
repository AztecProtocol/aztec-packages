use blob::abis::FinalBlobAccumulator;
use types::{
    abis::{epoch_constant_data::EpochConstantData, fee_recipient::FeeRecipient},
    constants::AZTEC_MAX_EPOCH_DURATION,
};

pub struct RootRollupPublicInputs {
    // Snapshot of archive tree before/after this rollup has been processed
    pub previous_archive_root: Field,
    pub new_archive_root: Field,
    pub checkpoint_header_hashes: [Field; AZTEC_MAX_EPOCH_DURATION],
    pub fees: [FeeRecipient; AZTEC_MAX_EPOCH_DURATION],
    pub constants: EpochConstantData,
    pub blob_public_inputs: FinalBlobAccumulator,
}
