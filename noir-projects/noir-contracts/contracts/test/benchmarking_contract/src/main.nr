// A contract used for running benchmarks.
// We should try to change this contract as little as possible, since any modification
// would alter the metrics we're capturing in the benchmarks, and we want to keep the
// subject being tested as unmodified as possible so we can detect metric changes that

use aztec::macros::aztec;

#[aztec]
pub contract Benchmarking {
    use aztec::{
        macros::{functions::{private, public}, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateSet, PublicMutable},
    };
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        notes: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
        balances: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    // Creates a new value note for the target owner. Use this method to seed an initial set of notes.
    #[private]
    fn create_note(owner: AztecAddress, value: Field) {
        let note = ValueNote::new(value, owner);
        storage.notes.at(owner).insert(note).emit(
            &mut context,
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }
    // Deletes a note at a specific index in the set and creates a new one with the same value.
    // We explicitly pass in the note index so we can ensure we consume different notes when sending
    // multiple txs that will land on the same block.
    // See https://discourse.aztec.network/t/utxo-concurrency-issues-for-private-state/635
    // by @rahul-kothari for a full explanation on why this is needed.
    #[private]
    fn recreate_note(owner: AztecAddress, index: u32) {
        let owner_notes = storage.notes.at(owner);
        let mut getter_options = NoteGetterOptions::new();
        let notes = owner_notes.pop_notes(getter_options.set_limit(1).set_offset(index));
        let note = notes.get(0);
        owner_notes.insert(note).emit(&mut context, owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Reads and writes to public storage and enqueues a call to another public function.
    #[public]
    fn increment_balance(owner: AztecAddress, value: Field) {
        let current = storage.balances.at(owner).read();
        storage.balances.at(owner).write(current + value);
        Benchmarking::at(context.this_address()).broadcast(owner).call(&mut context);
    }

    // Emits a public log.
    #[public]
    fn broadcast(owner: AztecAddress) {
        context.emit_public_log(storage.balances.at(owner).read());
    }

    // Does a bunch of heavy compute
    #[public]
    fn sha256_hash_1024(data: [u8; 1024]) -> [u8; 32] {
        sha256::sha256_var(data, data.len() as u64)
    }
}
