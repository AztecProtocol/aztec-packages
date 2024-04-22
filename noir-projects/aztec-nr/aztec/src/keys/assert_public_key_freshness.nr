use dep::protocol_types::{constants::{GENERATOR_INDEX__PUBLIC_KEYS_HASH, GENERATOR_INDEX__CONTRACT_ADDRESS_V1}, address::AztecAddress};
use crate::context::PrivateContext;
use crate::note::{
    constants::{GET_NOTE_ORACLE_RETURN_LENGTH, MAX_NOTES_PER_PAGE, VIEW_NOTE_ORACLE_RETURN_LENGTH},
    note_getter_options::{NoteGetterOptions, Select, Sort, SortOrder, Comparator, NoteStatus, PropertySelector},
    note_interface::NoteInterface, note_viewer_options::NoteViewerOptions,
    utils::compute_note_hash_for_consumption,
};
use crate::state_vars::shared_mutable::shared_mutable_private_getter::SharedMutablePrivateGetter;
use crate::hash::pedersen_hash;
use dep::std::hash::poseidon2::Poseidon2::hash as poseidon2_hash;
use crate::oracle;


fn assert_nullifier_public_key_fresh(
  context: &mut PrivateContext,
  address: AztecAddress, 
  nullifier_public_key_to_test: Field
) {
  // Canonical Key Registry
  let contract_address_to_read = AztecAddress::from_field(123);
  let storage_slot_of_nullifier_public_key = 1;
  // We have to derive this slot to get the location of the shared mutable inside the Map
  let derived_slot = pedersen_hash(
    [storage_slot_of_nullifier_public_key, address.to_field()],
    0
  );

  // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
  let registry_private_getter: SharedMutablePrivateGetter<Field, 5> = SharedMutablePrivateGetter::new(*context, contract_address_to_read, derived_slot);
  let nullifier_public_key = registry_private_getter.get_current_value_in_private();

  if (nullifier_public_key == 0) {
    check_key(address, 1, nullifier_public_key_to_test);
  } else {
    assert(nullifier_public_key == nullifier_public_key_to_test);
  }
}

fn check_key(address: AztecAddress, key_type: Field, key: Field) {
  let mut keys = check_key_internal(address);

  keys[key_type] = key;

  _check_key_constrain_check_key_internal(
    address,
    keys[0],
    keys[1],
    keys[2],
    keys[3],
    keys[4],
  );
}

unconstrained fn check_key_internal(address: AztecAddress) -> [Field; 5] {
  let keys = oracle::keys::get_public_keys_for_address(address);

  keys
}

fn _check_key_constrain_check_key_internal(
  address: AztecAddress,
  partial_address: Field,
  nullifier_public_key: Field,
  incoming_public_key: Field,
  outgoing_public_key: Field,
  tagging_public_key: Field
  ) {
  let public_keys_hash = poseidon2_hash([
      nullifier_public_key,
      incoming_public_key,
      outgoing_public_key,
      tagging_public_key,
      GENERATOR_INDEX__PUBLIC_KEYS_HASH,
    ],
    5
  );

  let computed_address = AztecAddress::from_field(
    poseidon2_hash([
        partial_address.to_field(),
        public_keys_hash.to_field(),
        GENERATOR_INDEX__CONTRACT_ADDRESS_V1 as Field,
      ],
      3
    )
  );

  assert(computed_address.eq(address), "Computed address does not match supplied address");
}
