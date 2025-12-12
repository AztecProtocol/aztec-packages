use dep::aztec::macros::aztec;

#[aztec]
pub contract PrivateToken {
    use dep::aztec::macros::{functions::{external, initializer}, storage::storage};
    use dep::aztec::messages::message_delivery::MessageDelivery;
    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::aztec::state_vars::Owned;
    use dep::balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
    }

    /**
     * initialize the contract's initial state variables.
     */
    #[external("private")]
    #[initializer]
    fn constructor(initial_supply: u64, owner: AztecAddress) {
        self.storage.balances.at(owner).add(initial_supply as u128).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    // Mints `amount` of tokens to `owner`.
    #[external("private")]
    fn mint(amount: u64, owner: AztecAddress) {
        self.storage.balances.at(owner).add(amount as u128).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    // Transfers `amount` of tokens from `sender` to a `recipient`.
    #[external("private")]
    fn transfer(amount: u64, sender: AztecAddress, recipient: AztecAddress) {
        self.storage.balances.at(sender).sub(amount as u128).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
        self.storage.balances.at(recipient).add(amount as u128).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    // Helper function to get the balance of a user.
    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> u128 {
        self.storage.balances.at(owner).balance_of()
    }
}
