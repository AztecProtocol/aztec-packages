contract StateVars {
    use dep::aztec::prelude::{
        AztecAddress, FunctionSelector, NoteHeader, NoteGetterOptions, NoteViewerOptions,
        PrivateContext, Map, PublicMutable, PublicImmutable, PrivateMutable, PrivateImmutable,
        PrivateSet, SharedImmutable
    };
    use dep::aztec::protocol_types::traits::{Deserialize, Serialize};

    use dep::aztec::{
        context::{PublicContext, Context},
        state_vars::{FixedArray, PublicDynamicArray},
    // how to import methods from other files/folders within your workspace
    use crate::options::create_account_card_getter_options;
    use crate::types::{card_note::{CardNote, CARD_NOTE_LEN}, leader::Leader};

  #[aztec(storage)]
  struct Storage {
    fixed_array_test_pub: FixedArray<PublicMutable<u64>, 10>,
    fixed_array_test_priv: FixedArray<PrivateMutable<CardNote>, 10>,
    public_dynamic_array_test: PublicDynamicArray<PublicMutable<u64>>,
  }

  #[aztec(public)]
  fn test_fixed_array_pub_1() {
      for i in 0..10 {
          let mut inner = storage.fixed_array_test_pub.at_index(i);
          inner.write(i);
      }
  }

  #[aztec(public)]
  fn test_fixed_array_pub_2() {
      let mut inner = storage.fixed_array_test_pub.at_index(6);
      inner.write(9);
  }

  #[aztec(public)]
  fn test_fixed_array_pub_3() {
      for i in 0..10 {
          let mut inner = storage.fixed_array_test_pub.at_index(i);
          let num = inner.read();
          emit_unencrypted_log(&mut context, num);
      }
  }

  #[aztec(private)]
  fn test_fixed_array_priv_1() {
      for i in 0..10 {
          let mut note = CardNote::new(i, i as Field, context.msg_sender());
          let mut inner = storage.fixed_array_test_priv.at_index(i as u64);
          inner.initialize(&mut note, true);
      }
  }

  #[aztec(private)]
  fn test_fixed_array_priv_2() {
      let mut inner = storage.fixed_array_test_priv.at_index(6);

      let mut note = CardNote::new(9, 9 as Field, context.msg_sender());
      inner.replace(&mut note, true);
  }

  unconstrained fn test_fixed_array_priv_3() -> pub [Option<CardNote>; 10] {
      let mut ret = [Option::none(); 10];
      for i in 0..10 {
          let mut inner = storage.fixed_array_test_priv.at_index(i);
          let note = inner.view_note();
          ret[i] = Option::some(note);
      }

      ret
  }

  #[aztec(public)]
  fn test_public_dynamic_array_1() {
      storage.public_dynamic_array_test.push().write(69);

      let pop_response = storage.public_dynamic_array_test.pop().read();

      emit_unencrypted_log(&mut context, pop_response);
      emit_unencrypted_log(&mut context, storage.public_dynamic_array_test.length());
  }
  
  #[aztec(public)]
  fn test_public_dynamic_array_2() {
      let mut inner = storage.public_dynamic_array_test.push();
      inner.write(420);
  }

  unconstrained fn test_public_dynamic_array_3() -> pub u64 {
      let mut test = storage.public_dynamic_array_test.at_index(0).read();

      test
  }

  unconstrained fn test_public_dynamic_array_4() -> pub Field {
      let length = storage.public_dynamic_array_test.length();

      length
  }

  #[aztec(public)]
  fn test_public_dynamic_array_5() {
      storage.public_dynamic_array_test.remove(0);
  }

  unconstrained fn test_public_dynamic_array_6() -> pub u64 {
      let test = storage.public_dynamic_array_test.at_index(0).read();

      test
  }
}
