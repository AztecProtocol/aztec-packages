// docs:start:easy_private_token_contract
use dep::aztec::macros::aztec;

#[aztec]
pub contract EasyPrivateToken {
    use dep::aztec::macros::{functions::{initializer, private, utility}, storage::storage};
    use dep::aztec::{protocol_types::address::AztecAddress, state_vars::Map};
    use dep::easy_private_state::EasyPrivateUint;
    use dep::value_note::balance_utils;

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, EasyPrivateUint<Context>, Context>,
    }

    /**
     * initialize the contract's initial state variables.
     */
    #[private]
    #[initializer]
    fn constructor(initial_supply: u64, owner: AztecAddress) {
        let balances = storage.balances;

        balances.at(owner).add(initial_supply, owner);
    }

    // Mints `amount` of tokens to `owner`.
    #[private]
    fn mint(amount: u64, owner: AztecAddress) {
        let balances = storage.balances;

        balances.at(owner).add(amount, owner);
    }

    // Transfers `amount` of tokens from `sender` to a `recipient`.
    #[private]
    fn transfer(amount: u64, sender: AztecAddress, recipient: AztecAddress) {
        let balances = storage.balances;

        balances.at(sender).sub(amount, sender);
        balances.at(recipient).add(amount, recipient);
    }

    // Helper function to get the balance of a user.
    #[utility]
    unconstrained fn get_balance(owner: AztecAddress) -> Field {
        let balances = storage.balances;

        // Return the sum of all notes in the set.
        balance_utils::get_balance(balances.at(owner).set)
    }
}
// docs:end:easy_private_token_contract
