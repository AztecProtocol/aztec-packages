use aztec::macros::aztec;

#[aztec]
pub contract Spam {

    use aztec::{
        macros::{functions::{external, only_self}, storage::storage},
        messages::delivery::MessageDelivery,
        note::utils::compute_note_nullifier,
        protocol::constants::{
            MAX_NOTE_HASHES_PER_CALL, MAX_NULLIFIERS_PER_CALL, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        },
        state_vars::{Map, Owned, PublicMutable},
    };

    use balance_set::BalanceSet;

    #[storage]
    struct Storage<Context> {
        balances: Owned<BalanceSet<Context>, Context>,
        public_balances: Map<Field, PublicMutable<u128, Context>, Context>,
    }

    #[external("private")]
    fn spam(nullifier_seed: Field, nullifier_count: u32, call_public: bool) {
        let caller = self.msg_sender();

        for _ in 0..MAX_NOTE_HASHES_PER_CALL {
            self.storage.balances.at(caller).add(1).deliver(MessageDelivery::onchain_unconstrained());
        }

        for i in 0..MAX_NULLIFIERS_PER_CALL {
            if (i < nullifier_count) {
                self.context.push_nullifier_unsafe(compute_note_nullifier(nullifier_seed, [i as Field]));
            }
        }

        if (call_public) {
            self.enqueue_self.public_spam(0, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX);
            self.enqueue_self.public_spam(
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            );
        }
    }

    #[external("public")]
    #[only_self]
    fn public_spam(start: u32, end: u32) {
        let one = 1 as u128;
        for i in start..end {
            let prev = self.storage.public_balances.at(i as Field).read();
            self.storage.public_balances.at(i as Field).write(prev + one);
        }
    }
}
