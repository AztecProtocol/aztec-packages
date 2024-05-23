// Small "escrow" contract that holds funds on behalf of some entity. Very simple.
// Anyone can deposit (donate) into it, but only the owner can withdraw.
contract SimpleEscrow {
    use dep::aztec::prelude::{AztecAddress, SharedImmutable};

    use dep::escrowable_token::EscrowableToken;
    use dep::escrowable_token::types::option_address::AztecAddressOption;

    #[aztec(storage)]
    struct Storage {
        token: SharedImmutable<AztecAddress>,
        owner: SharedImmutable<AztecAddress>,
    }

    // Creates a new instance
    #[aztec(public)]
    #[aztec(initializer)]
    fn constructor(token: AztecAddress, owner: AztecAddress) {
        storage.token.initialize(token);
        storage.owner.initialize(owner);
    }

    /**
     * Donate to the account
     * 
     * Primarily a helper function to avoid providing wrong `sage` arguments
     * to a transfer call.
     *
     * @param amount: The amount to donate to the vault
     * @param nonce: The nonce of the transaction for the authwit
     */
    #[aztec(private)]
    fn donate(amount: Field, nonce: Field) {
        let this = context.this_address();
        let sender = context.msg_sender();
        let token_address = storage.token.read_private();

        let sender_wrapped_option = AztecAddressOption::new(Option::some(sender));
        let owner = storage.owner.read_private();
        let owner_wrapped_option = AztecAddressOption::new(Option::some(owner));

        EscrowableToken::at(token_address).transfer(
            sender,
            this,
            amount,
            nonce,
            sender_wrapped_option,
            owner_wrapped_option,
            sender_wrapped_option
        ).call(&mut context);
    }

    /**
     * Transfer funds from the vault to a recipient
     *
     * Only callable by the owner
     * Sets the change values to be the owner himself.
     * 
     */
    #[aztec(private)]
    fn transfer(to: AztecAddress, amount: Field, sage: AztecAddressOption) {
        let owner = storage.owner.read_private();
        assert_eq(context.msg_sender(), owner, "only callable by the owner");
        let owner_wrapped_option = AztecAddressOption::new(Option::some(owner));

        let this = context.this_address();
        let token_address = storage.token.read_private();

        EscrowableToken::at(token_address).transfer(
            this,
            to,
            amount,
            0,
            owner_wrapped_option,
            sage,
            owner_wrapped_option
        ).call(&mut context);
    }
}
