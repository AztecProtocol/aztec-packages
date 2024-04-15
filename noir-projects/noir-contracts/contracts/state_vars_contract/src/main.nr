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
  fn test_shared_mutable_private_getter(
    contract_address_to_read: AztecAddress,
    storage_slot_of_shared_mutable: Field,
  ) {
    // It's a bit wonky because we need to know the delay for get_current_value_in_private to work correctly
    let test: SharedMutablePrivateGetter<AztecAddress, 5> = SharedMutablePrivateGetter::new(context, contract_address_to_read, storage_slot_of_shared_mutable);
    let authorized = test.get_current_value_in_private();

    emit_unencrypted_log_from_private(&mut context, authorized);
  }
}
