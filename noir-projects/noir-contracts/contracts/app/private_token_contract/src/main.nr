use dep::aztec::macros::aztec;

#[aztec]
pub contract PrivateToken {
    use dep::aztec::macros::{functions::{external, initializer}, storage::storage};
    use dep::aztec::protocol_types::address::AztecAddress;
    use dep::easy_private_state::EasyPrivateUint;

    #[storage]
    struct Storage<Context> {
        balances: EasyPrivateUint<Context>,
    }

    /**
     * initialize the contract's initial state variables.
     */
    #[external("private")]
    #[initializer]
    fn constructor(initial_supply: u64, owner: AztecAddress) {
        self.storage.balances.add(initial_supply, owner);
    }

    // Mints `amount` of tokens to `owner`.
    #[external("private")]
    fn mint(amount: u64, owner: AztecAddress) {
        self.storage.balances.add(amount, owner);
    }

    // Transfers `amount` of tokens from `sender` to a `recipient`.
    #[external("private")]
    fn transfer(amount: u64, sender: AztecAddress, recipient: AztecAddress) {
        self.storage.balances.sub(amount, sender);
        self.storage.balances.add(amount, recipient);
    }

    // Helper function to get the balance of a user.
    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> Field {
        self.storage.balances.get_value(owner)
    }
}
