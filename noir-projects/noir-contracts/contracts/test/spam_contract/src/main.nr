mod types;

use dep::aztec::macros::aztec;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
#[aztec]
pub contract Spam {

    use dep::aztec::{
        macros::{functions::{internal, private, public}, storage::storage},
        messages::logs::note::encode_and_encrypt_note_unconstrained,
        protocol_types::{
            address::AztecAddress,
            constants::{
                GENERATOR_INDEX__NOTE_NULLIFIER, MAX_NOTE_HASHES_PER_CALL, MAX_NULLIFIERS_PER_CALL,
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
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

    #[private]
    fn spam(nullifier_seed: Field, nullifier_count: u32, call_public: bool) {
        let caller = context.msg_sender();
        let amount = 1 as u128;

        for _ in 0..MAX_NOTE_HASHES_PER_CALL {
            storage.balances.at(caller).add(caller, amount).emit(
                encode_and_encrypt_note_unconstrained(&mut context, caller, caller),
            );
        }

        for i in 0..MAX_NULLIFIERS_PER_CALL {
            if (i < nullifier_count) {
                context.push_nullifier(poseidon2_hash_with_separator(
                    [nullifier_seed, i as Field],
                    GENERATOR_INDEX__NOTE_NULLIFIER as Field,
                ));
            }
        }

        if (call_public) {
            Spam::at(context.this_address())
                .public_spam(0, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL)
                .enqueue(&mut context);
            Spam::at(context.this_address())
                .public_spam(
                    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
                    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
                )
                .enqueue(&mut context);
        }
    }

    #[public]
    #[internal]
    fn public_spam(start: u32, end: u32) {
        let one = 1 as u128;
        for i in start..end {
            let prev = storage.public_balances.at(i as Field).read();
            storage.public_balances.at(i as Field).write(prev + one);
        }
    }
}
