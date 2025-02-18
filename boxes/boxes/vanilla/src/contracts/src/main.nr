use dep::aztec::macros::aztec;

#[aztec]
contract Vanilla {
    use dep::aztec::{
        encrypted_logs::log_assembly_strategies::default_aes128::note::encode_and_encrypt_note,
        macros::{functions::{initializer, private}, storage::storage},
        prelude::{AztecAddress, Map, NoteInterface, PrivateMutable},
    };
    use dep::value_note::value_note::{VALUE_NOTE_LEN, ValueNote};

    #[storage]
    struct Storage<Context> {
        numbers: Map<AztecAddress, PrivateMutable<ValueNote, Context>, Context>,
    }

    #[private]
    #[initializer]
    fn constructor(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;
        let new_number = ValueNote::new(number, owner);

        numbers.at(owner).initialize(new_number).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            context.msg_sender(),
        ));
    }

    #[private]
    fn setNumber(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;
        let new_number = ValueNote::new(number, owner);

        numbers.at(owner).replace(new_number).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            context.msg_sender(),
        ));
    }

    unconstrained fn getNumber(owner: AztecAddress) -> pub ValueNote {
        let numbers = storage.numbers;
        numbers.at(owner).view_note()
    }
}
