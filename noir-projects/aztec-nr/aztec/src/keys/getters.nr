use dep::protocol_types::{
    header::Header, abis::key_validation_request::KeyValidationRequest, address::AztecAddress,
    constants::CANONICAL_KEY_REGISTRY_ADDRESS, grumpkin_point::GrumpkinPoint,
    storage::map::derive_storage_slot_in_map
};
use crate::{
    context::PrivateContext,
    oracle::{keys::get_public_keys_and_partial_address, key_validation_request::get_key_validation_request},
    keys::{public_keys::PublicKeys, constants::{NULLIFIER_INDEX, INCOMING_INDEX}},
    state_vars::{shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter}
};

global DELAY = 5;

// docs:start:key-getters
pub fn get_npk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, NULLIFIER_INDEX)
}

// For historical access, we move the fetching of the header to the top level to minimize redundant fetching / proving validity of the header.
pub fn get_npk_m_at(
    context: &mut PrivateContext,
    address: AztecAddress,
    block_number: u32,
    header: Header
) -> GrumpkinPoint {
    assert_eq(block_number, header.global_variables.block_number as u32);
    get_master_key_at(context, address, NULLIFIER_INDEX, header)
}

pub fn get_npk_m_hash(context: &mut PrivateContext, address: AztecAddress) -> Field {
    get_npk_m(context, address).hash()
}

pub fn get_npk_m_hash_at(
    context: &mut PrivateContext,
    address: AztecAddress,
    block_number: u32,
    header: Header
) -> Field {
    get_npk_m_at(context, address, block_number, header).hash()
}

pub fn get_ivpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
    get_master_key(context, address, INCOMING_INDEX)
}

// Commented out as it's currently not enabled in key registry
// pub fn get_ovpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
//     get_master_key(context, address, OUTGOING_INDEX)
// }
// 
// pub fn get_tpk_m(context: &mut PrivateContext, address: AztecAddress) -> GrumpkinPoint {
//     get_master_key(context, address, TAGGING_INDEX)
// }
// docs:end:key-getters

fn get_master_key(
    context: &mut PrivateContext,
    address: AztecAddress,
    key_index: Field
) -> GrumpkinPoint {
    let (x_coordinate_registry, y_coordinate_registry) = get_registry_with_key_index(context, key_index, address);
    let key = fetch_key_from_registry(x_coordinate_registry, y_coordinate_registry);
    fetch_key_from_oracle_if_zero(key, address, key_index)
}

fn get_master_key_at(
    context: &mut PrivateContext,
    address: AztecAddress,
    key_index: Field,
    header: Header
) -> GrumpkinPoint {
    let (x_coordinate_registry, y_coordinate_registry) = get_registry_with_key_index(context, key_index, address);
    let key = fetch_key_from_registry_at(x_coordinate_registry, y_coordinate_registry, header);
    fetch_key_from_oracle_if_zero(key, address, key_index)
}

fn fetch_key_from_oracle_if_zero(key: GrumpkinPoint, address: AztecAddress, key_index: Field) -> GrumpkinPoint {
    if key.is_zero() {
        // Keys were not registered in registry yet --> fetch key from PXE
        let keys = fetch_and_constrain_keys(address);
        // Return the corresponding to index
        keys.get_key_by_index(key_index)
    } else {
        // Keys were registered --> return the key
        key
    }
}

fn get_registry_with_key_index(
    context: &mut PrivateContext,
    key_index: Field,
    address: AztecAddress
) -> (SharedMutablePrivateGetter<Field, DELAY>, SharedMutablePrivateGetter<Field, DELAY>) {
    let x_coordinate_map_slot = key_index * 2 + 1;
    let y_coordinate_map_slot = x_coordinate_map_slot + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

    let x_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY> = SharedMutablePrivateGetter::new(
        *context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        x_coordinate_derived_slot
    );
    let y_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY> = SharedMutablePrivateGetter::new(
        *context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        y_coordinate_derived_slot
    );

    (x_coordinate_registry, y_coordinate_registry)
}

fn fetch_key_from_registry(
    x_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY>,
    y_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY>
) -> GrumpkinPoint {
    let key_x_coordinate = x_coordinate_registry.get_current_value_in_private();
    let key_y_coordinate = y_coordinate_registry.get_current_value_in_private();

    GrumpkinPoint::new(key_x_coordinate, key_y_coordinate)
}

fn fetch_key_from_registry_at(
    x_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY>,
    y_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY>,
    header: Header
) -> GrumpkinPoint {
    let key_x_coordinate = x_coordinate_registry.get_current_value_in_private_at(header.global_variables.block_number as u32, header);
    let key_y_coordinate = y_coordinate_registry.get_current_value_in_private_at(header.global_variables.block_number as u32, header);

    GrumpkinPoint::new(key_x_coordinate, key_y_coordinate)
}

// Passes only when keys were not rotated - is expected to be called only when keys were not registered yet
fn fetch_and_constrain_keys(address: AztecAddress) -> PublicKeys {
    let (public_keys, partial_address) = get_public_keys_and_partial_address(address);

    let computed_address = AztecAddress::compute(public_keys.hash(), partial_address);

    assert(computed_address.eq(address));

    public_keys
}

// A helper function since requesting nsk_app is very common
// TODO(#6543)
pub fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_key_validation_request(npk_m_hash, NULLIFIER_INDEX).sk_app
}
