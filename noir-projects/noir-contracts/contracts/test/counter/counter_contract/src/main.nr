use aztec::macros::aztec;

#[aztec]
pub contract Counter {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        oracle::logging::debug_log_format,
        protocol::{address::AztecAddress, traits::ToField},
        state_vars::Owned,
    };
    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        counters: Owned<BalanceSet<Context>, Context>,
    }

    #[initializer]
    #[external("private")]
    // We can name our initializer anything we want as long as it's marked as aztec(initializer)
    fn initialize(headstart: u64, owner: AztecAddress) {
        self.storage.counters.at(owner).add(headstart as u128).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn increment(owner: AztecAddress) {
        debug_log_format("Incrementing counter for owner {0}", [owner.to_field()]);
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn increment_twice(owner: AztecAddress) {
        debug_log_format(
            "Incrementing counter twice for owner {0}",
            [owner.to_field()],
        );
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn increment_and_decrement(owner: AztecAddress) {
        debug_log_format(
            "Incrementing and decrementing counter for owner {0}",
            [owner.to_field()],
        );
        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());
        self.storage.counters.at(owner).sub(1).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn decrement(owner: AztecAddress) {
        debug_log_format("Decrementing counter for owner {0}", [owner.to_field()]);
        self.storage.counters.at(owner).sub(1).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("utility")]
    unconstrained fn get_counter(owner: AztecAddress) -> u128 {
        self.storage.counters.at(owner).balance_of()
    }

    #[external("private")]
    fn increment_self_and_other(other_counter: AztecAddress, owner: AztecAddress) {
        debug_log_format("Incrementing counter for other {0}", [owner.to_field()]);

        self.storage.counters.at(owner).add(1).deliver(MessageDelivery::onchain_constrained());

        self.call(Counter::at(other_counter).increment(owner));
    }
}
