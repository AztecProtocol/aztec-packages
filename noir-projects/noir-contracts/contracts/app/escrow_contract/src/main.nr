// Sample escrow contract that stores a balance of a private token on behalf of an owner.
use aztec::macros::aztec;

#[aztec]
pub contract Escrow {
    use aztec::{
        macros::{functions::{initializer, private}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };

    use address_note::address_note::AddressNote;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        owner: PrivateImmutable<AddressNote, Context>,
    }

    // Creates a new instance
    #[private]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        let note = AddressNote::new(owner, owner);
        storage.owner.initialize(note).emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Withdraws balance. Requires that msg.sender is the owner.
    #[private]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        let sender = context.msg_sender();

        let note = storage.owner.get_note();
        assert(note.get_address() == sender);
        Token::at(token).transfer(recipient, amount).call(&mut context);
    }
}
