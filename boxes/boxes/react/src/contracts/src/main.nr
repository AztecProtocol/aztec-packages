use dep::aztec::macros::aztec;

#[aztec]
contract BoxReact {
    use dep::aztec::{
        messages::logs::note::encode_and_encrypt_note,
        macros::{functions::{initializer, private, utility}, storage::storage},
        prelude::{AztecAddress, Map, PrivateMutable},
    };
    use dep::value_note::value_note::ValueNote;

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

    #[utility]
    unconstrained fn getNumber(owner: AztecAddress) -> ValueNote {
        let numbers = storage.numbers;
        numbers.at(owner).view_note()
    }
}
