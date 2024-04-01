use dep::types::{address::AztecAddress, hash::poseidon_hash};

pub fn compute_public_data_tree_index(contract_address: AztecAddress, storage_slot: Field) -> Field {
    poseidon_hash([contract_address.to_field(), storage_slot])
}

pub fn compute_public_data_tree_value(value: Field) -> Field {
    // as it's a public value, it doesn't require hashing.
    // leaving this function here in case we decide to change this.
    value
}
