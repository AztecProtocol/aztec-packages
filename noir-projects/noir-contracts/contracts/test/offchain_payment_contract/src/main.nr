use aztec::macros::aztec;

#[aztec]
contract OffchainPayment {
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        protocol::address::AztecAddress,
        state_vars::Owned,
    };

    use balance_set::BalanceSet;

    #[storage]
    struct Storage {
        balances: Owned<BalanceSet>,
    }

    #[external("private")]
    fn mint(amount: u128, recipient: AztecAddress) {
        // Minted notes are delivered onchain to ensure the recipient can always discover them.
        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn transfer_offchain(amount: u128, recipient: AztecAddress) {
        let sender = self.msg_sender();

        // Sender change note and recipient note are both delivered offchain.
        self.storage.balances.at(sender).sub(amount).deliver(MessageDelivery::offchain());

        self.storage.balances.at(recipient).add(amount).deliver(MessageDelivery::offchain());
    }

    #[external("utility")]
    unconstrained fn get_balance(owner: AztecAddress) -> u128 {
        self.storage.balances.at(owner).balance_of()
    }
}
