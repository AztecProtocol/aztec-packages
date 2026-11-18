use bigcurve::curves::bls12_381::BLS12_381;

pub type BLSPoint = BLS12_381;

pub(crate) mod batching_blob_commitment;
pub(crate) mod blob_accumulator;
pub(crate) mod final_blob_accumulator;

pub use batching_blob_commitment::BatchingBlobCommitment;
pub use blob_accumulator::BlobAccumulator;
pub use final_blob_accumulator::FinalBlobAccumulator;
