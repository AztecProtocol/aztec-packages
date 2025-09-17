use dep::types::{
    constants::{NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS},
    proof::proof_data::ProofData,
};

pub type RollupProofData<T> = ProofData<T, NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>;
