// Sample escrow contract that stores a balance of a private token on behalf of an owner.
use aztec::macros::aztec;

#[aztec]
pub contract Escrow {
    use aztec::{
        event::event_interface::MessageDelivery,
        macros::{functions::{initializer, private}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::PrivateImmutable,
    };

    // docs:start:addressnote_import
    use address_note::address_note::AddressNote;
    // docs:end:addressnote_import
    use token::Token;

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
        storage.owner.initialize(note).emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // docs:start:withdraw
    // Withdraws balance. Requires that msg.sender is the owner.
    #[private]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        let sender = context.msg_sender();

        let note = storage.owner.get_note();
        assert(note.get_address() == sender);
        // docs:start:call_function
        Token::at(token).transfer(recipient, amount).call(&mut context);
        // docs:end:call_function
    }
    // docs:end:withdraw
}
