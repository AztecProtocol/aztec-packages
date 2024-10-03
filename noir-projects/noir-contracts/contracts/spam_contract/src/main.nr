mod types;

use dep::aztec::macros::aztec;

// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
#[aztec]
contract Spam {

    global MAX_EXTERNAL_CALL_SPAM = 4;

    use dep::aztec::{
        prelude::{Map, AztecAddress, PublicMutable},
        encrypted_logs::{encrypted_note_emission::encode_and_encrypt_note_unconstrained},
        keys::getters::get_public_keys,
        protocol_types::{
        hash::poseidon2_hash_with_separator,
        constants::{
        MAX_NOTE_HASHES_PER_CALL, MAX_NULLIFIERS_PER_CALL, GENERATOR_INDEX__NOTE_NULLIFIER,
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL
    }
    },
        macros::{storage::storage, functions::{private, public, internal}}
    };

    use crate::types::{token_note::TokenNote, balance_set::BalanceSet};

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, BalanceSet<TokenNote, Context>, Context>,
        public_balances: Map<Field, PublicMutable<U128, Context>, Context>,
    }

    #[private]
    fn spam(
        nullifier_seed: Field,
        nullifier_count: u32,
        call_public: bool,
        call_recursive_spam: bool
    ) {
        let caller = context.msg_sender();
        let caller_keys = get_public_keys(caller);
        let amount = U128::from_integer(1);

        for _ in 0..MAX_NOTE_HASHES_PER_CALL {
            storage.balances.at(caller).add(caller_keys.npk_m, U128::from_integer(amount)).emit(
                encode_and_encrypt_note_unconstrained(&mut context, caller_keys.ovpk_m, caller_keys.ivpk_m, caller)
            );
        }

        for i in 0..MAX_NULLIFIERS_PER_CALL {
            if (i < nullifier_count) {
                context.push_nullifier(
                    poseidon2_hash_with_separator(
                        [nullifier_seed, i as Field],
                        GENERATOR_INDEX__NOTE_NULLIFIER as Field
                    )
                );
            }
        }

        if (call_public) {
            Spam::at(context.this_address()).public_spam(0, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL).enqueue(&mut context);
            Spam::at(context.this_address()).public_spam(
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
                MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
            ).enqueue(&mut context);
        }

        if (call_recursive_spam) {
            Spam::at(context.this_address()).public_spam_with_external_call(0, MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL).enqueue(&mut context);
        }
    }

    #[public]
    #[internal]
    fn public_spam(start: u32, end: u32) {
        let one = U128::from_integer(1);
        for i in start..end {
            let prev = storage.public_balances.at(i as Field).read();
            storage.public_balances.at(i as Field).write(prev + one);
        }
    }

    // TODO(md): add something to the public spam such that we can test further enqueued calls
    #[public]
    #[internal]
    fn public_spam_with_external_call(start: u32, end: u32) {
        let one = U128::from_integer(1);
        for i in start..end {
            let prev = storage.public_balances.at(i as Field).read();
            storage.public_balances.at(i as Field).write(prev + one);
        }

        Spam::at(context.this_address()).recursive_spam(0).call(&mut context);
    }

    #[public]
    fn recursive_spam(counter: u32) {
        let one = U128::from_integer(1);
        if (counter < MAX_EXTERNAL_CALL_SPAM) {
            let prev = storage.public_balances.at(counter as Field).read();
            storage.public_balances.at(counter as Field).write(prev + one);

            Spam::at(context.this_address()).recursive_spam(counter + 1).call(&mut context);
        }
    }
}
