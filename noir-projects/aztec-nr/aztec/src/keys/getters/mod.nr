use dep::protocol_types::{
    header::Header, abis::validation_requests::KeyValidationRequest,
    address::{AztecAddress, PartialAddress}, constants::CANONICAL_KEY_REGISTRY_ADDRESS, point::Point,
    storage::map::derive_storage_slot_in_map, traits::is_empty
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

mod test;

// docs:start:key-getters
trait KeyGetters {
  fn get_npk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ivpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_ovpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_tpk_m(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Point;
  fn get_npk_m_hash(header: Header, context: &mut PrivateContext, address: AztecAddress) -> Field;
}

impl KeyGetters for Header {
    fn get_npk_m(self, _context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_historical_public_keys(self, address).npk_m
    }

    fn get_ivpk_m(self, _context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_historical_public_keys(self, address).ivpk_m
    }

    fn get_ovpk_m(self, _context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_historical_public_keys(self, address).ovpk_m
    }

    fn get_tpk_m(self, _context: &mut PrivateContext, address: AztecAddress) -> Point {
        get_historical_public_keys(self, address).tpk_m
    }

    fn get_npk_m_hash(self, context: &mut PrivateContext, address: AztecAddress) -> Field {
        self.get_npk_m(context, address).hash()
    }
}
// docs:end:key-getters

// A helper function since requesting nsk_app is very common
// TODO(#6543)
pub fn get_nsk_app(npk_m_hash: Field) -> Field {
    get_key_validation_request(npk_m_hash, NULLIFIER_INDEX).sk_app
}

// This is the number of blocks that must pass after a key rotation event until the old keys are fully phased out and
// become invalid.
global KEY_REGISTRY_UPDATE_BLOCKS = 5;

global KEY_REGISTRY_STORAGE_SLOT = 1;

// Returns all current public keys for a given account, applying proper constraints to the context. We read all
// keys at once since the constraints for reading them all are actually fewer than if we read them one at a time - any
// read keys that are not required by the caller can simply be discarded.
pub fn get_current_public_keys(context: &mut PrivateContext, account: AztecAddress) -> PublicKeys {
    // We're going to perform historical reads from public storage, and so need to constrain the caller so that they
    // cannot use very old blocks when constructing proofs, and hence e.g. read very old keys. We are lax and allow
    // _any_ recent block number to be used, regardless of whether there may have been a recent key rotation. This means
    // that multiple sets of keys are valid for a while immediately after rotation, until the old keys become phased
    // out. We *must* be lax to prevent denial of service and transaction fingerprinting attacks by accounts that rotate
    // their keys frequently.
    // Note that we constrain the max block number even if the registry ends up being empty: this ensures that proof of
    // an empty registry is also fresh.
    let current_header = context.get_header();
    context.set_tx_max_block_number(current_header.global_variables.block_number as u32 + KEY_REGISTRY_UPDATE_BLOCKS);

    get_historical_public_keys(current_header, account)
}

// Returns historical public keys for a given account at some block determined by a block header. We read all keys at
// once since the constraints for reading them all are actually fewer than if we read them one at a time - any read keys
// that are not required by the caller can simply be discarded.
// WARNING: if called with a historical header created from a fixed block this function will explicitly ignore key
// rotation! This means that callers of this may force a user to use old keys, potentially leaking privacy (e.g. if the
// old keys were leaked). Only call this function with a header from a fixed block if you understand the implications of
// breaking key rotation very well.
pub fn get_historical_public_keys(historical_header: Header, account: AztecAddress) -> PublicKeys {
    // If keys were registered in the registry, then we must read them from there and prove we got the current value.
    // Alternatively, we must prove the registry is empty and return the canonical public keys (i.e. the ones that are
    // part of the address's preimage).
    // The unconstrained hint we get with the public keys already knows about these variants and returns the correct set
    // of keys (registry or canonical) depending on the scenario. This is so that we only hash this single set of keys
    // and keep the circuit gate count low.
    let hinted_keys = get_public_keys_hint(
        account,
        historical_header.global_variables.block_number as u32
    );
    let hinted_keys_hash = hinted_keys.hash();

    // The key registry conveniently stores a hash of each user's keys, so we can read that single field, and then prove
    // either that it's empty, or that we know its preimage (i.e. the current set of keys).
    let key_registry_hash = key_registry_hash_public_historical_read(historical_header, account);
    if key_registry_hash != 0 {
        assert_eq(hinted_keys_hash.to_field(), key_registry_hash);
    } else {
        // If nothing was written to the registry, we must then prove that the keys we're returning are the canonical
        // keys by deriving the account's address. Note that neither the canonical keys nor the partial address required
        // for the proof are stored in any of the network's trees - it's up to the individuals involved to make sure
        // that these keys are distributed via some side channel.
        let partial_address = get_partial_address(account);
        assert_eq(
            account, AztecAddress::compute(hinted_keys_hash, partial_address), "Invalid public keys hint for address"
        );
    }

    hinted_keys
}

fn key_registry_hash_public_historical_read(historical_header: Header, account: AztecAddress) -> Field {
    // The keys are stored in a Map that is keyed with the address of each account, so we first derive the corresponding
    // slot for this account.
    let keys_storage_slot = derive_storage_slot_in_map(KEY_REGISTRY_STORAGE_SLOT, account);

    // The keys are stored as [ ...serialized_keys, hash ], and since arrays get allocated sequential storage slots
    // (prior to siloing!), we simply add the length to the base slot to get the last element.
    let hash_storage_slot = keys_storage_slot + PUBLIC_KEYS_LENGTH as Field;

    historical_header.public_storage_historical_read(
        hash_storage_slot,
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS)
    )
}

// Returns an account's public keys at a given block. These may originate from either the key registry, or be the
// canonical keys if the registry was empty.
unconstrained fn get_public_keys_hint(account: AztecAddress, block_number: u32) -> PublicKeys {
    // This is equivalent to the key registry contract having an unconstrained getter that we call from an oracle, but
    // PXE does not yet support that functionality so we do this manually instad. Note that this would be a *historical*
    // call!
    // TODO (#7524): call the unconstrained KeyRegistry.get_current_keys() function instead
    let context = UnconstrainedContext::at_historical(
        AztecAddress::from_field(CANONICAL_KEY_REGISTRY_ADDRESS),
        block_number
    );
    let keys_storage = Map::new(
        context,
        KEY_REGISTRY_STORAGE_SLOT,
        |context, slot| { PublicMutable::new(context, slot) }
    );

    let stored_keys: StoredKeys = keys_storage.at(account).read();

    if stored_keys.hash != 0 {
        stored_keys.public_keys
    } else {
        // We could change this function to also return the partial address we're discarding here and avoid a duplicate
        // oracle call to getPublicKeysAndPartialAddress in get_partial_address, but that'd make the body of
        // get_historical_public_keys more complicated, and we'd rather keep that simple and easy to follow than save a
        // redundant oracle call, which is cheap.
        let (canonical_public_keys, _) = get_public_keys_and_partial_address(account);
        canonical_public_keys
    }
}

unconstrained fn get_partial_address(account: AztecAddress) -> PartialAddress {
    // The only reason to return the partial address is to show the correct derivation from the public keys into the
    // address, which means we've likely already called the getPublicKeysAndPartialAddress oracle we're about to call
    // here. Ultimately though this duplicate call is not a huge issue. 
    let (_, partial_address) = get_public_keys_and_partial_address(account);
    partial_address
}
