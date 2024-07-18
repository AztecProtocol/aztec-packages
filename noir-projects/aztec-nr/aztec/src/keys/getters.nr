use dep::protocol_types::{
    header::Header, abis::validation_requests::KeyValidationRequest, address::AztecAddress,
    constants::CANONICAL_KEY_REGISTRY_ADDRESS, point::Point, storage::map::derive_storage_slot_in_map,
    traits::is_empty
};
use crate::{
    context::{PrivateContext, UnconstrainedContext},
    oracle::{keys::get_public_keys_and_partial_address, key_validation_request::get_key_validation_request},
    keys::{
    public_keys::{PublicKeys, PUBLIC_KEYS_LENGTH}, stored_keys::StoredKeys,
    constants::{NULLIFIER_INDEX, INCOMING_INDEX, OUTGOING_INDEX, TAGGING_INDEX}
},
    state_vars::{
    shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter,
    public_mutable::PublicMutable, map::Map
}
};

global DELAY = 5;

// docs:start:key-getters
trait KeyGetters {
  fn get_npk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ivpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ovpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_tpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_npk_m_hash(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Field;
}

impl KeyGetters for Header {
    fn get_npk_m(self, context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, address, NULLIFIER_INDEX, self)
    }

    fn get_ivpk_m(self, context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, address, INCOMING_INDEX, self)
    }

    fn get_ovpk_m(self, context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, address, OUTGOING_INDEX, self)
    }

    fn get_tpk_m(self, context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_master_key(context, address, TAGGING_INDEX, self)
    }

    fn get_npk_m_hash(self, context: &mut PrivateContext, address: AztecAddress) -> Field {
        get_master_key(context, address, NULLIFIER_INDEX, self).hash()
    }
}
// docs:end:key-getters

fn get_master_key(
    context: &mut PrivateContext,
    address: AztecAddress,
    key_index: Field,
    header: Header
) -> Point {
    let key = fetch_key_from_registry(context, key_index, address, header);
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
    address: AztecAddress,
    header: Header
) -> Point {
    let x_coordinate_map_slot = key_index * 2 + 1;
    let y_coordinate_map_slot = x_coordinate_map_slot + 1;
    let x_coordinate_derived_slot = derive_storage_slot_in_map(x_coordinate_map_slot, address);
    let y_coordinate_derived_slot = derive_storage_slot_in_map(y_coordinate_map_slot, address);

    let x_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY> = SharedMutablePrivateGetter::new(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        x_coordinate_derived_slot
    );
    let y_coordinate_registry: SharedMutablePrivateGetter<Field, DELAY> = SharedMutablePrivateGetter::new(
        context,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        y_coordinate_derived_slot
    );
    let x_coordinate = x_coordinate_registry.get_value_in_private(header);
    let y_coordinate = y_coordinate_registry.get_value_in_private(header);

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

// This returns all current public keys for a given account, applying proper constraints to the context. We read all
// keys at once since the contraints for reading them all are actually fewer than if we read them one at a time - any
// read keys that are not required by the caller can simply be discarded.
pub fn get_current_public_keys(context: &mut PrivateContext, account: AztecAddress) -> PublicKeys {
    // The keys are stored in the key registry's public storage, but accessing that directly would require performing
    // multiple historical reads, which results in a large number of constraints (since each field would result in a
    // full merkle inclusion proof). Instead, we rely on the fact that the registry also stores the hash of all keys,
    // and then show that this hash matches public keys we get from an unconstrained function.

    let hinted_public_keys = key_registry_get_stored_keys_hint(account);

    let base_storage_slot = derive_storage_slot_in_map(KEY_REGISTRY_STORAGE_SLOT, account);
    // The keys are stored as [ ...serialized_keys, hash ], and since arrays get allocated sequential storage slots 
    // (prior to siloing!), we simply add the length to the base slot to get the last element.
    let hash_storage_slot = base_storage_slot + PUBLIC_KEYS_LENGTH as Field;

    // Here we prove that the unconstrained keys are the correct preimage of the hash stored in public storage, and
    // hence they are the correct keys.
    let historical_header = context.get_header();
    assert_eq(
        hinted_public_keys.hash().inner, historical_header.public_storage_historical_read(hash_storage_slot, KEY_REGISTRY_CONTRACT_ADDRESS)
    );

    // We now need to constrain the caller so that they cannot use very old blocks when constructing proofs, and hence
    // read very old keys. We are lax and allow _any_ recent block number to be used, regardless of whether there may
    // have been a recent key rotation. This means that multiple sets of keys are valid for a while immediately after
    // rotation, until the old keys become phased out. We *must* be lax to prevent denial of service and transaction
    // fingerprinting attacks by accounts that rotate their keys frequently.
    context.set_tx_max_block_number(historical_header.global_variables.block_number as u32 + KEY_REGISTRY_UPDATE_BLOCKS);

    hinted_public_keys
}

// This is the number of blocks that must pass after a key rotation event until the old keys are fully phased out and
// become invalid.
global KEY_REGISTRY_UPDATE_BLOCKS = 5;

global KEY_REGISTRY_STORAGE_SLOT = 1;

// TODO: autogenerate this
global KEY_REGISTRY_CONTRACT_ADDRESS = AztecAddress { inner: 25 };

unconstrained fn key_registry_get_stored_keys_hint(account: AztecAddress) -> PublicKeys {
    // This is equivalent to the key registry contract having an unconstrained getter that we call from an oracle, but
    // PXE does not yet support that functionality so we do this manually instad.

    let context = UnconstrainedContext::at(KEY_REGISTRY_CONTRACT_ADDRESS);
    let keys_storage = Map::new(
        context,
        KEY_REGISTRY_STORAGE_SLOT,
        |context, slot| { PublicMutable::new(context, slot) }
    );

    let stored_keys: StoredKeys = keys_storage.at(account).read();
    stored_keys.public_keys
}
