use crate::{
    abis::gas_fees::GasFees,
    address::{AztecAddress, EthAddress},
    constants::CHECKPOINT_CONSTANT_DATA_LENGTH,
    tests::utils::make_fixture,
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
fn serialization_of_checkpoint_constant_data() {
    let data: CheckpointConstantData = make_fixture(1);
    let serialized: [Field; CHECKPOINT_CONSTANT_DATA_LENGTH] = data.serialize();
    let deserialized = CheckpointConstantData::deserialize(serialized);
    assert_eq(data, deserialized);
}
