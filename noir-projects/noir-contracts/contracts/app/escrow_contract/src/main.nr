// Sample escrow contract that stores a balance of a private token on behalf of an owner.
use aztec::macros::aztec;

#[aztec]
pub contract Escrow {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
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
    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        let note = AddressNote::new(owner, owner);
        self.storage.owner.initialize(note).emit(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Withdraws balance. Requires that msg.sender is the owner.
    #[external("private")]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        let sender = self.msg_sender().unwrap();

        let note = self.storage.owner.get_note();
        assert(note.get_address() == sender);
        Token::at(token).transfer(recipient, amount).call(self.context);
    }
}
