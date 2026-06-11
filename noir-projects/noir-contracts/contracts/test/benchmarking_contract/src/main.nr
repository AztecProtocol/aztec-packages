// A contract used for running benchmarks.
// We should try to change this contract as little as possible, since any modification
// would alter the metrics we're capturing in the benchmarks, and we want to keep the
// subject being tested as unmodified as possible so we can detect metric changes that

use aztec::macros::aztec;

#[aztec]
pub contract Benchmarking {
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
        oracle::random::random,
        protocol::{
            address::{AztecAddress, EthAddress},
            constants::{
                CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, MAX_L2_TO_L1_MSGS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
                MAX_NULLIFIERS_PER_CALL, MAX_PRIVATE_LOGS_PER_CALL, PRIVATE_LOG_CIPHERTEXT_LEN,
            },
        },
        state_vars::{Map, Owned, PrivateSet, PublicMutable},
    };
    use field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        notes: Owned<PrivateSet<FieldNote, Context>, Context>,
        balances: Map<AztecAddress, PublicMutable<Field, Context>, Context>,
    }

    // Creates a new value note for the target owner. Use this method to seed an initial set of notes.
    #[external("private")]
    fn create_note(owner: AztecAddress, value: Field) {
        let note = FieldNote { value };
        self.storage.notes.at(owner).insert(note).deliver(MessageDelivery::onchain_constrained().with_sender(self
            .msg_sender()));
    }
    // Deletes a note at a specific index in the set and creates a new one with the same value.
    // We explicitly pass in the note index so we can ensure we consume different notes when sending
    // multiple txs that will land on the same block.
    // See https://discourse.aztec.network/t/utxo-concurrency-issues-for-private-state/635
    // by @rahul-kothari for a full explanation on why this is needed.
    #[external("private")]
    fn recreate_note(owner: AztecAddress, index: u32) {
        let owner_notes = self.storage.notes.at(owner);
        let mut getter_options = NoteGetterOptions::new();
        let notes = owner_notes.pop_notes(getter_options.set_limit(1).set_offset(index));
        let note = notes.get(0);
        owner_notes.insert(note).deliver(MessageDelivery::onchain_constrained().with_sender(self.msg_sender()));
    }

    // Reads and writes to public storage and enqueues a call to another public function.
    #[external("public")]
    fn increment_balance(owner: AztecAddress, value: Field) {
        let current = self.storage.balances.at(owner).read();
        self.storage.balances.at(owner).write(current + value);
        self.call_self.broadcast(owner);
    }

    // Emits a public log.
    #[external("public")]
    fn broadcast(owner: AztecAddress) {
        self.context.emit_public_log_unsafe(0, self.storage.balances.at(owner).read());
    }

    // Does a bunch of heavy compute
    #[external("public")]
    fn sha256_hash_1024(data: [u8; 1024]) -> [u8; 32] {
        sha256::sha256_var(data, data.len())
    }

    // Lightest possible private transaction: empty app circuit, no state changes, no public calls.
    #[external("private")]
    fn noop() {}

    #[external("private")]
    fn emit_nullifiers() {
        // Safety: Benchmarking code
        let random_seed = unsafe { random() };
        for i in 0..MAX_NULLIFIERS_PER_CALL {
            self.context.push_nullifier_unsafe(random_seed + (i as Field));
        }
    }

    #[external("private")]
    fn emit_note_hashes() {
        // Safety: Benchmarking code
        let random_seed = unsafe { random() };

        for i in 0..MAX_NOTE_HASHES_PER_CALL {
            self.context.push_note_hash(random_seed + (i as Field));
        }
    }

    #[external("private")]
    fn emit_l2_to_l1_msgs() {
        // Safety: Benchmarking code
        let random_seed = unsafe { random() };

        for i in 0..MAX_L2_TO_L1_MSGS_PER_CALL {
            let recipient = EthAddress::from_field((random_seed as u128) as Field + (i as Field));
            self.context.message_portal(recipient, random_seed + (i + 1) as Field);
        }
    }

    #[external("private")]
    fn emit_private_logs() {
        // Safety: Benchmarking code
        let random_seed = unsafe { random() };

        for i in 0..MAX_PRIVATE_LOGS_PER_CALL {
            let mut log: BoundedVec<Field, PRIVATE_LOG_CIPHERTEXT_LEN> = BoundedVec::new();
            for j in 0..PRIVATE_LOG_CIPHERTEXT_LEN {
                log.push(random_seed + (i * MAX_PRIVATE_LOGS_PER_CALL + j) as Field);
            }
            self.context.emit_private_log_unsafe(0, log);
        }
    }

    #[external("private")]
    fn emit_contract_class_log() {
        // Safety: Benchmarking code
        let random_seed = unsafe { random() };

        let mut log = [0; CONTRACT_CLASS_LOG_SIZE_IN_FIELDS];
        for i in 0..log.len() {
            log[i] = random_seed + (i as Field);
        }
        self.context.emit_contract_class_log(log);
    }

    // Lightest possible private transaction: empty app circuit, no state changes, no public calls.
    #[external("public")]
    fn noop_pub() {}
}
