use dep::protocol_types::{
    address::AztecAddress, block_header::BlockHeader, constants::GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
    hash::poseidon2_hash_with_separator, utils::field::full_field_less_than,
};
use dep::protocol_types::merkle_tree::root::root_from_sibling_path;

use crate::oracle::get_public_data_witness::get_public_data_witness;

trait PublicStorageHistoricalRead {
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
            GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
        );

        // 2) Get the membership witness for the tree index.
        let witness = unsafe {
            //@safety The witness is only used as a "magical value" that makes the proof below pass. Hence it's safe.
            get_public_data_witness(
                self.global_variables.block_number as u32,
                public_data_tree_index,
            )
        };

        // 3) The witness is made up of two parts: the preimage of the leaf and the proof that it exists in the tree.
        // We first prove that the witness is indeed valid for the public data tree, i.e. that the preimage is of a
        // value present in the tree. Note that `hash` returns not just the hash of the value but also the metadata
        // (slot, next index and next slot).
        assert(
            self.state.partial.public_data_tree.root
                == root_from_sibling_path(witness.leaf_preimage.hash(), witness.index, witness.path)
                ,
                "Proving public value inclusion failed",
            );

            // 4) Now that we know the preimage is valid, we determine the value that's represented by this tree entry. Here
            // we have two scenarios:
            // 1. The tree entry is initialized, and the value is the same as the one in the witness
            // 2. The entry was never initialized, and the value is default zero (the default)
            // The code below is based on the same checks in `validate_public_data_reads` in `base_rollup_inputs`.
            let preimage = witness.leaf_preimage;

            let is_less_than_slot = full_field_less_than(preimage.slot, public_data_tree_index);
            let is_next_greater_than =
                full_field_less_than(public_data_tree_index, preimage.next_slot);
            let is_max = ((preimage.next_index == 0) & (preimage.next_slot == 0));
            let is_in_range = is_less_than_slot & (is_next_greater_than | is_max);

            let value = if is_in_range {
                0
            } else {
                assert_eq(
                    preimage.slot,
                    public_data_tree_index,
                    "Public data tree index doesn't match witness",
                );
                preimage.value
            };

            value
        }
}
