use dep::protocol_types::{address::AztecAddress, constants::CANONICAL_KEY_REGISTRY_ADDRESS, grumpkin_point::GrumpkinPoint};
use crate::{
    context::PrivateContext, hash::poseidon2_hash, oracle::keys::get_public_keys_and_partial_address,
    state_vars::{
    map::derive_storage_slot_in_map,
    shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter
}
};

// Note: In fetch_hash_from_registry we expect that shared mutable slow is index + 1 (e.g. NULLIFIER_INDEX + 1),
// this changes the function will need to be refactored
global NULLIFIER_INDEX = 0;
global INCOMING_INDEX = 1;
global OUTGOING_INDEX = 2;
global TAGGING_INDEX = 3;

global DELAY = 5;

pub fn get_npk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, NULLIFIER_INDEX)
}

pub fn get_ivpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, INCOMING_INDEX)
}

pub fn get_ovpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, OUTGOING_INDEX)
}

pub fn get_tpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, TAGGING_INDEX)
}

fn get_master_key(
    context: &mut PrivateContext,
    address: AztecAddress,
    key_index: Field
) -> GrumpkinPoint {
    // 1. Get key hash from registry
    let key_hash = fetch_hash_from_registry(context, key_index, address);
    if key_hash == 0 {
        // i. Keys were not registered yet --> fetch address preimage and check that the hash matches
        fetch_and_constrain_keys(address)[key_index]
    } else {
        // ii. Keys were registered --> we fetch the key from oracle, hash it and check that it matches the hash in the registry
        let (keys, _) = get_public_keys_and_partial_address(address);
        let key = keys[key_index];
        let key_hash_from_oracle = poseidon2_hash(key.serialize());
        assert(key_hash_from_oracle == key_hash);
        key
    }
}

fn fetch_hash_from_registry(
    context: &mut PrivateContext,
    key_index: Field,
    address: AztecAddress
) -> Field {
    let derived_slot = derive_storage_slot_in_map(key_index + 1, address);

    let registry_private_getter: SharedMutablePrivateGetter<Field, DELAY> = SharedMutablePrivateGetter::new(
        *context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        derived_slot
    );
    registry_private_getter.get_current_value_in_private()
}

// Passes only when keys were not rotated - is expected to be called only when keys were not registered yet
fn fetch_and_constrain_keys(address: AztecAddress) -> [GrumpkinPoint; 4] {
    let (public_keys, partial_address) = get_public_keys_and_partial_address(address);

    let nullifier_pub_key = public_keys[0];
    let incoming_pub_key = public_keys[1];
    let outgoing_pub_key = public_keys[2];
    let tagging_pub_key = public_keys[3];

    let computed_address = AztecAddress::compute_from_public_keys_and_partial_address(
        nullifier_pub_key,
        incoming_pub_key,
        outgoing_pub_key,
        tagging_pub_key,
        partial_address
    );

    assert(computed_address.eq(address));

    [nullifier_pub_key, incoming_pub_key, outgoing_pub_key, tagging_pub_key]
}
