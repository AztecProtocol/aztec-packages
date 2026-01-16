use protocol_types::{constants::PUBLIC_DATA_TREE_HEIGHT, data::PublicDataTreeLeafPreimage};
use protocol_types::traits::{Deserialize, Serialize};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicDataWitness {
    pub index: Field,
    pub leaf_preimage: PublicDataTreeLeafPreimage,
    pub path: [Field; PUBLIC_DATA_TREE_HEIGHT],
}

#[oracle(utilityGetPublicDataWitness)]
unconstrained fn get_public_data_witness_oracle(
    _block_number: u32,
    _public_data_tree_index: Field,
) -> PublicDataWitness {}

pub unconstrained fn get_public_data_witness(
    block_number: u32,
    public_data_tree_index: Field,
) -> PublicDataWitness {
    get_public_data_witness_oracle(block_number, public_data_tree_index)
}
