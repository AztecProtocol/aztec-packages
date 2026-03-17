//! Historical storage accesses.

use crate::protocol::{
    abis::block_header::BlockHeader,
    address::AztecAddress,
    constants::PUBLIC_DATA_TREE_HEIGHT,
    data::{
        hash::compute_public_data_leaf_slot, public_data_storage_read, PublicDataTreeLeafPreimage,
    },
    merkle_tree::MembershipWitness,
    traits::{Deserialize, Hash, Serialize},
};

#[derive(Deserialize, Eq, Serialize)]
pub struct PublicDataWitness {
    pub index: Field,
    pub leaf_preimage: PublicDataTreeLeafPreimage,
    pub path: [Field; PUBLIC_DATA_TREE_HEIGHT],
}

#[oracle(aztec_utl_getPublicDataWitness)]
unconstrained fn get_public_data_witness_oracle(
    _block_hash: Field,
    _public_data_leaf_slot: Field,
) -> PublicDataWitness {}

pub unconstrained fn get_public_data_witness(
    block_header: BlockHeader,
    public_data_leaf_slot: Field,
) -> PublicDataWitness {
    let block_hash = block_header.hash();
    get_public_data_witness_oracle(block_hash, public_data_leaf_slot)
}

pub fn public_storage_historical_read(
    block_header: BlockHeader,
    storage_slot: Field,
    contract_address: AztecAddress,
) -> Field {
    // 1) Compute the leaf slot by siloing the storage slot with the contract address
    let public_data_leaf_slot = compute_public_data_leaf_slot(contract_address, storage_slot);

    // 2) Get the membership witness for the leaf slot.
    // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
    let witness = unsafe { get_public_data_witness(block_header, public_data_leaf_slot) };

    public_data_storage_read(
        block_header.state.partial.public_data_tree.root,
        public_data_leaf_slot,
        MembershipWitness { leaf_index: witness.index, sibling_path: witness.path },
        witness.leaf_preimage,
    )
}
