use aztec::macros::aztec;

#[aztec]
pub contract Counter {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::Owned,
    };
    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        // Each owner has their own counter, stored as private encrypted notes.
        // Owned: dictates who will receive the encrypted notes.
        // BalanceSet: manages the underlying notes, providing add/sub/balance_of.
        counters: Owned<BalanceSet<Context>, Context>,
    }

    // Sets the owner's counter to an initial value.
    //
    // #[external("private")]: executes on the user's device, inputs are hidden from everyone.
    #[initializer]
    #[external("private")]
    fn constructor(initial_value: u128, owner: AztecAddress) {
        // Delivers the note to the recipient onchain with provable correctness.
        // Without delivery, the recipient can't find or decrypt the note.
        self.storage.counters.at(owner).add(initial_value).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    // Adds 1 to the owner's counter.
    #[external("private")]
    fn increment(owner: AztecAddress) {
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());
    }

    // Returns the current value of the owner's counter.
    //
    // #[external("utility")]: runs off-chain, no transaction created, no cost.
    // Only the owner can decrypt and read their own counter.
    #[external("utility")]
    unconstrained fn get_counter(owner: AztecAddress) -> u128 {
        self.storage.counters.at(owner).balance_of()
    }
}
