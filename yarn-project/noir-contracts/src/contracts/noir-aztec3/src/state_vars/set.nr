use dep::std;
use crate::abi::Inputs;
use crate::context::PrivateFunctionContext;
use crate::notes::value_note::Note;
use crate::notes::value_note::NOTE_LEN;
use crate::types::point::Point;
use crate::utils::arr_copy_slice;

#[oracle(notifyCreatedNote)]
fn notify_created_note_oracle(
    _storage_slot: Field,
    _owner: Point,
    _note: Note,
) -> Field {}

unconstrained fn notify_created_note(
    storage_slot: Field,
    owner: Point,
    note: Note,
) -> Field {
    notify_created_note_oracle(storage_slot, owner, note)
}

#[oracle(notifyNullifiedNote)]
fn notify_nullified_note_oracle(
    _storage_slot: Field,
    _nullifier: Field,
    _note: Note,
) -> Field {}

unconstrained fn notify_nullified_note(
    storage_slot: Field,
    nullifier: Field,
    note: Note,
) -> Field {
    notify_nullified_note_oracle(storage_slot, nullifier, note)
}

#[oracle(getNotes2)]
fn get_notes_2_oracle(
    _storage_slot: Field,
) -> [Field; 13] {}

unconstrained fn get_notes_2_internal(
    storage_slot: Field,
) -> [Field; 13] {
    get_notes_2_oracle(storage_slot)
}

fn get_2_notes(storage_slot: Field) -> (Note, Note) {
    let fields = get_notes_2_internal(storage_slot);
    let note1 = Note::deserialize(arr_copy_slice(fields, [0; NOTE_LEN], 1));
    let note2 = Note::deserialize(arr_copy_slice(fields, [0; NOTE_LEN],  1 + NOTE_LEN));
    (note1, note2)
}

struct Set {
    storage_slot: Field,
}

impl Set {
    fn new(storage_slot: Field) -> Set {
        Set { storage_slot }
    }

    fn insert(self, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let storage_slot = self.storage_slot;

        let note_hash = note.compute_note_hash();

        constrain notify_created_note(storage_slot, note.owner, note) == 0;
        context.push_new_note_hash(note_hash)
    }

    // The `2` in the name is the number of notes returned
    fn get_2(self, mut context: PrivateFunctionContext) -> (PrivateFunctionContext, (Note, Note)) {
        let storage_slot = self.storage_slot;

        let notes = get_2_notes(storage_slot);

        let note0_hash = notes.0.compute_note_hash();
        let note1_hash = notes.1.compute_note_hash();

        (
            context
                .push_read_request(note0_hash)
                .push_read_request(note1_hash),
            notes
        )
    }


    fn remove(self, inputs: Inputs, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        let note_hash = note.compute_note_hash();
        let siloed_note_hash = dep::std::hash::pedersen([
            crate::NoteStorageSlot,
            note_hash,
            storage_slot,
            contract_address,
        ])[0];

        let mut nullifier = note.compute_nullifier(siloed_note_hash);
        // TODO remove this when we can specify hash index
        nullifier = note.compute_nullifier(note_hash);

        constrain notify_nullified_note(storage_slot, nullifier, note) == 0;
        context.push_new_nullifier(nullifier)
    }
}
