mod types;

use aztec::macros::aztec;

#[aztec]
pub contract Spam {

    use aztec::{
        macros::{functions::{external, only_self}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::{
            address::AztecAddress,
            constants::{
                GENERATOR_INDEX__NOTE_NULLIFIER, MAX_NOTE_HASHES_PER_CALL, MAX_NULLIFIERS_PER_CALL,
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            },
            hash::poseidon2_hash_with_separator,
        },
        state_vars::{Map, PublicMutable},
    };

    use crate::types::{balance_set::BalanceSet, token_note::TokenNote};

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, BalanceSet<TokenNote, Context>, Context>,
        public_balances: Map<Field, PublicMutable<u128, Context>, Context>,
    }

    #[external("private")]
    fn spam(nullifier_seed: Field, nullifier_count: u32, call_public: bool) {
        let caller = self.msg_sender().unwrap();
        let amount = 1 as u128;

        for _ in 0..MAX_NOTE_HASHES_PER_CALL {
            self.storage.balances.at(caller).add(caller, amount).emit(
                caller,
                MessageDelivery.UNCONSTRAINED_ONCHAIN,
            );
        }

        for i in 0..MAX_NULLIFIERS_PER_CALL {
            if (i < nullifier_count) {
                self.context.push_nullifier(poseidon2_hash_with_separator(
                    [nullifier_seed, i as Field],
                    GENERATOR_INDEX__NOTE_NULLIFIER as Field,
                ));
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
