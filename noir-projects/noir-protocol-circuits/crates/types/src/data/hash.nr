use crate::{address::AztecAddress, constants::GENERATOR_INDEX__PUBLIC_LEAF_INDEX, traits::ToField};

pub fn compute_public_data_leaf_slot(contract_address: AztecAddress, storage_slot: Field) -> Field {
    crate::hash::poseidon2_hash_with_separator(
        [contract_address.to_field(), storage_slot],
        GENERATOR_INDEX__PUBLIC_LEAF_INDEX,
    )
}
