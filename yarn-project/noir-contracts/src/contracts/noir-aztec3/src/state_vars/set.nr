use dep::std;
use crate::abi::Inputs;
use crate::context::PrivateFunctionContext;
use crate::notes::value_note::ValueNote;
use crate::notes::note_interface::NoteInterface;
use crate::types::point::Point;
use crate::state_vars::note_getter_data::NoteGetterData;
use crate::state_vars::note_getter_data::make_note_getter_data;
use crate::state_vars::note_getter_data::note_getter_data_len;

// #[oracle(notifyCreatedNote)]
// fn notify_created_note_oracle(
//     _storage_slot: Field,
//     _owner: Point,
//     _note: ValueNote,
// ) -> Field {}

// unconstrained fn notify_created_note(
//     storage_slot: Field,
//     owner: Point,
//     note: ValueNote,
// ) -> Field {
//     notify_created_note_oracle(storage_slot, owner, note)
// }

// #[oracle(notifyNullifiedNote)]
// fn notify_nullified_note_oracle(
//     _storage_slot: Field,
//     _nullifier: Field,
//     _note: ValueNote,
// ) -> Field {}

// unconstrained fn notify_nullified_note(
//     storage_slot: Field,
//     nullifier: Field,
//     note: ValueNote,
// ) -> Field {
//     notify_nullified_note_oracle(storage_slot, nullifier, note)
// }

// #[oracle(getNotes2)]
// fn get_notes_2_oracle(
//     _storage_slot: Field,
// ) -> [Field; 33] {}

// unconstrained fn get_notes_2_internal(
//     storage_slot: Field,
// ) -> [Field; 33] {
//     get_notes_2_oracle(storage_slot)
// }

// fn get_2_notes(storage_slot: Field) -> (NoteGetterData, NoteGetterData) {
//     let fields = get_notes_2_internal(storage_slot);
//     let data1 = make_note_getter_data(fields, 1);
//     let data2 = make_note_getter_data(fields, 1 + note_getter_data_len());
//     (data1, data2)
// }

// STUB
fn get_2_notes<Note>(storage_slot: Field, dummy: fn()->Note) -> (NoteGetterData<Note>, NoteGetterData<Note>) {
    let note = dummy();
    let leaf_index = storage_slot;
    let sibling_path = [1, 2, 3, 4, 5, 6, 7, 8];
    let root = 1;
    let data1 = NoteGetterData {
        note,
        leaf_index,
        sibling_path,
        root,
    };
    let data2 = data1;
    (data1, data2)
}

fn silo_note_hash_with_storage_slot(storage_slot: Field, note_hash: Field) -> Field {
    dep::std::hash::pedersen([
        crate::NOTE_HASH_WITH_STORAGE_SLOT_GENERATOR,
        storage_slot,
        note_hash
    ])[0]
}

fn silo_note_hash(contract_address: Field, storage_slot: Field, note_hash: Field) -> Field {
    let note_hash_with_storage_slot = silo_note_hash_with_storage_slot(note_hash, storage_slot);
    
    dep::std::hash::pedersen([
        crate::SILOED_NOTE_HASH_GENERATOR,
        contract_address,
        note_hash_with_storage_slot,
    ])[0]
}

struct Set<Note, N> {
    storage_slot: Field,
    note_interface: NoteInterface<Note, N>
}

impl<Note, N> Set<Note, N> {
    fn new(storage_slot: Field, note_interface: NoteInterface<Note, N>) -> Self {
        Set { storage_slot, note_interface }
    }

    fn insert(self, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let storage_slot = self.storage_slot;

        let compute_note_hash = self.note_interface.compute_note_hash;
        let note_hash = compute_note_hash(note);
        let note_hash_with_storage_slot = silo_note_hash_with_storage_slot(storage_slot, note_hash);

        // assert notify_created_note(storage_slot, note.owner, note) == 0;
        context.push_new_note_hash(note_hash_with_storage_slot)
    }

    // The `2` in the name is the number of notes returned
    fn get_2(self, inputs: Inputs, mut context: PrivateFunctionContext) -> (PrivateFunctionContext, (Note, Note)) {
        let storage_slot = self.storage_slot;

        let dummy = self.note_interface.dummy;
        let note_getter_data = get_2_notes(storage_slot, dummy);

        assert (note_getter_data.0.root == inputs.old_private_data_tree_root);
        assert (note_getter_data.1.root == inputs.old_private_data_tree_root);

        let notes = (note_getter_data.0.note, note_getter_data.1.note);
        (context, notes)
    }


    fn remove(self, inputs: Inputs, mut context: PrivateFunctionContext, note: Note) -> PrivateFunctionContext {
        let contract_address = inputs.call_context.storage_contract_address;
        let storage_slot = self.storage_slot;

        let compute_note_hash = self.note_interface.compute_note_hash;
        let mut note_hash = compute_note_hash(note);

        let siloed_note_hash = silo_note_hash(contract_address, storage_slot, note_hash);

        let compute_nullifier = self.note_interface.compute_nullifier;
        let mut nullifier = compute_nullifier(note, siloed_note_hash);

        // assert notify_nullified_note(storage_slot, nullifier, note) == 0;
        context.push_new_nullifier(nullifier)
    }
}
