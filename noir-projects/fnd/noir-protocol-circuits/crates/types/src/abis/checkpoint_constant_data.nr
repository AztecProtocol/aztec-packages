use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    constants::CHECKPOINT_CONSTANT_DATA_LENGTH,
    traits::{Deserialize, Empty, Serialize},
};
use std::meta::derive;

#[derive(Deserialize, Eq, Serialize)]
pub struct CheckpointConstantData {
    // Constants inherited from the parent rollup (i.e., EpochConstantData).
    pub chain_id: Field,
    pub version: Field,
    pub vk_tree_root: Field,
    pub protocol_contracts_hash: Field,
    pub prover_id: Field,

    // Additional constants that remain the same for all blocks within a checkpoint.
    pub slot_number: Field,
    pub coinbase: EthAddress,
    pub fee_recipient: AztecAddress,
    pub gas_fees: GasFees,
}

impl Empty for CheckpointConstantData {
    fn empty() -> Self {
        CheckpointConstantData {
            chain_id: 0,
            version: 0,
            vk_tree_root: 0,
            protocol_contracts_hash: 0,
            prover_id: 0,
            slot_number: 0,
            coinbase: EthAddress::empty(),
            fee_recipient: AztecAddress::empty(),
            gas_fees: GasFees::empty(),
        }
    }
}

#[test]
fn serialization_of_empty_checkpoint_constant_data() {
    let fields = [0; CHECKPOINT_CONSTANT_DATA_LENGTH].mapi(|i, _| i as Field);
    let deserialized = CheckpointConstantData::deserialize(fields);
    let serialized = deserialized.serialize();
    assert_eq(serialized, fields);
}
