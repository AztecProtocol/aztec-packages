// Sample escrow contract that stores a balance of a private token on behalf of an owner.
contract Escrow {
    use dep::aztec::prelude::{AztecAddress, EthAddress, FunctionSelector, NoteHeader, PrivateContext, PrivateImmutable};

    use dep::aztec::{context::{PublicContext, Context}, oracle::get_public_key::get_public_key, keys::getters::get_npk_m_h};

    use dep::address_note::address_note::AddressNote;

    use dep::token::Token;

    #[aztec(storage)]
    struct Storage {
        owner: PrivateImmutable<AddressNote>,
    }

    // Creates a new instance
    #[aztec(private)]
    #[aztec(initializer)]
    fn constructor(owner: pub AztecAddress) {
        let owner_npk_m_h = get_npk_m_h(&mut context, owner);

        let mut note = AddressNote::new(owner, owner_npk_m_h);
        storage.owner.initialize(&mut note, true);
    }

    // Withdraws balance. Requires that msg.sender is the owner.
    #[aztec(private)]
    fn withdraw(token: AztecAddress, amount: Field, recipient: AztecAddress) {
        let this = context.this_address();
        let sender = context.msg_sender();

        let note = storage.owner.get_note();
        assert(note.address == sender);

        Token::at(token).transfer(this, recipient, amount, 0).call(&mut context);
    }
}
