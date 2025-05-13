// Sample escrow contract that stores a balance of a private token on behalf of an owner.
use dep::aztec::macros::aztec;

mod test;

#[aztec]
pub contract Escrow {
    use dep::aztec::{
        macros::{functions::{initializer, private}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
    };
    use dep::aztec::prelude::{AztecAddress, PrivateImmutable};

    // docs:start:addressnote_import
    use dep::address_note::address_note::AddressNote;
    // docs:end:addressnote_import
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        owner: PrivateImmutable<AddressNote, Context>,
    }

    // Creates a new instance
    #[private]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        // docs:start:addressnote_new
        let note = AddressNote::new(owner, owner);
        // docs:end:addressnote_new
        storage.owner.initialize(note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            context.msg_sender(),
        ));
    }

    // Withdraws balance. Requires that msg.sender is the owner.
    #[private]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        let sender = context.msg_sender();

        let note = storage.owner.get_note();
        assert(note.address == sender);
        // docs:start:call_function
        Token::at(token).transfer(recipient, amount).call(&mut context);
        // docs:end:call_function
    }
}
