use dep::aztec::macros::aztec;

#[aztec]
contract UpdatedContract {
    use aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use aztec::macros::{functions::{private, public}, storage::storage};
    use aztec::prelude::{PrivateMutable, PublicMutable};

    use aztec::protocol_types::traits::Hash;
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        private_value: PrivateMutable<ValueNote, Context>,
        public_value: PublicMutable<Field, Context>,
    }

    #[public]
    fn set_public_value() {
        storage.public_value.write(27);
    }

    #[private]
    fn set_private_value() {
        let owner = context.msg_sender();
        let mut new_note = ValueNote::new(27, owner);
        storage.private_value.replace(&mut new_note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            owner,
        ));
    }

    unconstrained fn get_private_value() -> pub Field {
        storage.private_value.view_note().value
    }

    unconstrained fn get_public_value() -> pub Field {
        storage.public_value.read()
    }

}
