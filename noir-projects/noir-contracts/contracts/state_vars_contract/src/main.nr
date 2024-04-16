contract StateVars {
  use dep::aztec::prelude::{
      AztecAddress, FunctionSelector, NoteHeader, NoteGetterOptions, NoteViewerOptions,
      PrivateContext, Map, PublicMutable, PublicImmutable, PrivateMutable, PrivateImmutable,
      PrivateSet, SharedImmutable
  };
  use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

  use dep::aztec::{
    state_vars::shared_mutable::SharedMutablePrivateGetter,
    context::{PublicContext, Context},
    log::{emit_unencrypted_log_from_private},
  };

  #[aztec(private)]
  fn test_shared_mutable_private_getter_for_registry_contract(
    contract_address_to_read: AztecAddress,
    storage_slot_of_shared_mutable: Field,
    address_to_get_in_registry: AztecAddress,
  ) {
    // We have to derive this slot to get the location of the shared mutable inside the Map
    let derived_slot = dep::aztec::hash::pedersen_hash([storage_slot_of_shared_mutable, address_to_get_in_registry.to_field()], 0);
    // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
    let registry_private_getter: SharedMutablePrivateGetter<AztecAddress, 5> = SharedMutablePrivateGetter::new(context, contract_address_to_read, derived_slot);
    let nullifier_public_key = registry_private_getter.get_current_value_in_private();

    emit_unencrypted_log_from_private(&mut context, nullifier_public_key);
  }

  #[aztec(private)]
  fn test_shared_mutable_private_getter(
    contract_address_to_read: AztecAddress,
    storage_slot_of_shared_mutable: Field,
  ) {
    // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
    let test: SharedMutablePrivateGetter<AztecAddress, 5> = SharedMutablePrivateGetter::new(context, contract_address_to_read, storage_slot_of_shared_mutable);
    let authorized = test.get_current_value_in_private();

    emit_unencrypted_log_from_private(&mut context, authorized);
  }

  #[aztec(public)]
  fn delay() {
    // We use this as a util function to "mine a block"
    dep::aztec::log::emit_unencrypted_log(
        &mut context,
        "dummy"
    );
  }
}
