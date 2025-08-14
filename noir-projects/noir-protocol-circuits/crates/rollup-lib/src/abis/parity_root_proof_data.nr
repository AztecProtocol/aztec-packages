use dep::types::{
    constants::{NESTED_RECURSIVE_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS},
    proof::proof_data::ProofData,
};
use parity_lib::ParityPublicInputs;

pub type ParityRootProofData = ProofData<ParityPublicInputs, NESTED_RECURSIVE_PROOF_LENGTH, ULTRA_VK_LENGTH_IN_FIELDS>;
