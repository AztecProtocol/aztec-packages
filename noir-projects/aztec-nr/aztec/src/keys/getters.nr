use dep::protocol_types::{
    header::Header, abis::validation_requests::KeyValidationRequest, address::AztecAddress,
    constants::CANONICAL_KEY_REGISTRY_ADDRESS, point::Point, storage::map::derive_storage_slot_in_map,
    traits::is_empty
};
use crate::{
    context::{PrivateContext, UnconstrainedContext},
    oracle::{keys::get_public_keys_and_partial_address, key_validation_request::get_key_validation_request},
    keys::{public_keys::PublicKeys, constants::{NULLIFIER_INDEX, INCOMING_INDEX, OUTGOING_INDEX, TAGGING_INDEX}},
    state_vars::{shared_mutable::{shared_mutable::SharedMutable, shared_mutable_private_getter::SharedMutablePrivateGetter}}
};

global DELAY = 5;

// docs:start:key-getters
trait KeyGettersPrivate {
  fn get_npk_m(context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ivpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ovpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_tpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_npk_m_hash(context: &mut PrivateContext, address: AztecAddress) -> Field;
}

impl KeyGettersPrivate for PrivateContext {
    fn get_npk_m(context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, NULLIFIER_INDEX, address)
    }

    fn get_ivpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, INCOMING_INDEX, address)
    }

    fn get_ovpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, OUTGOING_INDEX, address)
    }

    fn get_tpk_m(context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, TAGGING_INDEX, address)
    }

    fn get_npk_m_hash(context: &mut PrivateContext, address: AztecAddress) -> Field {
        get_master_key(context, NULLIFIER_INDEX, address).hash()
    }
}
// docs:end:key-getters

trait KeyGettersPrivateHistorical {
  fn get_npk_m_historical(header: Header, address: AztecAddress) -> Point;
  fn get_ivpk_m_historical(header: Header, address: AztecAddress) -> Point;
  fn get_ovpk_m_historical(header: Header, address: AztecAddress) -> Point;
  fn get_tpk_m_historical(header: Header, address: AztecAddress) -> Point;
  fn get_npk_m_hash_historical(header: Header, address: AztecAddress) -> Field;
}

impl KeyGettersPrivateHistorical for Header {
    fn get_npk_m_historical(header: Header, address: AztecAddress) -> Point {
        get_master_key_historical(header, NULLIFIER_INDEX, address)
    }

    fn get_ivpk_m_historical(header: Header, address: AztecAddress) -> Point {
        get_master_key_historical(header, INCOMING_INDEX, address)
    }

    fn get_ovpk_m_historical(header: Header, address: AztecAddress) -> Point {
        get_master_key_historical(header, OUTGOING_INDEX, address)
    }

    fn get_tpk_m_historical(header: Header, address: AztecAddress) -> Point {
        get_master_key_historical(header, TAGGING_INDEX, address)
    }

    fn get_npk_m_hash_historical(header: Header, address: AztecAddress) -> Field {
        get_master_key_historical(header, NULLIFIER_INDEX, address).hash()
    }
}

trait KeyGettersUnconstrained {
  fn get_npk_m(context: UnconstrainedContext, address: AztecAddress) -> Point;
  fn get_ivpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point;
  fn get_ovpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point;
  fn get_tpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point;
  fn get_npk_m_hash(context: UnconstrainedContext, address: AztecAddress) -> Field;
}

impl KeyGettersUnconstrained for UnconstrainedContext {
    fn get_npk_m(context: UnconstrainedContext, address: AztecAddress) -> Point {
        get_master_key_unconstrained(context, NULLIFIER_INDEX, address)
    }

    fn get_ivpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point {
        get_master_key_unconstrained(context, INCOMING_INDEX, address)
    }

    fn get_ovpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point {
        get_master_key_unconstrained(context, OUTGOING_INDEX, address)
    }

    fn get_tpk_m(context: UnconstrainedContext, address: AztecAddress) -> Point {
        get_master_key_unconstrained(context, TAGGING_INDEX, address)
    }

    fn get_npk_m_hash(context: UnconstrainedContext, address: AztecAddress) -> Field {
        get_master_key_unconstrained(context, NULLIFIER_INDEX, address).hash()
    }
}

fn get_master_key_unconstrained(
    context: UnconstrainedContext,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let key = fetch_key_from_registry_unconstrained(context, key_index, address);
    if is_empty(key) {
        // Keys were not registered in registry yet --> fetch key from PXE
        let keys = fetch_and_constrain_keys(address);
        // Return the corresponding to index
        keys.get_key_by_index(key_index)
    } else {
        // Keys were registered --> return the key
        key
    }
}

fn fetch_key_from_registry_unconstrained(
    context: UnconstrainedContext,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let x_coordinate_map_slot = key_index * 2 + 1;
    let y_coordinate_map_slot = x_coordinate_map_slot + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

    let x_coordinate = SharedMutable::get_current_value_in_unconstrained_other(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        x_coordinate_derived_slot
    );
    let y_coordinate = SharedMutable::get_current_value_in_unconstrained_other(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        y_coordinate_derived_slot
    );

    Point { x: x_coordinate, y: y_coordinate, is_infinite: false }
}

fn get_master_key(
    context: &mut PrivateContext,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let key = fetch_key_from_registry(context, key_index, address);
    if is_empty(key) {
        // Keys were not registered in registry yet --> fetch key from PXE
        let keys = fetch_and_constrain_keys(address);
        // Return the corresponding to index
        keys.get_key_by_index(key_index)
    } else {
        // Keys were registered --> return the key
        key
    }
}

fn get_master_key_historical(
    header: Header,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let key = fetch_key_from_registry_historical(header, key_index, address);
    if is_empty(key) {
        // Keys were not registered in registry yet --> fetch key from PXE
        let keys = fetch_and_constrain_keys(address);
        // Return the corresponding to index
        keys.get_key_by_index(key_index)
    } else {
        // Keys were registered --> return the key
        key
    }
}

fn fetch_key_from_registry(
    context: &mut PrivateContext,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let x_coordinate_map_slot = key_index * 2 + 1;
    let y_coordinate_map_slot = x_coordinate_map_slot + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

    let x_coordinate = SharedMutable::get_current_value_in_private_other::<Field, 5>(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        x_coordinate_derived_slot
    );
    let y_coordinate = SharedMutable::get_current_value_in_private_other::<Field, 5>(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        y_coordinate_derived_slot
    );

    Point { x: x_coordinate, y: y_coordinate, is_infinite: false }
}

fn fetch_key_from_registry_historical(
    header: Header,
    key_index: Field,
    address: AztecAddress
) -> Point {
    let x_coordinate_map_slot = key_index * 2 + 1;
    let y_coordinate_map_slot = x_coordinate_map_slot + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

    let x_coordinate = SharedMutable::get_historical_value_in_private_other::<Field, 5>(
        header,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        x_coordinate_derived_slot
    );
    let y_coordinate = SharedMutable::get_historical_value_in_private_other::<Field, 5>(
        header,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        y_coordinate_derived_slot
    );

    Point { x: x_coordinate, y: y_coordinate, is_infinite: false }
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
