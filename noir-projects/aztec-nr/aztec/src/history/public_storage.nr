use dep::protocol_types::{
    abis::block_header::BlockHeader, address::AztecAddress, constants::DOM_SEP__PUBLIC_LEAF_INDEX,
    data::public_data_storage_read, hash::poseidon2_hash_with_separator,
    merkle_tree::MembershipWitness, traits::ToField,
};

use crate::oracle::get_public_data_witness::get_public_data_witness;

mod test;

pub trait PublicStorageHistoricalRead {
    fn public_storage_historical_read(
        header: BlockHeader,
        storage_slot: Field,
        contract_address: AztecAddress,
    ) -> Field;
}

impl PublicStorageHistoricalRead for BlockHeader {
    fn public_storage_historical_read(
        self,
        storage_slot: Field,
        contract_address: AztecAddress,
    ) -> Field {
        // 1) Compute the leaf index by siloing the storage slot with the contract address
        let public_data_tree_index = poseidon2_hash_with_separator(
            [contract_address.to_field(), storage_slot],
            DOM_SEP__PUBLIC_LEAF_INDEX,
        );

        // 2) Get the membership witness for the tree index.
        // Safety: The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
        let witness = unsafe { get_public_data_witness(self, public_data_tree_index) };

        public_data_storage_read(
            self.state.partial.public_data_tree.root,
            public_data_tree_index,
            MembershipWitness { leaf_index: witness.index, sibling_path: witness.path },
            witness.leaf_preimage,
        )
    }
}
