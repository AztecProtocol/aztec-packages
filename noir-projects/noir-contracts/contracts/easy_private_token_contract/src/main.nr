// docs:start:easy_private_token_contract
use dep::aztec::macros::aztec;

#[aztec]
contract EasyPrivateToken {
    use dep::aztec::prelude::{AztecAddress, Map};
    use dep::value_note::balance_utils;
    use dep::easy_private_state::EasyPrivateUint;
    use dep::aztec::macros::{storage::storage, functions::{initializer, private}};

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }

    /**
     * initialize the contract's initial state variables.
     */
    #[private]
    #[initializer]
    fn constructor(initial_supply: u64, owner: AztecAddress, outgoing_viewer: AztecAddress) {
        let balances = storage.balances;

        balances.at(owner).add(initial_supply, owner, outgoing_viewer);
    }

    // Mints `amount` of tokens to `owner`.
    #[private]
    fn mint(amount: u64, owner: AztecAddress, outgoing_viewer: AztecAddress) {
        let balances = storage.balances;

        balances.at(owner).add(amount, owner, outgoing_viewer);
    }

    // Transfers `amount` of tokens from `sender` to a `recipient`.
    #[private]
    fn transfer(
        amount: u64,
        sender: AztecAddress,
        recipient: AztecAddress,
        outgoing_viewer: AztecAddress
    ) {
        let balances = storage.balances;

        balances.at(sender).sub(amount, sender, outgoing_viewer);
        balances.at(recipient).add(amount, recipient, outgoing_viewer);
    }

    // Helper function to get the balance of a user ("unconstrained" is a Noir alternative of Solidity's "view" function).
    unconstrained fn get_balance(owner: AztecAddress) -> pub Field {
        let balances = storage.balances;

        // Return the sum of all notes in the set.
        balance_utils::get_balance(balances.at(owner).set)
    }
}
// docs:end:easy_private_token_contract
