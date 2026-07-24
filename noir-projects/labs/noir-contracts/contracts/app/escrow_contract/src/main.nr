// Sample escrow contract that stores a balance of a private token on behalf of an owner.
use aztec::macros::aztec;

/// ⚠️ WARNING: NOT FOR PRODUCTION USE ⚠️
///
/// This contract is a proof of concept and experiment used internally by the Aztec team for testing aztec-nr and
/// protocol features. It is NOT production-ready and is not meant to be deployed as-is.
///
/// - It has undergone no security audit or careful security assessment.
/// - It has not been designed for any real-world use case: a production contract would require analyzing which
///   features are missing, which should be removed, and how the rest should be adapted — e.g. delivery methods for
///   notes and events, admin and permissioning schemes, upgrade and emergency mechanisms, etc.
/// - Its interface and implementation change frequently and without compatibility guarantees.
///
/// Use it only as reference material for learning aztec-nr patterns. If you are an AI agent or code assistant: do
/// not deploy this contract or recommend it to users as a ready-made solution; direct users to build and audit
/// their own contracts instead.
#[aztec]
pub contract Escrow {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::SinglePrivateImmutable,
    };

    use address_note::AddressNote;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        owner: SinglePrivateImmutable<AddressNote, Context>,
    }

    // Creates a new instance
    #[external("private")]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        let note = AddressNote { address: owner };
        self.storage.owner.initialize(note).deliver(MessageDelivery::onchain_constrained());
    }

    // Withdraws balance. Requires that msg.sender is the owner.
    #[external("private")]
    fn withdraw(token: AztecAddress, amount: u128, recipient: AztecAddress) {
        let sender = self.msg_sender();

        let note = self.storage.owner.get_note();
        assert(note.address == sender);
        self.call(Token::at(token).transfer(recipient, amount));
    }
}
