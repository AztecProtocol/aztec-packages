use aztec::macros::aztec;

#[aztec]
pub contract NoteHashProof {
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::delivery::MessageDelivery,
        note::{lifecycle::NewNote, note_interface::{NoteHash, NoteType}, NoteMessage},
        oracle::notes::notify_created_note,
        protocol::{address::AztecAddress, traits::Packable},
        state_vars::{Owned, StateVariable},
    };
    use balance_set::BalanceSet;
    use uint_note::UintNote;

    #[storage]
    struct Storage<Context> {
        notes: Owned<BalanceSet<Context>, Context>,
    }

    // docs:start:create_note
    /// Creates a note of `value` owned by the caller, with randomness the caller chose, so the caller can later prove
    /// knowledge of the note's contents outside Aztec.
    ///
    /// `randomness` must be fresh for every call and kept secret: anyone who learns it can test guesses of the owner
    /// and value against the public note hash. The library's own `create_note` also mixes in the side-effect counter
    /// so that two notes in one transaction never share a hash; this function does not, so a transaction must not
    /// call it twice with the same arguments.
    #[external("private")]
    fn create_note(value: u128, randomness: Field) {
        let owner = self.msg_sender();
        let storage_slot = self.storage.notes.get_storage_slot();
        let note = UintNote { value };
        let note_hash_counter = self.context.get_side_effect_counter();
        let note_hash = note.compute_note_hash(owner, storage_slot, randomness);

        notify_created_note(
            owner,
            storage_slot,
            randomness,
            UintNote::get_id(),
            note.pack(),
            note_hash,
            note_hash_counter,
        );
        self.context.push_note_hash(note_hash);

        NoteMessage::new(
            NewNote { note, owner, storage_slot, randomness, note_hash_counter },
            self.context,
        )
            .deliver(MessageDelivery::onchain_constrained());
    }
    // docs:end:create_note

    // docs:start:note_hash
    /// The note hash `create_note` computes for these arguments, before the protocol silos it to this contract and
    /// makes it unique.
    #[external("utility")]
    unconstrained fn note_hash(owner: AztecAddress, value: u128, randomness: Field) -> Field {
        UintNote { value }.compute_note_hash(owner, self.storage.notes.get_storage_slot(), randomness)
    }
    // docs:end:note_hash

    /// The sum of `owner`'s note values that the caller's PXE holds.
    #[external("utility")]
    unconstrained fn balance_of(owner: AztecAddress) -> u128 {
        self.storage.notes.at(owner).balance_of()
    }
}
